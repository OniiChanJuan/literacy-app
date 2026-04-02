import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const stats = await prisma.$queryRaw<any[]>`
    SELECT
      type,
      COUNT(*)::int as total,
      COUNT(tmdb_id)::int as has_tmdb,
      COUNT(igdb_id)::int as has_igdb,
      COUNT(mal_id)::int as has_mal,
      COUNT(google_books_id)::int as has_gb,
      COUNT(*)::int - COUNT(CASE WHEN EXISTS(
        SELECT 1 FROM franchise_items fi WHERE fi.item_id = items.id
      ) THEN 1 END)::int as unlinked
    FROM items WHERE is_upcoming = false
    GROUP BY type ORDER BY total DESC
  `;
  console.log('type      | total | tmdbId | igdbId | malId | gbId  | unlinked');
  console.log('----------|-------|--------|--------|-------|-------|----------');
  stats.forEach(r => {
    console.log(
      r.type.padEnd(9) + ' | ' +
      String(r.total).padStart(5) + ' | ' +
      String(r.has_tmdb).padStart(6) + ' | ' +
      String(r.has_igdb).padStart(6) + ' | ' +
      String(r.has_mal).padStart(5) + ' | ' +
      String(r.has_gb).padStart(5) + ' | ' +
      String(r.unlinked).padStart(8)
    );
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
