/**
 * One-time DDL — add a pg_trgm GIN index on items.title.
 *
 * Search ([api/search/route.ts]) matches titles with `title ILIKE '%q%'` and
 * `similarity(title, q)`. With only btree indexes those both SEQUENTIAL-SCAN
 * ~30k rows (~117ms exact / ~213ms fuzzy, measured). A GIN trigram index makes
 * ILIKE substring + similarity index-accelerated → single-digit ms, and stops
 * the scan cost growing as the catalog expands.
 *
 * The project uses `prisma db push` (no migrations dir), so this is applied as
 * idempotent raw DDL; the matching `@@index([title(ops: raw("gin_trgm_ops"))],
 * type: Gin, map: "items_title_trgm_idx")` is declared in schema.prisma so a
 * future db push won't drop it.
 *
 * Non-CONCURRENT build over the pooler: items is ~30k rows so the build is
 * ~1-2s; the brief ACCESS EXCLUSIVE lock is negligible (item rows are only
 * written by occasional auto-import / sync jobs, not by ratings/reviews).
 *
 * Run:  npx tsx scripts/add-title-trgm-index.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function timeIlike(label: string) {
  // warm, then time the always-run exact path
  await prisma.$queryRawUnsafe(`SELECT id FROM items WHERE parent_item_id IS NULL AND title ILIKE $1 LIMIT 40`, '%dark knight%');
  const t0 = process.hrtime.bigint();
  await prisma.$queryRawUnsafe(`SELECT id FROM items WHERE parent_item_id IS NULL AND title ILIKE $1 ORDER BY popularity_score DESC LIMIT 40`, '%dark knight%');
  console.log(`  ${label}: ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)}ms`);
}

async function main() {
  await timeIlike("ILIKE '%dark knight%' BEFORE");

  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  console.log('pg_trgm ensured.');
  console.log('Building items_title_trgm_idx (gin, title gin_trgm_ops)...');
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS items_title_trgm_idx ON items USING gin (title gin_trgm_ops)`
  );
  console.log('Index created (or already present).');

  // Verify it exists + show the planner uses it.
  const idx: any[] = await prisma.$queryRawUnsafe(`SELECT indexname FROM pg_indexes WHERE tablename='items' AND indexname='items_title_trgm_idx'`);
  console.log('present:', idx.length === 1);
  const plan: any[] = await prisma.$queryRawUnsafe(`EXPLAIN SELECT id FROM items WHERE parent_item_id IS NULL AND title ILIKE '%dark knight%' LIMIT 40`);
  console.log('plan:', plan.map((p: any) => p['QUERY PLAN']).join(' | ').slice(0, 200));

  await timeIlike("ILIKE '%dark knight%' AFTER ");

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
