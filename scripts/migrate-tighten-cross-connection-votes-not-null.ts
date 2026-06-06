/**
 * migrate-tighten-cross-connection-votes-not-null.ts (Wave 1 Yellow 6)
 *
 * Adds NOT NULL to public.cross_connection_votes.created_at to match
 * Prisma's declaration.
 *
 * Pre-check: zero nulls.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tighten-cross-connection-votes-not-null.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE public.cross_connection_votes
 *     ALTER COLUMN created_at DROP NOT NULL;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== Tighten cross_connection_votes.created_at NOT NULL ===\n");

  const { rows: state } = await pg.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='cross_connection_votes' AND column_name='created_at'`,
  );
  if (state[0]?.is_nullable === "NO") {
    console.log("  ⏭  already NOT NULL — nothing to do.");
    await pg.end();
    return;
  }

  const { rows: nulls } = await pg.query(
    `SELECT COUNT(*)::int n FROM public.cross_connection_votes WHERE created_at IS NULL`,
  );
  if (nulls[0].n > 0) {
    console.error(`  ✗ Pre-check FAILED: ${nulls[0].n} rows with NULL created_at.`);
    console.error("  Migration skipped.");
    await pg.end();
    process.exit(1);
  }
  console.log("  ✓ pre-check: 0 nulls");

  await pg.query("BEGIN");
  try {
    await pg.query(`ALTER TABLE public.cross_connection_votes ALTER COLUMN created_at SET NOT NULL;`);
    await pg.query("COMMIT");
    console.log("  ✓ created_at now NOT NULL");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("  ✗ Failed, rolled back:", e);
    throw e;
  }

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
