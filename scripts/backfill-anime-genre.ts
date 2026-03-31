/**
 * Backfill 'Anime' genre on confirmed anime items.
 *
 * Targets TV/movie items that:
 *   - Have a MAL ID (confirmed in the anime database via cross-referencing)
 *   - Already have 'Animation' genre (they're animated)
 *   - Do NOT already have 'Anime' genre
 *   - Are NOT pure Western kids animation:
 *     excluded if genre has Kids/Family but NO mature genre
 *     (Action, Sci-Fi, Fantasy, Drama, Horror, Mystery, Thriller, Romance, Adventure, Suspense)
 *
 * Run: npx tsx scripts/backfill-anime-genre.ts
 * Safe to re-run — idempotent (skips items already tagged).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

const MATURE_GENRES = new Set([
  "Action", "Sci-Fi", "Fantasy", "Drama", "Horror",
  "Mystery", "Thriller", "Romance", "Adventure", "Suspense",
]);

async function main() {
  console.log("=== Backfill: Adding 'Anime' genre to confirmed anime items ===\n");

  // Find candidates: has malId, has 'Animation', missing 'Anime'
  const candidates = await prisma.item.findMany({
    where: {
      malId: { not: null },
      type: { in: ["tv", "movie"] },
      genre: { has: "Animation" },
      NOT: { genre: { has: "Anime" } },
      parentItemId: null,
    },
    select: { id: true, title: true, type: true, genre: true, malId: true },
  });

  console.log(`Found ${candidates.length} candidates with malId + 'Animation' but missing 'Anime' genre`);

  let updated = 0;
  let skipped = 0;
  const skippedItems: string[] = [];

  for (const item of candidates) {
    const hasKidsFamily = item.genre.includes("Kids") || item.genre.includes("Family");
    const hasMatureGenre = item.genre.some((g) => MATURE_GENRES.has(g));

    // Skip Western kids animation: has Kids/Family but no mature genres
    if (hasKidsFamily && !hasMatureGenre) {
      skipped++;
      skippedItems.push(`  SKIP [${item.id}] ${item.title} — genres: ${item.genre.join(", ")}`);
      continue;
    }

    await prisma.item.update({
      where: { id: item.id },
      data: { genre: [...item.genre, "Anime"] },
    });
    updated++;

    if (updated <= 20 || updated % 100 === 0) {
      console.log(`  ✓ [${item.id}] ${item.title} (${item.type}) — malId:${item.malId} — genres now: [..., Anime]`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`  Updated: ${updated} items now have 'Anime' genre`);
  console.log(`  Skipped (Western kids animation): ${skipped} items`);

  if (skippedItems.length > 0) {
    console.log(`\n  Skipped items (Western kids animation guard):`);
    skippedItems.forEach((s) => console.log(s));
  }

  // Verification: count items that now pass anime detection
  const withAnimeGenre = await prisma.item.count({
    where: { type: { in: ["tv", "movie"] }, genre: { has: "Anime" } },
  });
  const withExtMal = await prisma.item.count({
    where: {
      type: { in: ["tv", "movie"] },
      NOT: { genre: { has: "Anime" } },
    },
  });
  console.log(`\n=== Post-backfill counts ===`);
  console.log(`  TV/movie items with 'Anime' genre: ${withAnimeGenre}`);

  // Spot check key titles
  const checks = [
    { title: "Attack on Titan", id: 307 },
    { title: "Death Note", id: 323 },
    { title: "Fullmetal Alchemist: Brotherhood", id: 301 },
    { title: "One Piece", id: 298 },
  ];

  console.log(`\n=== Spot checks ===`);
  for (const check of checks) {
    const item = await prisma.item.findUnique({
      where: { id: check.id },
      select: { title: true, genre: true, malId: true },
    });
    if (item) {
      const hasAnime = item.genre.includes("Anime");
      console.log(`  ${item.title}: genre=${JSON.stringify(item.genre)} malId=${item.malId} → isAnime=${hasAnime ? "✓ YES" : "✗ NO"}`);
    }
  }

  // Bluey check (should NOT get Anime)
  const bluey = await prisma.item.findFirst({ where: { title: "Bluey" }, select: { title: true, genre: true, malId: true } });
  if (bluey) {
    console.log(`  ${bluey.title}: genre=${JSON.stringify(bluey.genre)} → isAnime=${bluey.genre.includes("Anime") ? "⚠ YES (unexpected)" : "✓ NO (correct)"}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
