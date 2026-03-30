/**
 * Refresh trending data from TMDB for movies and TV shows.
 * Updates popularityScore so "Popular Right Now" reflects what's
 * actually trending this week, not stale import-time scores.
 *
 * Run manually:   npx tsx scripts/refresh-trending.ts
 * Run weekly:     add to Vercel cron or scheduled task
 *
 * Endpoints used:
 *   GET /trending/movie/week  — top 20 trending movies this week
 *   GET /trending/tv/week     — top 20 trending TV shows this week
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TMDB_KEY = process.env.TMDB_API_KEY;
if (!TMDB_KEY) {
  console.error("❌ TMDB_API_KEY not set in .env");
  process.exit(1);
}

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

async function fetchTMDB(path: string): Promise<any> {
  const res = await fetch(`https://api.themoviedb.org/3${path}?api_key=${TMDB_KEY}`);
  if (!res.ok) throw new Error(`TMDB ${path} → HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log("🎬 Refreshing TMDB trending data...\n");

  const [movieWeek, tvWeek] = await Promise.all([
    fetchTMDB("/trending/movie/week"),
    fetchTMDB("/trending/tv/week"),
  ]);

  const movieResults: any[] = movieWeek.results || [];
  const tvResults: any[] = tvWeek.results || [];

  console.log(`Fetched ${movieResults.length} trending movies, ${tvResults.length} trending TV shows`);

  let updatedMovies = 0, updatedTv = 0, notFound = 0;

  // ── Update movies ──────────────────────────────────────────────
  for (let i = 0; i < movieResults.length; i++) {
    const item = movieResults[i];
    // Trending score: position 1 = 1000, position 2 = 950, etc.
    // Also incorporate TMDB's own popularity float for finer ordering
    const trendingScore = (movieResults.length - i) * 50 + (item.popularity || 0);

    if (item.id) {
      const found = await prisma.item.findFirst({ where: { tmdbId: item.id, type: "movie" } });
      if (found) {
        await prisma.item.update({ where: { id: found.id }, data: { popularityScore: trendingScore } });
        updatedMovies++;
        console.log(`  🎬 [${i + 1}] ${item.title} → score ${Math.round(trendingScore)}`);
      } else {
        notFound++;
      }
    }
  }

  // ── Update TV shows ────────────────────────────────────────────
  for (let i = 0; i < tvResults.length; i++) {
    const item = tvResults[i];
    const trendingScore = (tvResults.length - i) * 50 + (item.popularity || 0);

    if (item.id) {
      const found = await prisma.item.findFirst({ where: { tmdbId: item.id, type: "tv" } });
      if (found) {
        await prisma.item.update({ where: { id: found.id }, data: { popularityScore: trendingScore } });
        updatedTv++;
        console.log(`  📺 [${i + 1}] ${item.name} → score ${Math.round(trendingScore)}`);
      } else {
        notFound++;
      }
    }
  }

  console.log(`\n✓ Refreshed trending: ${updatedMovies} movies, ${updatedTv} TV shows updated`);
  if (notFound > 0) console.log(`  (${notFound} trending items not found in our DB — not yet imported)`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);

  await prisma.$disconnect();
}

main().catch(console.error);
