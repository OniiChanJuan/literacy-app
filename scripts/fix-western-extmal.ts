/**
 * Fix Western animation false positives caused by backfill-mal-scores.ts
 * fetching ext.mal for Western animated titles that happen to be in MAL.
 *
 * MAL catalogs ALL animation (Disney, Pixar, DreamWorks, etc.), not just Japanese anime.
 * So having ext.mal does NOT mean something is anime.
 *
 * This script:
 * 1. Lists all items with ext.mal but no 'Anime' genre (the ambiguous group)
 * 2. Removes ext.mal from confirmed Western animation
 * 3. Fixes wrongly-assigned malIds (The Hobbit, Spectacular Spider-Man got malId=59907 = The Owl House)
 * 4. Removes 'Anime' genre from remaining Western animation false positives
 * 5. Leaves real anime untouched
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

// Known Western animation studios — items from these are never anime
const WESTERN_STUDIOS = [
  "Disney", "Pixar", "DreamWorks", "Illumination", "Blue Sky",
  "Laika", "Aardman", "Warner Bros. Animation", "Cartoon Network",
  "Nickelodeon", "Sony Pictures Animation", "20th Century Animation",
  "Netflix Animation", "Universal Animation",
];

// Confirmed Western animation: items we KNOW are not anime
// Format: { id, title, reason }
// These are items that passed isAnime() incorrectly
const WESTERN_ANIMATION_IDS: Record<number, string> = {
  // --- ext.mal false positives (Western animation in MAL database) ---
  81:    "The Lion King — Disney",
  1398:  "Toy Story — Pixar",
  1399:  "Toy Story 3 — Pixar",
  1400:  "Toy Story 2 — Pixar",
  1401:  "Toy Story 4 — Pixar",
  1402:  "Toy Story That Time Forgot — Pixar",
  1403:  "Toy Story of Terror! — Pixar",
  118:   "Coco — Pixar",
  353:   "Bluey — Australian (BBC Studios)",
  295:   "Avatar: The Last Airbender — Nickelodeon/American",
  330:   "Gravity Falls — Disney",
  305:   "Rick and Morty — Adult Swim/American",
  383:   "Les Contes de la rue Broca — French animation",
  113:   "Puss in Boots: The Last Wish — DreamWorks",
  94:    "Klaus — Netflix/Spanish",
  68:    "Once Upon a Studio — Disney",
  128:   "Steven Universe: The Movie — Cartoon Network",
  289:   "GOAT — Western animation",
  141:   "Piper — Pixar short",
  188:   "Soul — Pixar",
  // --- 'Anime' genre false positives ---
  305:   "Rick and Morty — Adult Swim/American (also in Anime genre list)",
  1333:  "Star Wars Resistance — Lucasfilm/Disney",
  341:   "The Spectacular Spider-Man — Sony/Marvel Western animation",
  1358:  "The Hobbit (1977) — Rankin/Bass Western animation",
};

// Items with wrong malId assignments (contaminated by cross-reference script)
// These got malId=59907 (The Owl House) incorrectly
const WRONG_MAL_IDS: number[] = [341, 1358]; // Spectacular Spider-Man, The Hobbit

// Legitimate anime that should be KEPT even if they have "family" appearance:
// Spirited Away, My Neighbor Totoro, etc. — keep these, they have "Anime" genre
// Flow (2024 Latvian) — not Japanese anime, handle separately
// David (2022) — biblical short, not anime

async function main() {
  console.log("=== Fixing Western animation false positives ===\n");

  // --- STEP 1: List all items with ext.mal but NO 'Anime' genre ---
  const extMalNoGenre = await prisma.$queryRaw<any[]>`
    SELECT id, title, type, genre, mal_id, tmdb_id, ext
    FROM items
    WHERE type IN ('tv','movie')
    AND (ext->>'mal') IS NOT NULL
    AND NOT ('Anime' = ANY(genre))
    AND parent_item_id IS NULL
    ORDER BY vote_count DESC NULLS LAST
  `;

  console.log(`Items with ext.mal but NO 'Anime' genre: ${extMalNoGenre.length}`);
  extMalNoGenre.forEach((i: any) => {
    const isWestern = WESTERN_ANIMATION_IDS[i.id] !== undefined;
    console.log(`  ${isWestern ? "🚨 WESTERN" : "❓ UNKNOWN"} [${i.id}] ${i.title} (${i.type}) | malId=${i.mal_id} | tmdbId=${i.tmdb_id} | ext.mal=${(i.ext as any)?.mal}`);
  });

  // --- STEP 2: Fix wrong malId assignments ---
  console.log("\n--- Fixing wrong malId assignments ---");
  for (const id of WRONG_MAL_IDS) {
    const item = await prisma.item.findUnique({ where: { id }, select: { id: true, title: true, malId: true } });
    if (!item) continue;
    console.log(`  Clearing wrong malId=${item.malId} from [${id}] ${item.title}`);
    await prisma.item.update({ where: { id }, data: { malId: null } });
  }

  // --- STEP 3: Remove ext.mal from confirmed Western animation ---
  console.log("\n--- Removing ext.mal from Western animation ---");
  let extMalRemoved = 0;
  const westernIds = Object.keys(WESTERN_ANIMATION_IDS).map(Number);
  for (const id of westernIds) {
    const item = await prisma.item.findUnique({
      where: { id },
      select: { id: true, title: true, ext: true, genre: true },
    });
    if (!item) continue;
    const ext = item.ext as Record<string, any> | null;
    if (!ext?.mal) continue; // No ext.mal to remove

    // Remove ext.mal but keep other ext fields (imdb, rt, etc.)
    const { mal, ...restExt } = ext;
    await prisma.item.update({ where: { id }, data: { ext: restExt } });
    console.log(`  Removed ext.mal=${mal} from [${id}] ${item.title} (${WESTERN_ANIMATION_IDS[id]})`);
    extMalRemoved++;
  }
  console.log(`  Total ext.mal removed: ${extMalRemoved}`);

  // --- STEP 4: Remove 'Anime' genre from Western animation false positives ---
  console.log("\n--- Removing 'Anime' genre from Western animation ---");
  let genreRemoved = 0;
  // Items with 'Anime' genre that are Western: Rick and Morty, Star Wars Resistance,
  // The Spectacular Spider-Man, The Hobbit, David, Flow, and anything else
  const animeGenreWestern = [
    305,   // Rick and Morty
    1333,  // Star Wars Resistance
    341,   // The Spectacular Spider-Man (also has wrong malId fixed above)
    1358,  // The Hobbit (also has wrong malId fixed above)
    236,   // David (biblical animated short — not anime)
    193,   // Flow (2024 Latvian animated film — not Japanese anime)
  ];
  for (const id of animeGenreWestern) {
    const item = await prisma.item.findUnique({
      where: { id },
      select: { id: true, title: true, genre: true },
    });
    if (!item) { console.log(`  [${id}] NOT FOUND`); continue; }
    if (!item.genre.includes("Anime")) {
      console.log(`  [${id}] ${item.title} — no Anime genre, skipping`);
      continue;
    }
    await prisma.item.update({
      where: { id },
      data: { genre: item.genre.filter((g) => g !== "Anime") },
    });
    console.log(`  Removed 'Anime' genre from [${id}] ${item.title}`);
    genreRemoved++;
  }
  console.log(`  Total Anime genre removed: ${genreRemoved}`);

  // --- STEP 5: Verify the unknown items (extMalNoGenre that aren't in WESTERN_ANIMATION_IDS) ---
  const unknownItems = extMalNoGenre.filter((i: any) => WESTERN_ANIMATION_IDS[i.id] === undefined);
  if (unknownItems.length > 0) {
    console.log(`\n--- UNKNOWN items with ext.mal but no Anime genre (need manual review) ---`);
    unknownItems.forEach((i: any) => {
      console.log(`  [${i.id}] ${i.title} (${i.type}) | malId=${i.mal_id} | tmdbId=${i.tmdb_id} | ext.mal=${(i.ext as any)?.mal} | genres: ${JSON.stringify(i.genre)}`);
    });
  }

  // Final count
  const finalAnimeGenre = await prisma.item.count({ where: { type: { in: ["tv","movie"] }, genre: { has: "Anime" }, parentItemId: null } });
  const finalExtMal = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count FROM items
    WHERE type IN ('tv','movie') AND (ext->>'mal') IS NOT NULL AND parent_item_id IS NULL
  `;
  console.log(`\n=== Final counts ===`);
  console.log(`  Items with 'Anime' genre: ${finalAnimeGenre}`);
  console.log(`  Items with ext.mal: ${finalExtMal[0].count}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
