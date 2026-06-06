/**
 * migrate-drop-orphan-reviews-index.ts (Wave 3 housekeeping)
 *
 * Drops public.reviews_item_id_helpful_count_created_at_idx —
 * leftover from a since-removed sort-by-helpfulness path. Not
 * declared in prisma/schema.prisma; introspection would otherwise
 * surface it as drift.
 *
 * Idempotent.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-drop-orphan-reviews-index.ts
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   CREATE INDEX reviews_item_id_helpful_count_created_at_idx
 *     ON public.reviews (item_id, helpful_count, created_at);
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

const IDX = "reviews_item_id_helpful_count_created_at_idx";

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  const { rows: pre } = await pg.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
    [IDX],
  );
  if (pre.length === 0) {
    console.log(`  ⏭  ${IDX} already absent — nothing to do.`);
    await pg.end();
    return;
  }

  await pg.query(`DROP INDEX IF EXISTS public.${IDX};`);
  console.log(`  ✓ dropped ${IDX}`);

  const { rows: post } = await pg.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`,
    [IDX],
  );
  if (post.length > 0) {
    console.error(`  ✗ index still present after DROP`);
    process.exit(1);
  }
  console.log("  ✓ verified absent");
  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
