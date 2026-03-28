import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT 
      type,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE cover IS NULL OR cover = '')::int as missing,
      COUNT(*) FILTER (WHERE cover NOT LIKE 'http%' AND cover != '' AND cover IS NOT NULL)::int as invalid_url
    FROM items
    GROUP BY type ORDER BY type
  `);

  console.log('TYPE         TOTAL   MISSING  INVALID_URL');
  for (const r of rows) {
    const pct = r.total > 0 ? Math.round(r.missing/r.total*100) : 0;
    console.log(`${r.type.padEnd(12)} ${String(r.total).padStart(7)} ${String(r.missing).padStart(8)} (${pct}%)  ${String(r.invalid_url).padStart(8)}`);
  }

  const examples: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, type, LEFT(COALESCE(cover,'[null]'),80) as cover, tmdb_id, igdb_id, mal_id, google_books_id, spotify_id, comic_vine_id
    FROM items WHERE cover IS NULL OR cover = '' LIMIT 10
  `);
  console.log('\n=== 10 ITEMS WITH MISSING COVERS ===');
  for (const e of examples) console.log(JSON.stringify(e));

  const [tm]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE cover IS NULL OR cover = ''`);
  const [ta]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items`);
  console.log(`\nTOTAL MISSING: ${tm.n} / ${ta.n}`);
  await prisma.$disconnect();
}

main().catch(console.error);
