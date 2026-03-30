/**
 * Fetch popularity/vote count data for all items from their respective APIs.
 * Stores popularity_score and vote_count on each item.
 *
 * Run: npx tsx scripts/fetch-popularity.ts
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

async function main() {
  console.log("📊 Fetching Popularity Data\n");

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const items = await prisma.item.findMany({
    where: { isUpcoming: false },
    select: { id: true, title: true, type: true, year: true, popularityScore: true, voteCount: true },
  });
  console.log(`${items.length} items to process\n`);

  const stats = { tmdb: 0, igdb: 0, jikan: 0, books: 0, music: 0 };

  // ── TMDB: Movies + TV ─────────────────────────────────────────────────
  console.log("📽  TMDB popularity (movies + TV)...");
  const movieTv = items.filter(i => ["movie", "tv"].includes(i.type) && i.voteCount === 0);

  for (let i = 0; i < movieTv.length; i++) {
    const item = movieTv[i];
    try {
      const mediaType = item.type === "movie" ? "movie" : "tv";
      const data = await fetchJson(
        `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(item.title)}&year=${item.year}`
      );
      const match = (data.results || []).find((r: any) =>
        (r.title || r.name || "").toLowerCase() === item.title.toLowerCase()
      ) || data.results?.[0];

      if (match) {
        await prisma.item.update({
          where: { id: item.id },
          data: {
            popularityScore: match.popularity || 0,
            voteCount: match.vote_count || 0,
          },
        });
        stats.tmdb++;
      }
      await sleep(260);
    } catch {}
    if (i % 100 === 0 && i > 0) console.log(`  ${i}/${movieTv.length}...`);
  }
  console.log(`  Updated ${stats.tmdb} movies/TV\n`);

  // ── IGDB: Games ────────────────────────────────────────────────────────
  console.log("🎮 IGDB popularity (games)...");
  let igdbToken = "";
  try {
    const t = await fetchJson(
      `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    igdbToken = t.access_token;
  } catch {}

  if (igdbToken) {
    const gameItems = items.filter(i => i.type === "game" && i.voteCount === 0);

    for (let batch = 0; batch < gameItems.length; batch += 10) {
      const batchItems = gameItems.slice(batch, batch + 10);
      const titles = batchItems.map(g => `"${g.title.replace(/"/g, '\\"')}"`).join(",");
      try {
        const res = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: { "Client-ID": IGDB_ID, Authorization: `Bearer ${igdbToken}`, "Content-Type": "text/plain" },
          body: `fields name,total_rating_count,hypes,follows; where name = (${titles}); limit 10;`,
        });
        const games = await res.json();
        await sleep(300);

        for (const g of (Array.isArray(games) ? games : [])) {
          const dbMatch = batchItems.find(i => i.title.toLowerCase() === (g.name || "").toLowerCase());
          if (dbMatch) {
            await prisma.item.update({
              where: { id: dbMatch.id },
              data: {
                popularityScore: (g.hypes || 0) + (g.follows || 0),
                voteCount: g.total_rating_count || 0,
              },
            });
            stats.igdb++;
          }
        }
      } catch {}
    }
  }
  console.log(`  Updated ${stats.igdb} games\n`);

  // ── Jikan: Anime + Manga ──────────────────────────────────────────────
  console.log("🗾 Jikan popularity (anime + manga)...");
  const animeManga = items.filter(i =>
    (i.type === "manga" || i.type === "tv") && i.voteCount === 0
  ).slice(0, 300);

  for (let i = 0; i < animeManga.length; i++) {
    const item = animeManga[i];
    try {
      const jikanType = item.type === "manga" ? "manga" : "anime";
      const data = await fetchJson(
        `https://api.jikan.moe/v4/${jikanType}?q=${encodeURIComponent(item.title)}&limit=3`
      );
      await sleep(400);

      const match = (data.data || []).find((m: any) => {
        const t = (m.title_english || m.title || "").toLowerCase();
        return t === item.title.toLowerCase() || t.includes(item.title.toLowerCase());
      }) || data.data?.[0];

      if (match) {
        await prisma.item.update({
          where: { id: item.id },
          data: {
            popularityScore: match.members || match.favorites || 0,
            voteCount: match.scored_by || 0,
          },
        });
        stats.jikan++;
      }
    } catch {}
    if (i % 50 === 0 && i > 0) console.log(`  ${i}/${animeManga.length}...`);
  }
  console.log(`  Updated ${stats.jikan} anime/manga\n`);

  // ── Set reasonable defaults for items without API data ─────────────────
  // Use ext scores as a proxy — if an item has high ext scores, it's probably notable
  // Exclude podcast/comic: their voteCount was cleaned up to reflect real Literacy ratings
  // and we don't want to re-inflate them with estimated values.
  const noData = await prisma.item.findMany({
    where: { voteCount: 0, isUpcoming: false, type: { notIn: ["podcast", "comic"] } },
    select: { id: true, type: true, ext: true },
  });

  let defaultSet = 0;
  for (const item of noData) {
    const ext = item.ext as Record<string, number>;
    const hasScore = Object.values(ext).some(v => v > 0);
    // Items with external scores are at least somewhat notable
    if (hasScore) {
      const bestScore = Math.max(...Object.values(ext));
      // Rough estimate: higher scores → more popular
      const estimatedVotes = bestScore > 8 ? 200 : bestScore > 7 ? 50 : 10;
      await prisma.item.update({
        where: { id: item.id },
        data: { voteCount: estimatedVotes, popularityScore: estimatedVotes },
      });
      defaultSet++;
    }
  }
  console.log(`Set defaults for ${defaultSet} items based on score proxies\n`);

  // ── Summary ───────────────────────────────────────────────────────────
  const total = await prisma.item.count({ where: { isUpcoming: false } });
  const withPop = await prisma.item.count({ where: { isUpcoming: false, voteCount: { gt: 0 } } });
  const highPop = await prisma.item.count({ where: { isUpcoming: false, voteCount: { gte: 500 } } });
  const medPop = await prisma.item.count({ where: { isUpcoming: false, voteCount: { gte: 50, lt: 500 } } });
  const lowPop = await prisma.item.count({ where: { isUpcoming: false, voteCount: { gt: 0, lt: 50 } } });
  const noPop = await prisma.item.count({ where: { isUpcoming: false, voteCount: 0 } });

  console.log("════════════════════════════════════════════════════════");
  console.log("📊 POPULARITY DATA SUMMARY");
  console.log("════════════════════════════════════════════════════════\n");
  console.log(`  Total items:        ${total}`);
  console.log(`  With popularity:    ${withPop}`);
  console.log(`  High (500+ votes):  ${highPop} — eligible for Critically Acclaimed`);
  console.log(`  Medium (50-499):    ${medPop} — eligible for type rows`);
  console.log(`  Low (1-49):         ${lowPop} — Explore only`);
  console.log(`  No data:            ${noPop} — Explore only`);
  console.log("════════════════════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch(e => { console.error("Failed:", e); process.exit(1); });
