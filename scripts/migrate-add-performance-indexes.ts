/**
 * migrate-add-performance-indexes.ts (Wave 2)
 *
 * Adds the 12 missing indexes identified in the Prisma schema drift
 * audit. All previously declared in prisma/schema.prisma's @@index
 * blocks but absent from the live DB.
 *
 * Idempotent — every CREATE uses IF NOT EXISTS.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-add-performance-indexes.ts
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP INDEX IF EXISTS public.ratings_user_id_idx;
 *   DROP INDEX IF EXISTS public.reviews_user_id_idx;
 *   DROP INDEX IF EXISTS public.library_entries_user_id_idx;
 *   DROP INDEX IF EXISTS public.library_entries_user_id_status_idx;
 *   DROP INDEX IF EXISTS public.implicit_signals_user_id_signal_type_idx;
 *   DROP INDEX IF EXISTS public.implicit_signals_user_id_item_id_idx;
 *   DROP INDEX IF EXISTS public.notifications_user_id_idx;
 *   DROP INDEX IF EXISTS public.notifications_user_id_read_idx;
 *   DROP INDEX IF EXISTS public.imports_user_id_idx;
 *   DROP INDEX IF EXISTS public.imports_user_id_source_idx;
 *   DROP INDEX IF EXISTS public.items_steam_app_id_idx;
 *   DROP INDEX IF EXISTS public.user_tag_suggestions_user_id_idx;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

const INDEXES: Array<[name: string, table: string, cols: string]> = [
  ["ratings_user_id_idx",                       "ratings",              "user_id"],
  ["reviews_user_id_idx",                       "reviews",              "user_id"],
  ["library_entries_user_id_idx",               "library_entries",      "user_id"],
  ["library_entries_user_id_status_idx",        "library_entries",      "user_id, status"],
  ["implicit_signals_user_id_signal_type_idx",  "implicit_signals",     "user_id, signal_type"],
  ["implicit_signals_user_id_item_id_idx",      "implicit_signals",     "user_id, item_id"],
  ["notifications_user_id_idx",                 "notifications",        "user_id"],
  ["notifications_user_id_read_idx",            "notifications",        "user_id, read"],
  ["imports_user_id_idx",                       "imports",              "user_id"],
  ["imports_user_id_source_idx",                "imports",              "user_id, source"],
  ["items_steam_app_id_idx",                    "items",                "steam_app_id"],
  ["user_tag_suggestions_user_id_idx",          "user_tag_suggestions", "user_id"],
];

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== Wave 2: missing performance indexes ===\n");

  let created = 0;
  let skipped = 0;
  for (const [name, table, cols] of INDEXES) {
    // Check pre-existence
    const { rows: pre } = await pg.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
      [name],
    );
    if (pre.length > 0) {
      console.log(`  ⏭  ${name.padEnd(48)} already exists`);
      skipped++;
      continue;
    }
    await pg.query(`CREATE INDEX IF NOT EXISTS ${name} ON public.${table} (${cols});`);
    console.log(`  ✓ ${name.padEnd(48)} created on ${table}(${cols})`);
    created++;
  }

  // Verify all 12 are now present
  console.log("\n=== Verification ===\n");
  let missing = 0;
  for (const [name] of INDEXES) {
    const { rows } = await pg.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
      [name],
    );
    if (rows.length === 0) {
      console.log(`  ❌ ${name} MISSING`);
      missing++;
    } else {
      console.log(`  ✅ ${name}`);
    }
  }

  console.log(`\n${created} created, ${skipped} already existed, ${missing} missing\n`);
  await pg.end();
  if (missing > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
