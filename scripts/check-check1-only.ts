import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });
async function main() {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, title, type, genre, mal_id
    FROM items
    WHERE type IN ('tv','movie')
    AND mal_id IS NOT NULL
    AND 'Animation' = ANY(genre)
    AND NOT ('Anime' = ANY(genre))
    AND (ext->>'mal') IS NULL
    AND parent_item_id IS NULL
    ORDER BY vote_count DESC NULLS LAST
    LIMIT 30
  `;
  console.log("Items that pass ONLY via Check1 (no Anime genre, no ext.mal):");
  rows.forEach((i: any) => console.log(`  [${i.id}] ${i.title} | malId=${i.mal_id} | genres=${JSON.stringify(i.genre)}`));
  const count = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count FROM items
    WHERE type IN ('tv','movie')
    AND mal_id IS NOT NULL
    AND 'Animation' = ANY(genre)
    AND NOT ('Anime' = ANY(genre))
    AND (ext->>'mal') IS NULL
    AND parent_item_id IS NULL
  `;
  console.log("\nTotal: " + count[0].count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
