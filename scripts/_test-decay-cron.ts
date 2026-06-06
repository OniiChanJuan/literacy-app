/**
 * Smoke test for Stage 2c decay + event-pruning.
 *
 * Exercises the SQL the cron route runs against a couple of crafted
 * connection_events rows + temporarily-adjusted quality scores, then
 * reverts state. Doesn't need the dev server.
 */
import "dotenv/config";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PG_URL = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const RUN_ID = Math.random().toString(36).slice(2, 10);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function main() {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  let testUid: string | null = null;

  try {
    console.log("\n=== Setup ===\n");
    const u = await admin.auth.admin.createUser({
      email: `decay-${RUN_ID}@test.invalid`,
      password: `Pw_${RUN_ID}`,
      email_confirm: true,
    });
    if (u.error || !u.data.user) throw new Error(`create user: ${u.error?.message}`);
    testUid = u.data.user.id;

    const cc = await pg.query(`SELECT id, quality_score FROM cross_connections ORDER BY id LIMIT 2;`);
    if (cc.rowCount === 0) throw new Error("no cross_connections to test against");
    const c1 = cc.rows[0].id as number;
    const c2 = cc.rows[1]?.id as number | undefined;
    const baselineC1 = Number(cc.rows[0].quality_score);
    const baselineC2 = c2 != null ? Number(cc.rows[1].quality_score) : null;

    // ── Test 1: decay math ───────────────────────────────────────────
    console.log("\n=== Test 1: 5% drift toward 1.0 ===\n");
    // Force a known starting score
    await pg.query(`UPDATE cross_connections SET quality_score=1.50 WHERE id=$1;`, [c1]);
    if (c2 != null) await pg.query(`UPDATE cross_connections SET quality_score=0.30 WHERE id=$1;`, [c2]);

    await pg.query(
      `UPDATE cross_connections
       SET quality_score = quality_score + (1.0 - quality_score) * 0.05
       WHERE ABS(quality_score - 1.0) > 1e-6;`
    );

    const after = await pg.query(`SELECT id, quality_score FROM cross_connections WHERE id = ANY($1::int[]);`, [[c1, c2].filter((x) => x != null)]);
    const aMap = new Map(after.rows.map((r) => [r.id, Number(r.quality_score)]));
    // 1.50 → 1.50 + (1.0-1.50)*0.05 = 1.50 - 0.025 = 1.475
    record("1a.above-1-drifts-down", Math.abs((aMap.get(c1) ?? 0) - 1.475) < 1e-6, `c${c1} now ${aMap.get(c1)}`);
    if (c2 != null) {
      // 0.30 → 0.30 + (1.0-0.30)*0.05 = 0.30 + 0.035 = 0.335
      record("1b.below-1-drifts-up", Math.abs((aMap.get(c2) ?? 0) - 0.335) < 1e-6, `c${c2} now ${aMap.get(c2)}`);
    }

    // ── Test 2: 1.0 is fixed point ──────────────────────────────────
    console.log("\n=== Test 2: 1.0 is the attractor ===\n");
    await pg.query(`UPDATE cross_connections SET quality_score=1.0 WHERE id=$1;`, [c1]);
    await pg.query(
      `UPDATE cross_connections
       SET quality_score = quality_score + (1.0 - quality_score) * 0.05
       WHERE ABS(quality_score - 1.0) > 1e-6;`
    );
    const at1 = await pg.query(`SELECT quality_score FROM cross_connections WHERE id=$1;`, [c1]);
    record("2.score-of-1-stays", Number(at1.rows[0].quality_score) === 1.0, `score=${at1.rows[0].quality_score}`);

    // ── Test 3: event pruning ────────────────────────────────────────
    console.log("\n=== Test 3: connection_events older than 30d are pruned ===\n");
    await pg.query(
      `INSERT INTO connection_events (user_id, connection_id, event_type, item_id, created_at)
       VALUES ($1, $2, 'impression', null, now() - interval '45 days'),
              ($1, $2, 'impression', null, now() - interval '10 days')`,
      [testUid, c1],
    );
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const del = await pg.query(`DELETE FROM connection_events WHERE created_at < $1 AND user_id=$2 RETURNING id;`, [cutoff, testUid]);
    record("3a.old-event-pruned", del.rowCount === 1, `pruned=${del.rowCount}`);
    const remain = await pg.query(`SELECT COUNT(*)::int c FROM connection_events WHERE user_id=$1;`, [testUid]);
    record("3b.recent-event-survives", remain.rows[0].c === 1, `remaining=${remain.rows[0].c}`);

    // Reset
    await pg.query(`UPDATE cross_connections SET quality_score=$1 WHERE id=$2;`, [baselineC1, c1]);
    if (c2 != null && baselineC2 != null) {
      await pg.query(`UPDATE cross_connections SET quality_score=$1 WHERE id=$2;`, [baselineC2, c2]);
    }

  } finally {
    console.log("\n=== Cleanup ===\n");
    try {
      if (testUid) {
        await pg.query(`DELETE FROM connection_events WHERE user_id=$1;`, [testUid]);
        await pg.query(`DELETE FROM connection_credits WHERE user_id=$1;`, [testUid]);
        await pg.query(`DELETE FROM users WHERE id=$1;`, [testUid]);
        await admin.auth.admin.deleteUser(testUid).catch(() => {});
      }
    } catch {}
    await pg.end();
  }

  console.log("\n=== Results ===\n");
  const failed = results.filter((r) => !r.ok);
  console.log(`  ${results.length - failed.length} / ${results.length} passed`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`    ❌ ${f.name}: ${f.detail || ""}`);
    process.exit(1);
  }
  console.log("\n✅ ALL TESTS PASSED\n");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
