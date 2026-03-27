/**
 * Fetch real IMDb, Rotten Tomatoes, and Metacritic scores via OMDb API.
 *
 * OMDb returns actual IMDb ratings (not TMDB's community score), RT critic %,
 * and Metacritic score — all in one API call per movie/TV show.
 *
 * Requires OMDB_API_KEY environment variable (free tier: 1,000 req/day).
 *
 * Run: npx tsx scripts/sync-omdb-scores.ts
 * Options:
 *   --limit=100         Process only N items (default: 900 to stay under daily limit)
 *   --skip-existing     Skip items that already have an 'imdb' score in ExternalScore
 *   --dry-run           Print what would be stored without writing to DB
 *
 * Run daily until all movies/TV are covered. Popular items (by TMDB vote count)
 * are processed first so they get real scores first.
 *
 * After running, movies/TV will show real IMDb, RT, and Metacritic scores
 * instead of the TMDB community average mislabeled as "IMDb".
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const OMDB_KEY = process.env.OMDB_API_KEY!;
const TMDB_KEY = process.env.TMDB_API_KEY!;

if (!OMDB_KEY) {
  console.error("❌ OMDB_API_KEY environment variable not set");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : 900;
const SKIP_EXISTING = args.includes("--skip-existing");
const DRY_RUN = args.includes("--dry-run");

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Get TMDB external IDs (includes imdb_id) for a movie or TV show */
async function getTmdbImdbId(tmdbId: string | null, type: string, title: string, year: number): Promise<string | null> {
  if (!TMDB_KEY) return null;
  try {
    if (tmdbId) {
      const mediaType = type === "movie" ? "movie" : "tv";
      const data = await fetchJson(
        `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`
      );
      await sleep(260);
      return data.imdb_id || null;
    }
    // Search by title if no TMDB ID stored
    const mediaType = type === "movie" ? "movie" : "tv";
    const searchData = await fetchJson(
      `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}&year=${year}`
    );
    await sleep(260);
    const match = (searchData.results || [])[0];
    if (!match) return null;
    const extData = await fetchJson(
      `https://api.themoviedb.org/3/${mediaType}/${match.id}/external_ids?api_key=${TMDB_KEY}`
    );
    await sleep(260);
    return extData.imdb_id || null;
  } catch {
    return null;
  }
}

interface OmdbResult {
  imdbRating?: number;
  imdbVotes?: number;
  rtCritics?: number;
  metacritic?: number;
}

/** Fetch scores from OMDb for an IMDb ID */
async function fetchOmdb(imdbId: string): Promise<OmdbResult | null> {
  try {
    const data = await fetchJson(
      `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}&tomatoes=true`
    );
    if (data.Response === "False") return null;

    const result: OmdbResult = {};

    // IMDb rating (X.X/10)
    if (data.imdbRating && data.imdbRating !== "N/A") {
      result.imdbRating = parseFloat(data.imdbRating);
    }

    // IMDb vote count (stored as string: "1,234,567")
    if (data.imdbVotes && data.imdbVotes !== "N/A") {
      result.imdbVotes = parseInt(data.imdbVotes.replace(/,/g, ""), 10);
    }

    // Rotten Tomatoes critic score from Ratings array
    const rtEntry = (data.Ratings || []).find((r: any) => r.Source === "Rotten Tomatoes");
    if (rtEntry?.Value) {
      const rtVal = parseInt(rtEntry.Value.replace("%", ""), 10);
      if (!isNaN(rtVal)) result.rtCritics = rtVal;
    }

    // Metacritic score
    if (data.Metascore && data.Metascore !== "N/A") {
      const meta = parseInt(data.Metascore, 10);
      if (!isNaN(meta)) result.metacritic = meta;
    }

    return result;
  } catch {
    return null;
  }
}

async function upsertScore(
  prisma: any,
  itemId: number,
  source: string,
  score: number,
  maxScore: number,
  scoreType: string,
  label: string = ""
) {
  await prisma.externalScore.upsert({
    where: { itemId_source: { itemId, source } },
    update: { score, maxScore, scoreType, label, updatedAt: new Date() },
    create: { itemId, source, score, maxScore, scoreType, label },
  });
  // Also update ext JSON
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { ext: true } });
  if (item) {
    const ext = (item.ext as Record<string, number>) || {};
    await prisma.item.update({ where: { id: itemId }, data: { ext: { ...ext, [source]: score } as any } });
  }
}

