/**
 * migrate-tighten-reports-not-null.ts (Wave 1 Yellow 7)
 *
 * Adds NOT NULL to public.reports.reporter_user_id to match Prisma.
 *
 * Pre-check: zero nulls.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tighten-reports-not-null.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE public.reports
 *     ALTER COLUMN reporter_user_id DROP NOT NULL;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== Tighten reports.reporter_user_id NOT NULL ===\n");

  const { rows: state } = await pg.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='reports' AND column_name='reporter_user_id'`,
  );
  if (state[0]?.is_nullable === "NO") {
    console.log("  ⏭  already NOT NULL — nothing to do.");
    await pg.end();
    return;
  }

  const { rows: nulls } = await pg.query(
    `SELECT COUNT(*)::int n FROM public.reports WHERE reporter_user_id IS NULL`,
  );
  if (nulls[0].n > 0) {
    console.error(`  ✗ Pre-check FAILED: ${nulls[0].n} reports with NULL reporter_user_id.`);
    console.error("  Migration skipped.");
    await pg.end();
    process.exit(1);
  }
  console.log("  ✓ pre-check: 0 nulls");

  await pg.query("BEGIN");
  try {
    await pg.query(`ALTER TABLE public.reports ALTER COLUMN reporter_user_id SET NOT NULL;`);
    await pg.query("COMMIT");
    console.log("  ✓ reporter_user_id now NOT NULL");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("  ✗ Failed, rolled back:", e);
    throw e;
  }

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
