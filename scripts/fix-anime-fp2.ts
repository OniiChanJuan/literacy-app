import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Re-adding 'Anime' to items incorrectly stripped by 'Soul' pattern ===\n");

  // These were incorrectly stripped because their titles contain "Soul"
  // but they are legitimate anime
  const idsToFix = [931, 939, 19171, 19265, 994];

  for (const id of idsToFix) {
    const item = await prisma.item.findUnique({
      where: { id },
      select: { id: true, title: true, genre: true, malId: true },
    });
    if (!item) {
      console.log(`  [${id}] NOT FOUND`);
      continue;
    }
    if (item.genre.includes("Anime")) {
      console.log(`  [${id}] ${item.title} — already has 'Anime', skipping`);
      continue;
    }
    await prisma.item.update({
      where: { id },
      data: { genre: [...item.genre, "Anime"] },
    });
    console.log(`  RESTORED 'Anime' to [${id}] ${item.title} (malId=${item.malId})`);
  }

  console.log("\n=== Final spot checks ===");
  const checks = [
    // Should be ANIME
    { title: "Attack on Titan", expect: true },
    { title: "Death Note", expect: true },
    { title: "Fullmetal Alchemist: Brotherhood", expect: true },
    { title: "One Piece", expect: true },
    { title: "Naruto", expect: true },
    { title: "Dragon Ball Z", expect: true },
    { title: "Chainsaw Man", expect: true },
    { title: "Spirited Away", expect: true },
    { title: "Gintama", expect: true },
    { title: "Corpse Party", expect: true },
    // Should NOT be anime
    { title: "The Dark Knight", expect: false },
    { title: "Bluey", expect: false },
    { title: "Toy Story", expect: false },
    { title: "Soul", expect: false },        // Pixar Soul
    { title: "Coco", expect: false },
    { title: "Moana", expect: false },
    { title: "Luca", expect: false },
    { title: "Turning Red", expect: false },
  ];

  for (const check of checks) {
    const item = await prisma.item.findFirst({
      where: {
        title: { contains: check.title, mode: "insensitive" },
        parentItemId: null,
        type: { in: ["tv", "movie"] },
        NOT: check.title === "Soul" ? { title: { contains: "Soul Land" } } : undefined,
      },
      select: { id: true, title: true, type: true, genre: true, malId: true, ext: true },
      orderBy: { voteCount: "desc" },
    });
    if (!item) {
      console.log(`  [NOT FOUND] ${check.title}`);
      continue;
    }
    const ext = item.ext as Record<string, any> | null;
    const hasAnimeGenre = item.genre.includes("Anime");
    const hasMalScore = ext?.mal != null;
    const hasMALId = item.malId != null;
    const hasAnimation = item.genre.includes("Animation");
    const isAnime = hasAnimeGenre || hasMalScore || (hasMALId && hasAnimation);
    const status = isAnime === check.expect ? "✓" : "✗ WRONG";
    console.log(
      `  ${status} [${item.id}] ${item.title} (${item.type}) | anime=${isAnime} | genres=${JSON.stringify(item.genre)} | malId=${item.malId}`
    );
  }

  // Count total items that will pass isAnime()
  const withAnimeGenre = await prisma.item.count({
    where: { type: { in: ["tv", "movie"] }, genre: { has: "Anime" } },
  });
  const withMalScore = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint as count FROM items
    WHERE type IN ('tv','movie')
    AND (ext->>'mal') IS NOT NULL
    AND parent_item_id IS NULL
  `;
  const withMalIdAndAnimation = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint as count FROM items
    WHERE type IN ('tv','movie')
    AND mal_id IS NOT NULL
    AND 'Animation' = ANY(genre)
    AND parent_item_id IS NULL
  `;
  console.log(`\nTotal with 'Anime' genre tag: ${withAnimeGenre}`);
  console.log(`Total with ext.mal score: ${withMalScore[0].count}`);
  console.log(`Total with malId + Animation genre: ${withMalIdAndAnimation[0].count}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
