import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Lookup the specific items mentioned by user
  const named = await prisma.$queryRawUnsafe(`
    SELECT id, title, type, cover, ext
    FROM items
    WHERE title ILIKE ANY(ARRAY[
      '%Chainsaw Man%Movie%', '%Witch Hat Atelier%', '%One Piece Fan Letter%',
      '%Frieren%Journey%', '%Berserk%'
    ])
    ORDER BY title
    LIMIT 20
  `) as any[];

  console.log("Named items:");
  for (const r of named) {
    console.log(`  [${r.id}] ${r.title} (${r.type})`);
    console.log(`    cover: ${r.cover || 'NULL/EMPTY'}`);
  }

  // Also get 20 popular manga to see their cover URL format
  const manga = await prisma.$queryRawUnsafe(`
    SELECT id, title, cover, vote_count
    FROM items
    WHERE type = 'manga' AND parent_item_id IS NULL
    ORDER BY vote_count DESC NULLS LAST
    LIMIT 15
  `) as any[];
  console.log("\nTop manga by votes (with cover URLs):");
  for (const r of manga) {
    console.log(`  [${r.id}] ${r.title} | votes=${r.vote_count} | cover=${r.cover?.substring(0,80) || 'NULL'}`);
  }

  // Same for anime
  const anime = await prisma.$queryRawUnsafe(`
    SELECT id, title, type, cover, vote_count
    FROM items
    WHERE type = 'anime' AND parent_item_id IS NULL
    ORDER BY vote_count DESC NULLS LAST
    LIMIT 10
  `) as any[];
  console.log("\nTop anime by votes (with cover URLs):");
  for (const r of anime) {
    console.log(`  [${r.id}] ${r.title} | votes=${r.vote_count} | cover=${r.cover?.substring(0,80) || 'NULL'}`);
  }

  // Test: how many Jikan/MAL covers use cdn.myanimelist.net vs other domains
  const domains = await prisma.$queryRawUnsafe(`
    SELECT
      CASE
        WHEN cover LIKE '%cdn.myanimelist.net%' THEN 'myanimelist.net'
        WHEN cover LIKE '%cdn.myanimelist.net%' THEN 'myanimelist CDN'
        WHEN cover LIKE '%images.unsplash%' THEN 'unsplash'
        WHEN cover LIKE '%image.tmdb.org%' THEN 'tmdb'
        WHEN cover LIKE '%images.igdb.com%' THEN 'igdb'
        WHEN cover LIKE '%books.google.com%' THEN 'google-books'
        WHEN cover LIKE '%i.scdn.co%' THEN 'spotify'
        WHEN cover LIKE '%images4.alphacoders%' THEN 'alphacoders'
        WHEN cover IS NULL OR cover = '' THEN 'MISSING'
        WHEN cover NOT LIKE 'http%' THEN 'non-http'
        ELSE 'other'
      END as domain,
      type,
      COUNT(*)::int as cnt
    FROM items
    WHERE parent_item_id IS NULL AND is_upcoming = false
    GROUP BY 1, 2
    ORDER BY cnt DESC
    LIMIT 30
  `) as any[];
  console.log("\nCover URL domains by type:");
  for (const r of domains) {
    console.log(`  ${r.domain.padEnd(20)} [${r.type}] ${r.cnt}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
