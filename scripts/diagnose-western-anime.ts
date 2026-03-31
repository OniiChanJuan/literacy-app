/**
 * Diagnose Western animation false positives in isAnime() detection.
 * Shows every item that currently passes isAnime() but is clearly Western animation.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

// Current isAnime() logic (mirrored from src/lib/anime.ts)
function isAnime(item: { type: string; genre: string[]; malId: number | null; ext: any }): boolean {
  if (item.type !== "tv" && item.type !== "movie") return false;
  const ext = item.ext as Record<string, any> | null;
  if (ext && ext.mal != null) return true;
  if (item.genre?.includes("Anime")) return true;
  return false;
}

async function main() {
  // --- 1. Specifically check all mentioned titles ---
  const suspects = [
    "The Lion King", "Toy Story", "Finding Nemo", "Frozen", "Shrek",
    "The Incredibles", "Up", "Inside Out", "Coco", "Moana", "Ratatouille",
    "WALL-E", "Zootopia", "Spider-Man: Into the Spider-Verse",
    "Avatar: The Last Airbender", "Adventure Time", "Steven Universe",
    "Gravity Falls", "Rick and Morty", "Bluey", "Primal", "Castlevania", "Arcane",
    // True anime (should pass)
    "Attack on Titan", "Death Note", "Fullmetal Alchemist: Brotherhood",
    "Spirited Away", "Dragon Ball Z", "Naruto", "One Piece", "Cowboy Bebop",
  ];

  console.log("=== Spot check: known titles ===\n");
  for (const title of suspects) {
    const item = await prisma.item.findFirst({
      where: { title: { contains: title, mode: "insensitive" }, type: { in: ["tv","movie"] }, parentItemId: null },
      select: { id: true, title: true, type: true, genre: true, malId: true, ext: true, people: true },
      orderBy: { voteCount: "desc" },
    });
    if (!item) { console.log(`  [NOT FOUND] ${title}`); continue; }
    const anime = isAnime(item);
    const ext = item.ext as any;
    const why = anime
      ? (ext?.mal != null ? `ext.mal=${ext.mal}` : `genre has 'Anime'`)
      : "not anime";
    console.log(
      `  ${anime ? "🚨 ANIME" : "✓  not "} [${item.id}] ${item.title} (${item.type}) | malId=${item.malId} | why: ${why} | genres: ${JSON.stringify(item.genre)}`
    );
  }

  // --- 2. Broad scan: all items passing isAnime() that have 'Anime' genre but no ext.mal ---
  // These are the ones added by backfill — most suspicious group
  const backfilledAnime = await prisma.item.findMany({
    where: {
      type: { in: ["tv","movie"] },
      genre: { has: "Anime" },
      parentItemId: null,
    },
    select: { id: true, title: true, type: true, genre: true, malId: true, ext: true, tmdbId: true },
    orderBy: { voteCount: "desc" },
  });

  // Items with 'Anime' genre but no ext.mal — sourced from TMDB, not Jikan
  const tmdbWithAnimeGenre = backfilledAnime.filter(i => {
    const ext = i.ext as any;
    return ext?.mal == null && i.tmdbId != null;
  });

  console.log(`\n=== Items with 'Anime' genre + tmdbId but NO ext.mal (backfill candidates) ===`);
  console.log(`Total: ${tmdbWithAnimeGenre.length}\n`);
  tmdbWithAnimeGenre.slice(0, 40).forEach(i => {
    console.log(`  [${i.id}] ${i.title} (${i.type}) | tmdbId=${i.tmdbId} | malId=${i.malId} | genres: ${JSON.stringify(i.genre)}`);
  });
  if (tmdbWithAnimeGenre.length > 40) console.log(`  ... and ${tmdbWithAnimeGenre.length - 40} more`);

  // --- 3. Items with ext.mal that look Western ---
  const withMalScore = await prisma.$queryRaw<any[]>`
    SELECT id, title, type, genre, mal_id, ext, tmdb_id
    FROM items
    WHERE type IN ('tv','movie')
    AND (ext->>'mal') IS NOT NULL
    AND parent_item_id IS NULL
    ORDER BY vote_count DESC NULLS LAST
    LIMIT 20
  `;
  console.log(`\n=== Top 20 items with ext.mal score (spot check for false positives) ===\n`);
  withMalScore.forEach((i: any) => {
    console.log(`  [${i.id}] ${i.title} (${i.type}) | malId=${i.mal_id} | ext.mal=${(i.ext as any)?.mal} | genres: ${JSON.stringify(i.genre)}`);
  });

  // --- 4. Total counts ---
  const totalAnimeGenre = await prisma.item.count({ where: { type: { in: ["tv","movie"] }, genre: { has: "Anime" }, parentItemId: null } });
  const totalExtMal = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count FROM items
    WHERE type IN ('tv','movie') AND (ext->>'mal') IS NOT NULL AND parent_item_id IS NULL
  `;
  console.log(`\n=== Totals ===`);
  console.log(`  Items with 'Anime' genre: ${totalAnimeGenre}`);
  console.log(`  Items with ext.mal score: ${totalExtMal[0].count}`);
  console.log(`  Items with BOTH (overlap): ${backfilledAnime.filter(i => (i.ext as any)?.mal != null).length}`);
  console.log(`  Items with ONLY 'Anime' genre (no ext.mal): ${backfilledAnime.filter(i => (i.ext as any)?.mal == null).length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
