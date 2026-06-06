/**
 * migrate-tighten-tags-applies-to-not-null.ts (Wave 1 Yellow 8)
 *
 * Sets public.tags.applies_to NOT NULL with DEFAULT '{}'::text[].
 * Backfills any existing NULLs to '{}' first (logged).
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tighten-tags-applies-to-not-null.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE public.tags
 *     ALTER COLUMN applies_to DROP NOT NULL,
 *     ALTER COLUMN applies_to DROP DEFAULT;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== Tighten tags.applies_to to NOT NULL with default '{}' ===\n");

  const { rows: state } = await pg.query(
    `SELECT is_nullable, column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='tags' AND column_name='applies_to'`,
  );
  if (state[0]?.is_nullable === "NO" && state[0]?.column_default?.includes("ARRAY")) {
    console.log("  ⏭  already NOT NULL with array default — nothing to do.");
    await pg.end();
    return;
  }

  // Backfill nulls
  const { rows: nullCount } = await pg.query(
    `SELECT COUNT(*)::int n FROM public.tags WHERE applies_to IS NULL`,
  );
  const backfillCount = nullCount[0].n;
  if (backfillCount > 0) {
    console.log(`  ⚙  backfilling ${backfillCount} rows with NULL applies_to → '{}'`);
  } else {
    console.log("  ✓ no rows need backfill");
  }

  await pg.query("BEGIN");
  try {
    if (backfillCount > 0) {
      const upd = await pg.query(
        `UPDATE public.tags SET applies_to = '{}'::text[] WHERE applies_to IS NULL`,
      );
      console.log(`  ✓ backfilled ${upd.rowCount} rows`);
    }
    await pg.query(`
      ALTER TABLE public.tags
        ALTER COLUMN applies_to SET NOT NULL,
        ALTER COLUMN applies_to SET DEFAULT '{}'::text[];
    `);
    await pg.query("COMMIT");
    console.log("  ✓ applies_to NOT NULL with default '{}'");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("  ✗ Failed, rolled back:", e);
    throw e;
  }

  const { rows: verify } = await pg.query(
    `SELECT is_nullable, column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='tags' AND column_name='applies_to'`,
  );
  console.log(`  Final: nullable=${verify[0].is_nullable} default=${verify[0].column_default}`);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
