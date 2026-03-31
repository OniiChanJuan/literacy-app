import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

function isAnime(item: { type: string; genre: string[]; malId: number | null; ext: any }): boolean {
  if (item.type !== "tv" && item.type !== "movie") return false;
  const ext = item.ext as Record<string, any> | null;
  if (ext && ext.mal != null) return true;
  if (item.genre?.includes("Anime")) return true;
  return false;
}

async function main() {
  const checks: { title: string; shouldBeAnime: boolean }[] = [
    // Should be ANIME ✓
    { title: "Attack on Titan", shouldBeAnime: true },
    { title: "Death Note", shouldBeAnime: true },
    { title: "Fullmetal Alchemist: Brotherhood", shouldBeAnime: true },
    { title: "One Piece", shouldBeAnime: true },
    { title: "Naruto", shouldBeAnime: true },
    { title: "Dragon Ball Z", shouldBeAnime: true },
    { title: "Chainsaw Man", shouldBeAnime: true },
    { title: "Spirited Away", shouldBeAnime: true },
    { title: "Bleach", shouldBeAnime: true },
    { title: "Gintama", shouldBeAnime: true },
    { title: "Corpse Party", shouldBeAnime: true },
    { title: "Soul Land 2", shouldBeAnime: true },
    // Should NOT be anime ✗
    { title: "The Dark Knight", shouldBeAnime: false },
    { title: "Bluey", shouldBeAnime: false },
    { title: "Toy Story", shouldBeAnime: false },
    { title: "Coco", shouldBeAnime: false },
    { title: "Moana", shouldBeAnime: false },
    { title: "Luca", shouldBeAnime: false },
    { title: "Turning Red", shouldBeAnime: false },
    { title: "Adventure Time", shouldBeAnime: false },
    { title: "Avatar: The Last Airbender", shouldBeAnime: false },
    { title: "The Incredibles", shouldBeAnime: false },
  ];

  let passed = 0; let failed = 0;
  for (const check of checks) {
    const item = await prisma.item.findFirst({
      where: {
        title: { contains: check.title, mode: "insensitive" },
        parentItemId: null,
        type: { in: ["tv", "movie"] },
      },
      select: { id: true, title: true, type: true, genre: true, malId: true, ext: true },
      orderBy: { voteCount: "desc" },
    });
    if (!item) { console.log(`  [NOT FOUND] ${check.title}`); continue; }
    const anime = isAnime(item);
    const ext = item.ext as any;
    const ok = anime === check.shouldBeAnime;
    if (ok) passed++; else failed++;
    const icon = ok ? "✓" : "✗ WRONG";
    const expect = check.shouldBeAnime ? "ANIME" : "NOT  ";
    console.log(
      `  ${icon} [${expect}] [${item.id}] ${item.title} (${item.type}) | malId=${item.malId} extMal=${ext?.mal ?? "null"} genres=${JSON.stringify(item.genre)}`
    );
  }

  const total = await prisma.item.count({ where: { type: { in: ["tv","movie"] }, genre: { has: "Anime" } } });
  console.log(`\n  Passed: ${passed}/${passed + failed}`);
  console.log(`  Total items with 'Anime' genre: ${total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
