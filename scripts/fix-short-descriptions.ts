/**
 * Fix items with short or empty descriptions by re-fetching from source APIs.
 *
 * Queries items where description < 100 chars, then fetches a better
 * description from the appropriate API based on external IDs.
 *
 * Run with: npx tsx scripts/fix-short-descriptions.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
// tsx resolves relative .ts imports fine, just not tsconfig path aliases like @/
import { cleanDescription } from "../src/lib/clean-description";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;
const GOOGLE_BOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY!;
const COMICVINE_KEY = process.env.COMICVINE_API_KEY!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Get an IGDB access token
async function getIgdbToken(): Promise<string> {
  const data = await fetchJson(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  return data.access_token;
}

// ── API fetchers ──────────────────────────────────────────────────────

async function fetchJikanDescription(malId: number, type: string): Promise<string | null> {
  // Jikan uses "anime" for TV/movie anime and "manga" for manga
  const endpoint = type === "manga" ? "manga" : "anime";
  try {
    const data = await fetchJson(`https://api.jikan.moe/v4/${endpoint}/${malId}`);
    return data?.data?.synopsis || null;
  } catch (e: any) {
    console.log(`    ⚠ Jikan error for ${endpoint}/${malId}: ${e.message}`);
    return null;
  }
}

async function fetchTmdbDescription(tmdbId: number, type: string): Promise<string | null> {
  const mediaType = type === "movie" ? "movie" : "tv";
  try {
    const data = await fetchJson(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}`
    );
    return data?.overview || null;
  } catch (e: any) {
    console.log(`    ⚠ TMDB error for ${mediaType}/${tmdbId}: ${e.message}`);
    return null;
  }
}

async function fetchIgdbDescription(igdbId: number, token: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": IGDB_ID,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: `fields summary,storyline; where id = ${igdbId}; limit 1;`,
    });
    const games = await res.json();
    // Prefer storyline if it's longer, otherwise summary
    const game = games?.[0];
    if (!game) return null;
    const summary = game.summary || "";
    const storyline = game.storyline || "";
    return storyline.length > summary.length ? storyline : summary || null;
  } catch (e: any) {
    console.log(`    ⚠ IGDB error for id ${igdbId}: ${e.message}`);
    return null;
  }
}

async function fetchGoogleBooksDescription(googleBooksId: string): Promise<string | null> {
  try {
    const data = await fetchJson(
      `https://www.googleapis.com/books/v1/volumes/${googleBooksId}?key=${GOOGLE_BOOKS_KEY}`
    );
    return data?.volumeInfo?.description || null;
  } catch (e: any) {
    console.log(`    ⚠ Google Books error for ${googleBooksId}: ${e.message}`);
    return null;
  }
}

async function fetchComicVineDescription(comicVineId: number): Promise<string | null> {
  try {
    const data = await fetchJson(
      `https://comicvine.gamespot.com/api/volume/4050-${comicVineId}/?api_key=${COMICVINE_KEY}&format=json&field_list=description`
    );
    // Comic Vine returns HTML — strip tags
    const raw = data?.results?.description || null;
    if (!raw) return null;
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } catch (e: any) {
    console.log(`    ⚠ Comic Vine error for ${comicVineId}: ${e.message}`);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log("🔧 Fix Short Descriptions\n");

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Prisma doesn't support string-length filters natively,
  // so we fetch all items and filter in JS
  const items = await prisma.item.findMany({
    select: {
      id: true,
      title: true,
      type: true,
      description: true,
      malId: true,
      tmdbId: true,
      igdbId: true,
      googleBooksId: true,
      spotifyId: true,
      comicVineId: true,
    },
  });

  // Filter to items with description under 100 chars
  const shortItems = items.filter((i) => (i.description || "").length < 100);
  console.log(`Found ${shortItems.length} items with descriptions under 100 characters\n`);

  if (shortItems.length === 0) {
    console.log("Nothing to fix!");
    await prisma.$disconnect();
    return;
  }

  // Get IGDB token if we have any games
  let igdbToken = "";
  const hasIgdbItems = shortItems.some((i) => i.igdbId);
  if (hasIgdbItems) {
    try {
      igdbToken = await getIgdbToken();
      console.log("✓ IGDB token acquired\n");
    } catch (e: any) {
      console.log(`⚠ Could not get IGDB token: ${e.message}\n`);
    }
  }

  const stats = { checked: 0, updated: 0, skipped: 0, noApi: 0, failed: 0 };

  for (const item of shortItems) {
    stats.checked++;
    const oldLen = (item.description || "").length;
    let newDescription: string | null = null;
    let source = "";

    try {
      // Try APIs in priority order based on which external ID exists
      if (item.malId) {
        source = "Jikan";
        newDescription = await fetchJikanDescription(item.malId, item.type);
        // Jikan rate limit: 1 second between calls
        await sleep(1000);
      } else if (item.tmdbId) {
        source = "TMDB";
        newDescription = await fetchTmdbDescription(item.tmdbId, item.type);
        await sleep(260);
      } else if (item.igdbId && igdbToken) {
        source = "IGDB";
        newDescription = await fetchIgdbDescription(item.igdbId, igdbToken);
        await sleep(260);
      } else if (item.googleBooksId) {
        source = "Google Books";
        newDescription = await fetchGoogleBooksDescription(item.googleBooksId);
        await sleep(260);
      } else if (item.spotifyId) {
        // Skip — Spotify descriptions are often short
        source = "Spotify (skipped)";
        stats.skipped++;
        console.log(`  [${stats.checked}/${shortItems.length}] "${item.title}" — skipped (Spotify, descriptions often short)`);
        continue;
      } else if (item.comicVineId) {
        source = "Comic Vine";
        newDescription = await fetchComicVineDescription(item.comicVineId);
        await sleep(260);
      } else {
        stats.noApi++;
        console.log(`  [${stats.checked}/${shortItems.length}] "${item.title}" — no external ID to fetch from`);
        continue;
      }

      if (newDescription) {
        // Clean the description
        const cleaned = cleanDescription(newDescription, item.type);
        const newLen = cleaned.length;

        if (newLen > oldLen) {
          await prisma.item.update({
            where: { id: item.id },
            data: { description: cleaned },
          });
          stats.updated++;
          console.log(`  [${stats.checked}/${shortItems.length}] ✓ "${item.title}" — ${source}: ${oldLen} → ${newLen} chars`);
        } else {
          stats.skipped++;
          console.log(`  [${stats.checked}/${shortItems.length}] – "${item.title}" — ${source}: new (${newLen}) not longer than old (${oldLen})`);
        }
      } else {
        stats.failed++;
        console.log(`  [${stats.checked}/${shortItems.length}] ✗ "${item.title}" — ${source}: no description returned`);
      }
    } catch (e: any) {
      stats.failed++;
      console.log(`  [${stats.checked}/${shortItems.length}] ✗ "${item.title}" — ${source} error: ${e.message}`);
    }
  }

  console.log("\n═══ Summary ═══");
  console.log(`  Checked:    ${stats.checked}`);
  console.log(`  Updated:    ${stats.updated}`);
  console.log(`  Skipped:    ${stats.skipped}`);
  console.log(`  No API ID:  ${stats.noApi}`);
  console.log(`  Failed:     ${stats.failed}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
