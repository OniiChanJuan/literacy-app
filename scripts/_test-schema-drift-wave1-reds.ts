/**
 * Functional verification that the three Red fixes actually unblocked
 * the operations they were meant to. Read-only on real data —
 * temporarily creates and cleans up ephemeral rows for each test.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_test-schema-drift-wave1-reds.ts
 */
import "dotenv/config";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../src/lib/prisma";

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

  let userId: string | null = null;
  let itemId: number | null = null;
  let tagSlug: string | null = null;

  try {
    console.log("\n=== Setup ===\n");
    const u = await admin.auth.admin.createUser({
      email: `reds-verify-${RUN_ID}@test.invalid`,
      password: `Pw_${RUN_ID}`,
      email_confirm: true,
    });
    if (u.error || !u.data.user) throw new Error(`createUser: ${u.error?.message}`);
    userId = u.data.user.id;

    const item = await pg.query(`SELECT id FROM items LIMIT 1;`);
    itemId = item.rows[0].id;

    const tag = await pg.query(`SELECT slug FROM tags LIMIT 1;`);
    tagSlug = tag.rows[0]?.slug ?? null;
    if (!tagSlug) {
      // Create a throwaway tag for the test
      tagSlug = `verify-${RUN_ID}`;
      await pg.query(
        `INSERT INTO tags (slug, display_name, category) VALUES ($1, $2, 'theme')`,
        [tagSlug, "Verify Tag"],
      );
    }
    console.log(`  test user ${userId}, item ${itemId}, tag ${tagSlug}`);

    // ── Red 1: rating upsert ─────────────────────────────────────────
    console.log("\n=== Red 1: rating.upsert ===\n");
    try {
      const r1 = await prisma.rating.upsert({
        where: { userId_itemId: { userId, itemId: itemId! } },
        update: { score: 5 },
        create: { userId, itemId: itemId!, score: 5 },
      });
      record("R1a.first-upsert-creates", r1.score === 5, `score=${r1.score}`);
      const r2 = await prisma.rating.upsert({
        where: { userId_itemId: { userId, itemId: itemId! } },
        update: { score: 4 },
        create: { userId, itemId: itemId!, score: 99 },
      });
      record("R1b.second-upsert-updates", r2.score === 4, `score=${r2.score}`);
    } catch (e: any) {
      record("R1a.first-upsert-creates", false, `THREW: ${e.message?.split("\n")[0] ?? e}`);
    }

    // ── Red 2: userTagSuggestion upsert ──────────────────────────────
    console.log("\n=== Red 2: userTagSuggestion.upsert ===\n");
    try {
      const t1 = await prisma.userTagSuggestion.upsert({
        where: {
          userId_itemId_tagSlug: { userId, itemId: itemId!, tagSlug: tagSlug! },
        },
        update: {},
        create: { userId, itemId: itemId!, tagSlug: tagSlug! },
      });
      record("R2a.upsert-creates", !!t1.id, `id=${t1.id}`);
      // Re-upsert is no-op
      const t2 = await prisma.userTagSuggestion.upsert({
        where: {
          userId_itemId_tagSlug: { userId, itemId: itemId!, tagSlug: tagSlug! },
        },
        update: {},
        create: { userId, itemId: itemId!, tagSlug: tagSlug! },
      });
      record("R2b.upsert-idempotent", t1.id === t2.id, `id ${t1.id} → ${t2.id}`);
    } catch (e: any) {
      record("R2a.upsert-creates", false, `THREW: ${e.message?.split("\n")[0] ?? e}`);
    }

    // ── Red 3: franchiseFollow FK violation ──────────────────────────
    console.log("\n=== Red 3: franchiseFollow FK enforcement ===\n");
    try {
      await prisma.franchiseFollow.create({
        data: { userId, franchiseId: 99999999 },
      });
      record("R3.bogus-franchise-rejected", false, "INSERT succeeded — FK is not enforced!");
      // Cleanup if it somehow inserted
      await pg.query(`DELETE FROM franchise_follows WHERE user_id=$1 AND franchise_id=99999999;`, [userId]);
    } catch (e: any) {
      const isFkViolation =
        e?.code === "P2003" ||                                       // Prisma FK violation
        /foreign key/i.test(e?.message ?? "") ||
        /violates foreign key constraint/i.test(e?.message ?? "");
      record("R3.bogus-franchise-rejected", isFkViolation, `error=${e?.code ?? "?"}`);
    }

  } finally {
    console.log("\n=== Cleanup ===\n");
    try {
      if (userId) {
        await pg.query(`DELETE FROM ratings WHERE user_id=$1;`, [userId]);
        await pg.query(`DELETE FROM user_tag_suggestions WHERE user_id=$1;`, [userId]);
        await pg.query(`DELETE FROM franchise_follows WHERE user_id=$1;`, [userId]);
        await pg.query(`DELETE FROM library_entries WHERE user_id=$1;`, [userId]);
        await pg.query(`DELETE FROM user_settings WHERE user_id=$1;`, [userId]);
        await pg.query(`DELETE FROM users WHERE id=$1;`, [userId]);
        await admin.auth.admin.deleteUser(userId).catch(() => {});
      }
      // Drop the test tag if we created it
      if (tagSlug?.startsWith("verify-")) {
        await pg.query(`DELETE FROM tags WHERE slug=$1;`, [tagSlug]);
      }
      console.log("  cleanup ok");
    } catch (e) {
      console.log("  cleanup error:", (e as Error).message);
    }
    await prisma.$disconnect();
    await pg.end();
  }

  console.log("\n=== Results ===\n");
  const failed = results.filter((r) => !r.ok);
  console.log(`  ${results.length - failed.length} / ${results.length} passed`);
  if (failed.length > 0) {
    console.log("\n  Failures:");
    for (const f of failed) console.log(`    ❌ ${f.name}: ${f.detail ?? ""}`);
    process.exit(1);
  }
  console.log("\n✅ ALL RED FIXES VERIFIED\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
