/**
 * Fix movie runtimes in the database.
 *
 * The enrichment script previously set totalEp = 1 for all movies,
 * but totalEp should store the actual runtime in minutes (e.g. 83 for
 * Ghost in the Shell). This script fetches the real runtime from TMDB
 * and updates each affected movie.
 *
 * Run: npx tsx scripts/fix-runtimes.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const TMDB_BASE = "https://api.themoviedb.org/3";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  console.log("Fix Movie Runtimes\n");

  if (!TMDB_KEY) {
    console.error("TMDB_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Find movies with totalEp <= 1 that have a TMDB ID
  const movies = await prisma.item.findMany({
    where: {
      type: "movie",
      totalEp: { lte: 1 },
      tmdbId: { not: null },
    },
    select: {
      id: true,
      title: true,
      tmdbId: true,
      totalEp: true,
    },
  });

  console.log(`Found ${movies.length} movies with totalEp <= 1 and a TMDB ID\n`);

  if (movies.length === 0) {
    console.log("Nothing to fix.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    try {
      const url = `${TMDB_BASE}/movie/${movie.tmdbId}?api_key=${TMDB_KEY}`;
      const data = await fetchJson(url);
      await sleep(250);

      const runtime: number | undefined = data.runtime;

      if (runtime && runtime > 0) {
        await prisma.item.update({
          where: { id: movie.id },
          data: { totalEp: runtime },
        });
        console.log(
          `  [${i + 1}/${movies.length}] ${movie.title} — runtime: ${runtime} min`
        );
        updated++;
      } else {
        console.log(
          `  [${i + 1}/${movies.length}] ${movie.title} — no runtime from TMDB, skipped`
        );
        skipped++;
      }
    } catch (e: any) {
      console.error(
        `  [${i + 1}/${movies.length}] ${movie.title} — ERROR: ${e.message}`
      );
      errors++;
      await sleep(250);
    }
  }

  console.log("\n================================================================");
  console.log("RUNTIME FIX SUMMARY");
  console.log("================================================================\n");
  console.log(`  Total movies found:  ${movies.length}`);
  console.log(`  Updated:             ${updated}`);
  console.log(`  Skipped (no data):   ${skipped}`);
  console.log(`  Errors:              ${errors}`);
  console.log("\n================================================================\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
