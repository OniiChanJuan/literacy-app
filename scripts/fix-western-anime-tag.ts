/**
 * Fix Western animated shows that incorrectly have 'Anime' genre.
 * These are shows in MAL (so they got malId) and have Action/Sci-Fi/etc genres,
 * so the backfill-anime-genre script added 'Anime' to them incorrectly.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

// Known Western animated shows that appear in MAL but are NOT Japanese anime
const WESTERN_ANIMATED = [
  "Adventure Time",
  "Avatar: The Last Airbender",
  "The Legend of Korra",
  "Teen Titans",
  "Batman: The Animated Series",
  "Regular Show",
  "Gravity Falls",
  "Steven Universe",
  "The Owl House",
  "Arcane",
  "Star Wars: The Clone Wars",
  "Star Wars Rebels",
  "The Boondocks",
  "Invincible",
  "Final Space",
  "Primal",
];

async function main() {
  console.log("=== Checking/fixing Western animation with incorrect 'Anime' tag ===\n");
  let fixed = 0;

  for (const title of WESTERN_ANIMATED) {
    const items = await prisma.item.findMany({
      where: {
        title: { contains: title, mode: "insensitive" },
        genre: { has: "Anime" },
        type: { in: ["tv", "movie"] },
        parentItemId: null,
      },
      select: { id: true, title: true, genre: true, malId: true },
    });
    for (const item of items) {
      // Verify this is a close title match (not a substring false match)
      const t = item.title.toLowerCase();
      const s = title.toLowerCase();
      const isClose = t === s || t.startsWith(s + ":") || t.startsWith(s + " ") || t.includes(s);
      if (!isClose) continue;

      const newGenre = item.genre.filter((g) => g !== "Anime");
      await prisma.item.update({ where: { id: item.id }, data: { genre: newGenre } });
      console.log(`  REMOVED 'Anime' from [${item.id}] ${item.title} (malId=${item.malId})`);
      fixed++;
    }
  }

  if (fixed === 0) console.log("  No Western animation false positives found.");
  console.log(`\n  Fixed: ${fixed} items`);

  const total = await prisma.item.count({ where: { type: { in: ["tv","movie"] }, genre: { has: "Anime" } } });
  console.log(`  Total items with 'Anime' genre: ${total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
