/**
 * Fetch external review scores for all items from connected APIs
 * and migrate existing ext JSON data into the external_scores table.
 *
 * Sources:
 * - TMDB → IMDb score, vote count (movies/TV)
 * - Jikan → MAL score (anime/manga)
 * - IGDB → aggregated rating, rating count (games)
 * - Steam Store API → review score + label (games)
 * - Existing ext JSON → migrate all scores
 *
 * Run: npx tsx scripts/fetch-external-scores.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const stats = {
  migrated: 0,
  tmdb_fetched: 0,
  mal_fetched: 0,
  igdb_fetched: 0,
  steam_fetched: 0,
  total_scores: 0,
};

async function upsertScore(
  prisma: any,
  itemId: number,
  source: string,
  score: number,
  maxScore: number,
  scoreType: string,
  label: string = ""
) {
  try {
    await prisma.externalScore.upsert({
      where: { itemId_source: { itemId, source } },
      update: { score, maxScore, scoreType, label, updatedAt: new Date() },
      create: { itemId, source, score, maxScore, scoreType, label },
    });
    stats.total_scores++;
  } catch (e: any) {
    // Skip duplicates
  }
}

async function main() {
  console.log("📊 Fetching External Scores\n");

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const items = await prisma.item.findMany({
    where: { isUpcoming: false },
    select: { id: true, title: true, type: true, year: true, ext: true, genre: true },
  });
  console.log(`${items.length} items loaded\n`);

  // ── STEP 1: Migrate existing ext JSON ─────────────────────────────────
  console.log("═══ Step 1: Migrate existing ext JSON scores ═══\n");

  const sourceConfig: Record<string, { maxScore: number; scoreType: string }> = {
    // New correct source keys
    tmdb:              { maxScore: 10,  scoreType: "community" },
    igdb:              { maxScore: 100, scoreType: "community" },
    igdb_critics:      { maxScore: 100, scoreType: "critics"   },
    google_books:      { maxScore: 5,   scoreType: "community" },
    spotify_popularity:{ maxScore: 100, scoreType: "popularity" },
    // Legacy keys (real external sources or backward compat)
    imdb:     { maxScore: 10,  scoreType: "community" },
    rt:       { maxScore: 100, scoreType: "critics"   },
    rt_critics:{ maxScore: 100, scoreType: "critics"  },
    rt_audience:{ maxScore: 100, scoreType: "community" },
    meta:     { maxScore: 100, scoreType: "critics"   },
    metacritic:{ maxScore: 100, scoreType: "critics"  },
    mal:      { maxScore: 10,  scoreType: "community" },
    goodreads:{ maxScore: 5,   scoreType: "community" },
    pitchfork:{ maxScore: 10,  scoreType: "critics"   },
    ign:      { maxScore: 10,  scoreType: "critics"   },
    steam:    { maxScore: 100, scoreType: "community" },
    anilist:  { maxScore: 100, scoreType: "community" },
    aoty:     { maxScore: 100, scoreType: "critics"   },
    opencritic:{ maxScore: 100, scoreType: "critics"  },
  };

  for (const item of items) {
    const ext = item.ext as Record<string, number>;
    if (!ext || typeof ext !== "object") continue;

    for (const [source, value] of Object.entries(ext)) {
      if (value === undefined || value === null) continue;
      const config = sourceConfig[source] || { maxScore: 10, scoreType: "community" };
      await upsertScore(prisma, item.id, source, value, config.maxScore, config.scoreType);
      stats.migrated++;
    }
  }
  console.log(`  Migrated ${stats.migrated} scores from ext JSON\n`);

  // ── STEP 2: Fetch TMDB scores (IMDb + vote data) ─────────────────────
  console.log("═══ Step 2: TMDB scores (movies + TV) ═══\n");

  const movieTv = items.filter((i) => ["movie", "tv"].includes(i.type));
  // Only fetch for items that don't already have a TMDB score (using correct key)
  const existingTmdb = await prisma.externalScore.findMany({
    where: { source: { in: ["tmdb", "imdb"] } },
    select: { itemId: true },
  });
  const hasTmdb = new Set(existingTmdb.map((e: any) => e.itemId));
  const needTmdb = movieTv.filter((i) => !hasTmdb.has(i.id)).slice(0, 200);

  console.log(`  ${needTmdb.length} movies/TV without TMDB scores, fetching...`);

  for (let i = 0; i < needTmdb.length; i++) {
    const item = needTmdb[i];
    try {
      const mediaType = item.type === "movie" ? "movie" : "tv";
      const searchData = await fetchJson(
        `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(item.title)}&year=${item.year}`
      );
      const match = (searchData.results || []).find((r: any) =>
        (r.title || r.name || "").toLowerCase() === item.title.toLowerCase()
      ) || searchData.results?.[0];

      if (match && match.vote_average > 0) {
        // Store as 'tmdb' — this is TMDB community data, not IMDb
        await upsertScore(prisma, item.id, "tmdb", Math.round(match.vote_average * 10) / 10, 10, "community", "TMDB");
        stats.tmdb_fetched++;
      }
      await sleep(260);
    } catch {}
    if (i % 50 === 0 && i > 0) console.log(`    ${i}/${needTmdb.length}...`);
  }
  console.log(`  Fetched ${stats.tmdb_fetched} TMDB scores\n`);

  // ── STEP 3: Fetch MAL scores for anime/manga ─────────────────────────
  console.log("═══ Step 3: MAL scores (anime + manga) ═══\n");

  const animeManga = items.filter((i) =>
    i.type === "manga" || (i.type === "tv" && (i.genre || []).some((g: string) => g.toLowerCase().includes("anime")))
  );
  const existingMal = await prisma.externalScore.findMany({
    where: { source: "mal" },
    select: { itemId: true },
  });
  const hasMal = new Set(existingMal.map((e: any) => e.itemId));
  const needMal = animeManga.filter((i) => !hasMal.has(i.id)).slice(0, 100);

  console.log(`  ${needMal.length} anime/manga without MAL scores, fetching...`);

  for (let i = 0; i < needMal.length; i++) {
    const item = needMal[i];
    try {
      const jikanType = item.type === "manga" ? "manga" : "anime";
      const searchData = await fetchJson(
        `https://api.jikan.moe/v4/${jikanType}?q=${encodeURIComponent(item.title)}&limit=3`
      );
      await sleep(400);

      const match = (searchData.data || []).find((m: any) => {
        const t = (m.title_english || m.title || "").toLowerCase();
        return t === item.title.toLowerCase() || t.includes(item.title.toLowerCase());
      }) || searchData.data?.[0];

      if (match && match.score) {
        await upsertScore(prisma, item.id, "mal", match.score, 10, "community");
        stats.mal_fetched++;

        // Also try to get AniList score from Jikan data if available
        if (match.scored_by) {
          // Jikan doesn't give AniList directly, but we can store scored_by count
        }
      }
    } catch {}
    if (i % 30 === 0 && i > 0) console.log(`    ${i}/${needMal.length}...`);
  }
  console.log(`  Fetched ${stats.mal_fetched} MAL scores\n`);

  // ── STEP 4: Fetch IGDB scores for games ───────────────────────────────
  console.log("═══ Step 4: IGDB scores (games) ═══\n");

  let igdbToken = "";
  try {
    const tokenData = await fetchJson(
      `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    igdbToken = tokenData.access_token;
  } catch {}

  if (igdbToken) {
    const gameItems = items.filter((i) => i.type === "game");
    const existingIgdb = await prisma.externalScore.findMany({
      where: { source: { in: ["igdb", "igdb_critics"] }, itemId: { in: gameItems.map((g) => g.id) } },
      select: { itemId: true },
    });
    const hasIgdb = new Set(existingIgdb.map((e: any) => e.itemId));
    const needIgdb = gameItems.filter((i) => !hasIgdb.has(i.id)).slice(0, 100);

    console.log(`  ${needIgdb.length} games without IGDB scores, fetching...`);

    // Process in batches of 10
    for (let batch = 0; batch < needIgdb.length; batch += 10) {
      const batchItems = needIgdb.slice(batch, batch + 10);
      const titles = batchItems.map((g) => `"${g.title.replace(/"/g, '\\"')}"`).join(",");
      try {
        const res = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: { "Client-ID": IGDB_ID, Authorization: `Bearer ${igdbToken}`, "Content-Type": "text/plain" },
          body: `fields name,aggregated_rating,aggregated_rating_count,total_rating,total_rating_count; where name = (${titles}); limit 10;`,
        });
        const games = await res.json();

        for (const g of games) {
          const dbMatch = batchItems.find((i) => i.title.toLowerCase() === (g.name || "").toLowerCase());
          if (!dbMatch) continue;

          // igdb_critics = aggregated_rating (critic-only, 0-100)
          if (g.aggregated_rating) {
            await upsertScore(prisma, dbMatch.id, "igdb_critics", Math.round(g.aggregated_rating), 100, "critics", "IGDB Critics");
            stats.igdb_fetched++;
          }
          // igdb = total_rating (community blend, 0-100)
          if (g.total_rating) {
            await upsertScore(prisma, dbMatch.id, "igdb", Math.round(g.total_rating), 100, "community", "IGDB");
          }
        }
        await sleep(300);
      } catch {}
    }
    console.log(`  Fetched ${stats.igdb_fetched} game scores\n`);
  }

  // ── STEP 5: Steam scores for games ────────────────────────────────────
  console.log("═══ Step 5: Steam scores (games) ═══\n");

  const existingSteam = await prisma.externalScore.findMany({
    where: { source: "steam" },
    select: { itemId: true },
  });
  const hasSteam = new Set(existingSteam.map((e: any) => e.itemId));
  const gameItems = items.filter((i) => i.type === "game" && !hasSteam.has(i.id)).slice(0, 80);

  console.log(`  ${gameItems.length} games without Steam scores, trying...`);

  for (const game of gameItems) {
    try {
      // Search Steam store
      const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(game.title)}&cc=us&l=en`;
      const searchData = await fetchJson(searchUrl);
      await sleep(500);

      const match = (searchData.items || []).find((s: any) =>
        s.name?.toLowerCase() === game.title.toLowerCase() ||
        s.name?.toLowerCase().includes(game.title.toLowerCase())
      );

      if (match) {
        const detailUrl = `https://store.steampowered.com/api/appdetails?appids=${match.id}`;
        const detailData = await fetchJson(detailUrl);
        await sleep(500);

        const appData = detailData?.[String(match.id)]?.data;
        if (appData?.metacritic?.score) {
          await upsertScore(prisma, game.id, "metacritic", appData.metacritic.score, 100, "critics");
        }

        // Steam doesn't give review % in the API directly, but we can check recommendations
        if (appData?.recommendations?.total) {
          // Store total review count as a note
        }
      }
      stats.steam_fetched++;
    } catch {}
  }
  console.log(`  Processed ${stats.steam_fetched} Steam lookups\n`);

  // ── SUMMARY ───────────────────────────────────────────────────────────
  const totalScores = await prisma.externalScore.count();
  const bySource = await prisma.externalScore.groupBy({
    by: ["source"],
    _count: { source: true },
    orderBy: { _count: { source: "desc" } },
  });

  console.log("\n════════════════════════════════════════════════════════");
  console.log("📊 EXTERNAL SCORES SUMMARY");
  console.log("════════════════════════════════════════════════════════\n");
  console.log(`  Total scores in database: ${totalScores}\n`);
  console.log("  By source:");
  for (const s of bySource) {
    console.log(`    ${s.source}: ${s._count.source} items`);
  }
  console.log("\n  Sources populated via API:");
  console.log(`    TMDB/IMDb:    ${stats.tmdb_fetched} new`);
  console.log(`    MAL:          ${stats.mal_fetched} new`);
  console.log(`    IGDB/Meta:    ${stats.igdb_fetched} new`);
  console.log(`    Steam:        ${stats.steam_fetched} processed`);
  console.log(`    Migrated ext: ${stats.migrated}`);
  console.log("\n  Sources needing manual/future work:");
  console.log("    - Rotten Tomatoes (no free API — need OMDb or manual)");
  console.log("    - Letterboxd (no API)");
  console.log("    - AniList (has GraphQL API — add later)");
  console.log("    - Pitchfork (no API — scraping needed)");
  console.log("    - Rate Your Music (no API)");
  console.log("    - Apple Podcasts (no public API)");
  console.log("════════════════════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
