/**
 * Wave 1 baseline diagnostic. For each of the 8 target drifts:
 *   1. Confirm the drift still exists (matches the audit report).
 *   2. Run the pre-check that the audit said would pass.
 *
 * Output is one line per drift with status:
 *   ✅ drift confirmed + pre-check passes → safe to apply
 *   ⏭  drift no longer present → fix already landed, skip
 *   ⚠️  drift confirmed but pre-check FAILS → must report and skip
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-schema-drift-wave1-baseline.ts
 */
import "dotenv/config";
import { Client } from "pg";

type Check = { name: string; status: "READY" | "ALREADY_DONE" | "BLOCKED"; detail: string };
const checks: Check[] = [];

function report(name: string, status: Check["status"], detail: string) {
  checks.push({ name, status, detail });
  const icon = status === "READY" ? "✅" : status === "ALREADY_DONE" ? "⏭" : "⚠️ ";
  console.log(`  ${icon} ${name.padEnd(48)} ${status.padEnd(12)} ${detail}`);
}

async function constraintExists(pg: Client, table: string, contype: "p" | "u" | "f", colsCsv: string): Promise<boolean> {
  const { rows } = await pg.query(
    `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
     WHERE conrelid = ('public.' || $1)::regclass AND contype = $2`,
    [table, contype],
  );
  return rows.some((r: any) => r.d.includes("(" + colsCsv + ")"));
}

