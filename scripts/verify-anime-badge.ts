import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });
async function main() {
  const titles = ["Naruto", "Dragon Ball Z", "Spirited Away", "The Dark Knight", "Adventure Time", "Toy Story", "Chainsaw Man", "Bleach"];
  for (const t of titles) {
    const item = await prisma.item.findFirst({
      where: { title: { contains: t, mode: "insensitive" }, parentItemId: null, type: { in: ["tv","movie"] } },
      select: { id: true, title: true, type: true, genre: true, malId: true },
      orderBy: { voteCount: "desc" }
    });
    if (item) {
      const anime = item.genre.includes("Anime") || (item.malId != null && item.genre.includes("Animation"));
      console.log((anime ? "✓ ANIME" : "  NOT  ") + " | " + item.title + " (" + item.type + ") genre=" + JSON.stringify(item.genre));
    }
  }
  const animeCount = await prisma.item.count({ where: { type: { in: ["tv","movie"] }, genre: { has: "Anime" } } });
  console.log("\nTotal items with 'Anime' genre: " + animeCount);
}
main().catch(console.error).finally(() => prisma.$disconnect());
