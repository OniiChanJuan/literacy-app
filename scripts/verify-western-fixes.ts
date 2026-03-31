/**
 * Verify all fixes for Western animation false positives.
 * Run: npx tsx scripts/verify-western-fixes.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { isAnime } from "../src/lib/anime";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

const CHECKS: { title: string; wantAnime: boolean; wantMalIdNull?: boolean; note?: string }[] = [
  // Must NOT show ANIME badge + no ext.mal
  { title: "The Lion King",                       wantAnime: false, note: "Disney — classic" },
  { title: "Toy Story",                           wantAnime: false, note: "Pixar" },
  { title: "Coco",                                wantAnime: false, note: "Pixar" },
  { title: "Bluey",                               wantAnime: false, note: "Australian kids TV" },
  { title: "Gravity Falls",                       wantAnime: false, note: "Disney Channel US" },
  { title: "Rick and Morty",                      wantAnime: false, note: "Adult Swim US — no Anime genre" },
  { title: "Star Wars Resistance",                wantAnime: false, note: "Lucasfilm US — no Anime genre" },
  { title: "The Hobbit",                          wantAnime: false, wantMalIdNull: true, note: "Live-action — no Anime genre, malId=null" },
  { title: "The Spectacular Spider-Man",          wantAnime: false, wantMalIdNull: true, note: "Marvel US — no Anime genre, malId=null" },
  { title: "Spider-Man: Across the Spider-Verse", wantAnime: false, note: "Sony US — just fixed" },
  { title: "The Lego Batman Movie",               wantAnime: false, note: "Warner Bros US — just fixed" },
  // Must still show ANIME badge
  { title: "Attack on Titan",                     wantAnime: true,  note: "Real anime — must keep badge" },
  { title: "Death Note",                          wantAnime: true,  note: "Real anime" },
  { title: "Fullmetal Alchemist: Brotherhood",    wantAnime: true,  note: "Real anime" },
];

async function main() {
  let passed = 0; let failed = 0;

  for (const check of CHECKS) {
    const item = await prisma.item.findFirst({
      where: {
        title: { contains: check.title, mode: "insensitive" },
        type: { in: ["tv","movie"] },
        parentItemId: null,
      },
      select: { id: true, title: true, type: true, genre: true, malId: true, ext: true, people: true },
      orderBy: { voteCount: "desc" },
    });

    if (!item) { console.log(`  [NOT FOUND] ${check.title}`); continue; }

    const ext = item.ext as any;
    const anime = isAnime(item as any);
    const extMal = ext?.mal ?? null;
    const hasAnimeGenre = (item.genre as string[]).includes("Anime");

    let ok = anime === check.wantAnime;
    if (check.wantMalIdNull) ok = ok && item.malId === null;

    if (ok) passed++; else failed++;
    const icon = ok ? "✓" : "✗ FAIL";
    const expect = check.wantAnime ? "ANIME  " : "NOT    ";
    const malNote = check.wantMalIdNull ? ` malId=${item.malId}` : "";
    console.log(`  ${icon} [${expect}] [${item.id}] ${item.title} | Anime genre=${hasAnimeGenre} | ext.mal=${extMal}${malNote} | ${check.note}`);
  }

  console.log(`\n  Passed: ${passed}/${passed + failed}`);

  // Count how many items isAnime() flags
  const pool = await prisma.item.findMany({
    where: { type: { in: ["tv","movie"] }, parentItemId: null },
    select: { id: true, title: true, type: true, genre: true, malId: true, ext: true, people: true },
  });
  const animeItems = pool.filter(i => isAnime(i as any));
  console.log(`  Total items passing isAnime(): ${animeItems.length} (out of ${pool.length} tv/movie top-level items)`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