async function columnNotNull(pg: Client, table: string, col: string): Promise<boolean> {
  const { rows } = await pg.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, col],
  );
  return rows[0]?.is_nullable === "NO";
}

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("\n=== Wave 1 baseline ===\n");
  console.log("Reds:\n");

  // ── Red 1: ratings PK on (user_id, item_id) ──────────────────────
  {
    const present = await constraintExists(pg, "ratings", "p", "user_id, item_id");
    if (present) {
      report("ratings PK", "ALREADY_DONE", "constraint already present");
    } else {
      const { rows } = await pg.query(`
        SELECT user_id, item_id, COUNT(*)::int c
        FROM public.ratings GROUP BY user_id, item_id HAVING COUNT(*) > 1
      `);
      if (rows.length === 0) report("ratings PK", "READY", "drift confirmed, 0 duplicates");
      else report("ratings PK", "BLOCKED", `${rows.length} duplicate (user_id,item_id) pairs`);
    }
  }

  // ── Red 2: user_tag_suggestions UNIQUE (user_id, item_id, tag_slug) ─
  {
    const present = await constraintExists(pg, "user_tag_suggestions", "u", "user_id, item_id, tag_slug");
    if (present) {
      report("user_tag_suggestions UNIQUE", "ALREADY_DONE", "constraint already present");
    } else {
      const { rows } = await pg.query(`
        SELECT user_id, item_id, tag_slug, COUNT(*)::int c
        FROM public.user_tag_suggestions
        WHERE user_id IS NOT NULL AND item_id IS NOT NULL AND tag_slug IS NOT NULL
        GROUP BY user_id, item_id, tag_slug HAVING COUNT(*) > 1
      `);
      if (rows.length === 0) report("user_tag_suggestions UNIQUE", "READY", "drift confirmed, 0 duplicates");
      else report("user_tag_suggestions UNIQUE", "BLOCKED", `${rows.length} duplicate triples`);
    }
  }

  // ── Red 3: franchise_follows FK on franchise_id ───────────────────
  {
    const { rows: fk } = await pg.query(`
      SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
      WHERE conrelid = 'public.franchise_follows'::regclass AND contype = 'f'
    `);
    const present = fk.some((r: any) => r.d.includes("FOREIGN KEY (franchise_id)"));
    if (present) {
      report("franchise_follows FK", "ALREADY_DONE", "constraint already present");
    } else {
      const { rows } = await pg.query(`
        SELECT ff.franchise_id FROM public.franchise_follows ff
        LEFT JOIN public.franchises f ON f.id = ff.franchise_id
        WHERE f.id IS NULL
      `);
      if (rows.length === 0) report("franchise_follows FK", "READY", "drift confirmed, 0 orphan rows");
      else report("franchise_follows FK", "BLOCKED", `${rows.length} orphan rows (franchise_id missing parent)`);
    }
  }

  console.log("\nYellows:\n");

  // ── Yellow 5: cross_connections 4 columns NOT NULL ───────────────
  {
    const cols = ["theme_tags", "created_by", "quality_score", "created_at"];
    const present = (await Promise.all(cols.map((c) => columnNotNull(pg, "cross_connections", c)))).every(Boolean);
    if (present) {
      report("cross_connections NOT NULLs", "ALREADY_DONE", "all 4 already NOT NULL");
    } else {
      const { rows } = await pg.query(`
        SELECT
          (theme_tags IS NULL)::int AS tt,
          (created_by IS NULL)::int AS cb,
          (quality_score IS NULL)::int AS qs,
          (created_at IS NULL)::int AS ca
        FROM public.cross_connections
      `);
      const totals = { tt: 0, cb: 0, qs: 0, ca: 0 };
      for (const r of rows as any[]) { totals.tt += r.tt; totals.cb += r.cb; totals.qs += r.qs; totals.ca += r.ca; }
      const anyNull = Object.values(totals).some((n) => n > 0);
      if (!anyNull) report("cross_connections NOT NULLs", "READY", `drift confirmed, 0 nulls (${rows.length} rows)`);
      else report("cross_connections NOT NULLs", "BLOCKED", `nulls found: ${JSON.stringify(totals)}`);
    }
  }

  // ── Yellow 6: cross_connection_votes.created_at NOT NULL ─────────
  {
    const present = await columnNotNull(pg, "cross_connection_votes", "created_at");
    if (present) {
      report("cross_connection_votes.created_at", "ALREADY_DONE", "already NOT NULL");
    } else {
      const { rows } = await pg.query(`SELECT COUNT(*)::int n FROM public.cross_connection_votes WHERE created_at IS NULL`);
      const n = rows[0].n;
      if (n === 0) report("cross_connection_votes.created_at", "READY", "drift confirmed, 0 nulls");
      else report("cross_connection_votes.created_at", "BLOCKED", `${n} null rows`);
    }
  }

  // ── Yellow 7: reports.reporter_user_id NOT NULL ──────────────────
  {
    const present = await columnNotNull(pg, "reports", "reporter_user_id");
    if (present) {
      report("reports.reporter_user_id", "ALREADY_DONE", "already NOT NULL");
    } else {
      const { rows } = await pg.query(`SELECT COUNT(*)::int n FROM public.reports WHERE reporter_user_id IS NULL`);
      const n = rows[0].n;
      if (n === 0) report("reports.reporter_user_id", "READY", "drift confirmed, 0 nulls");
      else report("reports.reporter_user_id", "BLOCKED", `${n} null rows`);
    }
  }

  // ── Yellow 8: tags.applies_to NOT NULL + default ─────────────────
  {
    const present = await columnNotNull(pg, "tags", "applies_to");
    if (present) {
      report("tags.applies_to", "ALREADY_DONE", "already NOT NULL");
    } else {
      const { rows } = await pg.query(`SELECT COUNT(*)::int n FROM public.tags WHERE applies_to IS NULL`);
      const n = rows[0].n;
      // Always READY (we backfill in step 8 itself); just note the count.
      report("tags.applies_to", "READY", `drift confirmed, ${n} nulls to backfill`);
    }
  }

  // ── Yellow 9: items.genre/vibes NOT NULL ─────────────────────────
  {
    const genreNN = await columnNotNull(pg, "items", "genre");
    const vibesNN = await columnNotNull(pg, "items", "vibes");
    if (genreNN && vibesNN) {
      report("items.genre/vibes", "ALREADY_DONE", "both already NOT NULL");
    } else {
      const { rows } = await pg.query(`
        SELECT
          COUNT(*) FILTER (WHERE genre IS NULL)::int AS g,
          COUNT(*) FILTER (WHERE vibes IS NULL)::int AS v
        FROM public.items
      `);
      report("items.genre/vibes", "READY", `drift confirmed, genre_nulls=${rows[0].g} vibes_nulls=${rows[0].v} (backfill in migration)`);
    }
  }

  console.log("\n=== Summary ===\n");
  const ready = checks.filter((c) => c.status === "READY").length;
  const done = checks.filter((c) => c.status === "ALREADY_DONE").length;
  const blocked = checks.filter((c) => c.status === "BLOCKED").length;
  console.log(`  ${ready} READY  ${done} ALREADY_DONE  ${blocked} BLOCKED\n`);

  await pg.end();
  if (blocked > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
