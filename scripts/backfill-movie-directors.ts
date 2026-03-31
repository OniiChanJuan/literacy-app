/**
 * Backfill missing director/creator data for movies and TV shows via TMDB credits API.
 *
 * Coverage before backfill:
 *   movies: ~7% have people (5,520 missing directors)
 *   tv:     ~33% have people (3,238 missing)
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/backfill-movie-directors.ts
 *   npx dotenv-cli -e .env -- npx tsx scripts/backfill-movie-directors.ts --type=movie
 *   npx dotenv-cli -e .env -- npx tsx scripts/backfill-movie-directors.ts --limit=100
 *   npx dotenv-cli -e .env -- npx tsx scripts/backfill-movie-directors.ts --dry-run
 *
 * This script is safe to re-run — it skips items that already have people data.
 * Rate limit: TMDB allows ~40 req/s. We use a 100ms delay between requests.
 */

import { Client } from "pg";

const TMDB_KEY = process.env.TMDB_API_KEY || "";
const BASE = "https://api.themoviedb.org/3";
const DELAY_MS = 120; // ~8 req/s to stay well under limit

const args = process.argv.slice(2);
const typeArg = args.find((a) => a.startsWith("--type="))?.split("=")[1];
const limitArg = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "9999");
const dryRun = args.includes("--dry-run");

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchCredits(type: "movie" | "tv", tmdbId: number): Promise<{ name: string; role: string }[]> {
  const url = `${BASE}/${type}/${tmdbId}/credits?api_key=${TMDB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const people: { name: string; role: string }[] = [];

  if (type === "movie") {
    // Director from crew
    const director = (data.crew || []).find((c: any) => c.job === "Director");
    if (director) people.push({ name: director.name, role: "Director" });
    // Top 3 cast
    for (const c of (data.cast || []).slice(0, 3)) {
      people.push({ name: c.name, role: "Star" });
    }
  } else {
    // TV: created_by from show details, then crew
    const creator = (data.crew || []).find((c: any) => c.job === "Creator" || c.job === "Executive Producer");
    if (creator) people.push({ name: creator.name, role: "Creator" });
    for (const c of (data.cast || []).slice(0, 3)) {
      people.push({ name: c.name, role: "Star" });
    }
  }

  return people;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const types = typeArg ? [typeArg] : ["movie", "tv"];

  // Report coverage
  for (const t of ["movie", "tv"]) {
    const r = await client.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE people IS NOT NULL AND jsonb_array_length(people) > 0) as has_people
       FROM items WHERE type = $1 AND parent_item_id IS NULL`,
      [t],
    );
    const { total, has_people } = r.rows[0];
    const pct = Math.round((has_people / total) * 100);
    console.log(`${t}: ${total} total, ${has_people} have people (${pct}%), ${total - has_people} missing`);
  }

  if (dryRun) {
    console.log("\nDry run — no changes made.");
    await client.end();
    return;
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const type of types) {
    console.log(`\nProcessing ${type}s...`);

    const rows = await client.query(
      `SELECT id, tmdb_id FROM items
       WHERE type = $1
         AND parent_item_id IS NULL
         AND tmdb_id IS NOT NULL
         AND (people IS NULL OR jsonb_array_length(people) = 0)
       ORDER BY popularity_score DESC
       LIMIT $2`,
      [type, limitArg],
    );

    console.log(`Found ${rows.rows.length} ${type}s with missing people data.`);

    for (const row of rows.rows) {
      try {
        const people = await fetchCredits(type as "movie" | "tv", row.tmdb_id);
        if (people.length === 0) {
          skipped++;
        } else {
          await client.query(
            "UPDATE items SET people = $1 WHERE id = $2",
            [JSON.stringify(people), row.id],
          );
          updated++;
          if (updated % 50 === 0) console.log(`  Updated ${updated} items...`);
        }
      } catch (e: any) {
        failed++;
        if (failed % 20 === 0) console.log(`  ${failed} failures so far`);
      }
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone. Updated: ${updated}, skipped (no data): ${skipped}, failed: ${failed}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