async function main() {
  console.log(`🎬 OMDb Score Sync${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`   Limit: ${LIMIT} items | Skip existing: ${SKIP_EXISTING}\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Get all movie + TV items, sorted by voteCount DESC (most popular first)
  const items = await prisma.item.findMany({
    where: { type: { in: ["movie", "tv"] }, isUpcoming: false },
    select: { id: true, title: true, type: true, year: true, voteCount: true, ext: true },
    orderBy: { voteCount: "desc" },
  });
  console.log(`Found ${items.length} movie/TV items\n`);

  let toProcess = items;

  if (SKIP_EXISTING) {
    const existingImdb = await prisma.externalScore.findMany({
      where: { source: "imdb" },
      select: { itemId: true },
    });
    const hasImdb = new Set(existingImdb.map((e: any) => e.itemId));
    toProcess = items.filter((i) => !hasImdb.has(i.id));
    console.log(`${toProcess.length} items without real IMDb scores (after --skip-existing filter)\n`);
  }

  toProcess = toProcess.slice(0, LIMIT);
  console.log(`Processing ${toProcess.length} items (limit: ${LIMIT})\n`);

  const stats = { processed: 0, imdb: 0, rt: 0, meta: 0, notFound: 0, errors: 0 };

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];

    try {
      // Step 1: Get IMDb ID via TMDB
      const imdbId = await getTmdbImdbId(null, item.type, item.title, item.year);
      if (!imdbId) {
        console.log(`  ○ [${i + 1}/${toProcess.length}] "${item.title}" (${item.year}) — no IMDb ID found`);
        stats.notFound++;
        continue;
      }

      // Step 2: Fetch OMDb data
      const omdb = await fetchOmdb(imdbId);
      await sleep(150); // OMDb rate limit buffer

      if (!omdb) {
        console.log(`  ✗ [${i + 1}/${toProcess.length}] "${item.title}" — OMDb returned no data for ${imdbId}`);
        stats.notFound++;
        continue;
      }

      const parts: string[] = [];

      if (!DRY_RUN) {
        if (omdb.imdbRating !== undefined) {
          await upsertScore(prisma, item.id, "imdb", omdb.imdbRating, 10, "community", "IMDb");
          stats.imdb++;
          // Also update voteCount if we got real IMDb votes
          if (omdb.imdbVotes && omdb.imdbVotes > (item.voteCount || 0)) {
            await prisma.item.update({ where: { id: item.id }, data: { voteCount: omdb.imdbVotes } });
          }
        }
        if (omdb.rtCritics !== undefined) {
          await upsertScore(prisma, item.id, "rt_critics", omdb.rtCritics, 100, "critics", "RT Critics");
          stats.rt++;
        }
        if (omdb.metacritic !== undefined) {
          await upsertScore(prisma, item.id, "metacritic", omdb.metacritic, 100, "critics", "Metacritic");
          stats.meta++;
        }
      }

      if (omdb.imdbRating !== undefined) parts.push(`IMDb ${omdb.imdbRating}`);
      if (omdb.rtCritics !== undefined) parts.push(`RT ${omdb.rtCritics}%`);
      if (omdb.metacritic !== undefined) parts.push(`Meta ${omdb.metacritic}`);

      console.log(`  ✓ [${i + 1}/${toProcess.length}] "${item.title}" (${item.year}): ${parts.join(", ") || "no scores"}`);
      stats.processed++;
    } catch (e: any) {
      console.log(`  ✗ [${i + 1}/${toProcess.length}] "${item.title}" — error: ${e.message?.slice(0, 60)}`);
      stats.errors++;
    }
  }

  console.log("\n════════════════════════════════════════════════════════");
  console.log("📊 OMDb Sync Summary");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  Processed:       ${stats.processed}`);
  console.log(`  IMDb scores:     ${stats.imdb}`);
  console.log(`  RT scores:       ${stats.rt}`);
  console.log(`  Metacritic:      ${stats.meta}`);
  console.log(`  Not found:       ${stats.notFound}`);
  console.log(`  Errors:          ${stats.errors}`);
  console.log(`\n  Remaining: ${items.length - stats.processed - stats.notFound - stats.errors} items`);
  console.log("  Run again tomorrow to process the next batch (OMDb: 1,000 req/day limit)");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("OMDb sync failed:", e);
  process.exit(1);
});
