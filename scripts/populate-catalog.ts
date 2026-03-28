/**
 * populate-catalog.ts — Bulk catalog population from all connected APIs.
 *
 * Usage:
 *   npx tsx scripts/populate-catalog.ts                         # all types
 *   npx tsx scripts/populate-catalog.ts --type=movies           # one type
 *   npx tsx scripts/populate-catalog.ts --type=movies --limit=100
 *   npx tsx scripts/populate-catalog.ts --type=music --spotify-delay=1000
 *
 * Types: movies, tv, games, books, anime, manga, comics, music, podcasts
 * Safe to re-run — deduplicates by external ID first, then title+type.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const TYPE_ARG = argv.find((a) => a.startsWith("--type="))?.split("=")[1];
const LIMIT = parseInt(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0") || 0;
const SPOTIFY_DELAY = parseInt(argv.find((a) => a.startsWith("--spotify-delay="))?.split("=")[1] ?? "500") || 500;
const SCRIPT_START = Date.now();

// ── API config ───────────────────────────────────────────────────────────────
const TMDB_KEY = process.env.TMDB_API_KEY!;
const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;
const GBOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY!;
const SPOTIFY_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const CV_KEY = process.env.COMICVINE_API_KEY!;
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const JIKAN_BASE = "https://api.jikan.moe/v4";
const OL_BASE = "https://openlibrary.org";

// ── Types ────────────────────────────────────────────────────────────────────
interface Person { role: string; name: string }
interface ExtScore { source: string; score: number; maxScore: number; scoreType?: string }
interface CatalogItem {
  title: string;
  type: string;
  genre: string[];
  vibes: string[];
  year: number;
  cover: string;
  description: string;
  people: Person[];
  platforms: string[];
  totalEp: number;
  voteCount: number;
  ext: Record<string, number>;
  scores: ExtScore[];
  // External IDs
  tmdbId?: number;
  igdbId?: number;
  malId?: number;
  spotifyId?: string;
  googleBooksId?: string;
  comicVineId?: number;
  steamAppId?: number;
  itemSubtype?: string;
}

// ── Summary counters ─────────────────────────────────────────────────────────
const summary: Record<string, { inserted: number; skipped: number; failed: number }> = {};
function initSection(name: string) { summary[name] = { inserted: 0, skipped: 0, failed: 0 }; }
function logSection(name: string) {
  const s = summary[name];
  if (s) console.log(`  → ${name}: ${s.inserted} inserted, ${s.skipped} skipped, ${s.failed} failed`);
}

// ── Existing ID sets (loaded once at startup) ─────────────────────────────────
const existing = {
  tmdbIds: new Set<number>(),
  igdbIds: new Set<number>(),
  malIds: new Set<number>(),
  spotifyIds: new Set<string>(),
  googleBooksIds: new Set<string>(),
  comicVineIds: new Set<number>(),
  titleType: new Set<string>(),
  // Maps base anime title (season-stripped, normalized) → item id for season parent linking
  animeBaseIds: new Map<string, number>(),
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "5") || 5;
    throw Object.assign(new Error(`429 rate limit`), { retryAfter, is429: true });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(0, 80)}`);
  return res.json();
}

async function fetchWithRetry(url: string, opts?: RequestInit, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchJson(url, opts);
    } catch (e: any) {
      if (e.is429) {
        const wait = (e.retryAfter || 10) * 1000;
        if (wait > 60_000) throw e;
        console.warn(`  Rate limited, waiting ${e.retryAfter}s...`);
        await sleep(wait);
      } else if (i < retries - 1) {
        await sleep(1000 * (i + 1));
      } else {
        throw e;
      }
    }
  }
}

function cap(n: number): number {
  return LIMIT > 0 ? Math.min(n, LIMIT) : n;
}

function deriveVibes(genres: string[], score?: number): string[] {
  const vibes: string[] = [];
  const gl = genres.map((g) => g.toLowerCase());
  if (gl.some((g) => g.includes("horror") || g.includes("thriller"))) vibes.push("dark", "intense");
  if (gl.some((g) => g.includes("drama"))) vibes.push("emotional");
  if (gl.some((g) => g.includes("sci-fi") || g.includes("science fiction"))) vibes.push("mind-bending", "thought-provoking");
  if (gl.some((g) => g.includes("fantasy") || g.includes("adventure"))) vibes.push("epic", "immersive");
  if (gl.some((g) => g.includes("action"))) vibes.push("intense");
  if (gl.some((g) => g.includes("comedy"))) vibes.push("funny");
  if (gl.some((g) => g.includes("romance"))) vibes.push("heartfelt");
  if (gl.some((g) => g.includes("mystery") || g.includes("crime"))) vibes.push("atmospheric", "gritty");
  if (gl.some((g) => g.includes("documentary"))) vibes.push("thought-provoking");
  if (gl.some((g) => g.includes("war"))) vibes.push("gritty", "intense");
  if (gl.some((g) => g.includes("animation") || g.includes("anime"))) vibes.push("stylish");
  if (score && score > 8) vibes.push("immersive");
  return [...new Set(vibes)].slice(0, 4);
}

function normalizeTitle(t: string): string {
  return t.toLowerCase()
    .replace(/:\s*.+$/, "")
    .replace(/\b(a novel|book one|book two|book \w+|volume \d+|vol\.\s*\d+|\(\d+\))\b/gi, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Strip diacritics + season suffixes for anime base-title matching */
function animeBaseKey(title: string): string {
  return title
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip diacritics
    .toLowerCase()
    .replace(/[:\s]+(season\s*\d+(\s*part\s*\d+)?(\s*cour\s*\d+)?)$/i, "")
    .replace(/[:\s]+part\s*\d+$/i, "")
    .replace(/[:\s]+cour\s*\d+$/i, "")
    .replace(/[:\s]+(final\s+season|final\s+chapters?|the\s+final\s+chapters?).*$/i, "")
    .replace(/[:\s]+\d+(st|nd|rd|th)\s+season.*$/i, "")
    .replace(/[:\s]+(oad|ova|special|movie)s?$/i, "")
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Detect a season/sequel/spin-off suffix that marks this as a non-primary entry */
function hasAnimeSuffix(title: string): boolean {
  return /(\s+|:)(season\s*\d+|part\s*\d+|cour\s*\d+|\d+(st|nd|rd|th)\s+season|final\s+season|the\s+final|oad|ova\b|movie\b|specials?\b)/i.test(title)
    || /\s+(arc|ova|specials?|movies?)\s*$/i.test(title);
}

// ── DB insertion ─────────────────────────────────────────────────────────────
async function insertItem(prisma: PrismaClient, item: CatalogItem, sectionName: string): Promise<void> {
  // Fast dedup by external ID
  if (item.tmdbId && existing.tmdbIds.has(item.tmdbId)) { summary[sectionName].skipped++; return; }
  if (item.igdbId && existing.igdbIds.has(item.igdbId)) { summary[sectionName].skipped++; return; }
  if (item.malId && existing.malIds.has(item.malId)) { summary[sectionName].skipped++; return; }
  if (item.spotifyId && existing.spotifyIds.has(item.spotifyId)) { summary[sectionName].skipped++; return; }
  if (item.googleBooksId && existing.googleBooksIds.has(item.googleBooksId)) { summary[sectionName].skipped++; return; }
  if (item.comicVineId && existing.comicVineIds.has(item.comicVineId)) { summary[sectionName].skipped++; return; }

  // Fallback dedup by normalized title+type
  const key = `${normalizeTitle(item.title)}|||${item.type}`;
  if (existing.titleType.has(key)) { summary[sectionName].skipped++; return; }

  try {
    const created = await (prisma as any).item.create({
      data: {
        title: item.title,
        type: item.type,
        genre: item.genre,
        vibes: item.vibes,
        year: item.year,
        cover: item.cover,
        description: item.description,
        people: item.people as any,
        awards: [] as any,
        platforms: item.platforms as any,
        ext: item.ext as any,
        totalEp: item.totalEp,
        voteCount: item.voteCount,
        isUpcoming: false,
        ...(item.tmdbId ? { tmdbId: item.tmdbId } : {}),
        ...(item.igdbId ? { igdbId: item.igdbId } : {}),
        ...(item.malId ? { malId: item.malId } : {}),
        ...(item.spotifyId ? { spotifyId: item.spotifyId } : {}),
        ...(item.googleBooksId ? { googleBooksId: item.googleBooksId } : {}),
        ...(item.comicVineId ? { comicVineId: item.comicVineId } : {}),
        ...(item.steamAppId ? { steamAppId: item.steamAppId } : {}),
        ...(item.itemSubtype ? { itemSubtype: item.itemSubtype } : {}),
      },
      select: { id: true },
    });

    // Insert ExternalScores
    for (const s of item.scores) {
      await (prisma as any).externalScore.upsert({
        where: { itemId_source: { itemId: created.id, source: s.source } },
        update: { score: s.score, maxScore: s.maxScore, updatedAt: new Date() },
        create: {
          itemId: created.id,
          source: s.source,
          score: s.score,
          maxScore: s.maxScore,
          scoreType: s.scoreType ?? "community",
          label: "",
        },
      });
    }

    // Update in-memory sets
    if (item.tmdbId) existing.tmdbIds.add(item.tmdbId);
    if (item.igdbId) existing.igdbIds.add(item.igdbId);
    if (item.malId) existing.malIds.add(item.malId);
    if (item.spotifyId) existing.spotifyIds.add(item.spotifyId);
    if (item.googleBooksId) existing.googleBooksIds.add(item.googleBooksId);
    if (item.comicVineId) existing.comicVineIds.add(item.comicVineId);
    existing.titleType.add(key);

    // Auto-link anime seasons: if this is a season/OVA/movie entry and the base
    // show already exists, set parent_item_id so it's hidden from browse rows.
    if ((item.type === "tv" || item.type === "manga") && hasAnimeSuffix(item.title)) {
      const base = animeBaseKey(item.title);
      const parentId = existing.animeBaseIds.get(base);
      if (parentId && parentId !== created.id) {
        await (prisma as any).item.update({
          where: { id: created.id },
          data: { parentItemId: parentId },
        });
      }
    } else if ((item.type === "tv" || item.type === "manga") && !hasAnimeSuffix(item.title)) {
      // Register this as a potential parent for future seasons in this run
      const base = animeBaseKey(item.title);
      if (!existing.animeBaseIds.has(base)) existing.animeBaseIds.set(base, created.id);
    }

    summary[sectionName].inserted++;
  } catch (e: any) {
    if (e.code === "P2002") {
      summary[sectionName].skipped++;
    } else {
      summary[sectionName].failed++;
    }
  }
}

// ── TMDB ─────────────────────────────────────────────────────────────────────
const TMDB_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics", 10769: "Western",
};

function tmdbResToItem(r: any, type: "movie" | "tv"): CatalogItem | null {
  if (!r.poster_path) return null;
  const title = r.title || r.name || "";
  const year = parseInt((r.release_date || r.first_air_date || "0").slice(0, 4)) || 0;
  if (!title || year === 0) return null;
  const genres = (r.genre_ids || []).map((id: number) => TMDB_GENRES[id]).filter(Boolean);
  const tmdbScore = r.vote_average ? Math.round(r.vote_average * 10) / 10 : 0;
  const scores: ExtScore[] = tmdbScore > 0 ? [{ source: "tmdb", score: tmdbScore, maxScore: 10 }] : [];

  return {
    title,
    type,
    genre: [...new Set(genres)] as string[],
    vibes: deriveVibes(genres, r.vote_average),
    year,
    cover: `${TMDB_IMG}${r.poster_path}`,
    description: (r.overview || "").slice(0, 800),
    people: [],
    platforms: type === "movie" ? [] : [],
    totalEp: type === "movie" ? 1 : 0,
    voteCount: r.vote_count || 0,
    ext: tmdbScore > 0 ? { tmdb: tmdbScore } : {},
    scores,
    tmdbId: r.id,
  };
}

async function fetchTmdbPages(path: string, pages: number, type: "movie" | "tv"): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  const maxPages = LIMIT > 0 ? Math.ceil(LIMIT / 20) : pages;
  for (let page = 1; page <= maxPages; page++) {
    try {
      const sep = path.includes("?") ? "&" : "?";
      const data = await fetchWithRetry(
        `https://api.themoviedb.org/3${path}${sep}api_key=${TMDB_KEY}&page=${page}&language=en-US`
      );
      for (const r of data.results || []) {
        const item = tmdbResToItem(r, type);
        if (item) items.push(item);
      }
      await sleep(260);
    } catch (e: any) {
      console.warn(`  TMDB ${path} p${page}: ${e.message}`);
    }
    if (LIMIT > 0 && items.length >= LIMIT) break;
  }
  return items;
}

async function populateTmdbMovies(prisma: PrismaClient): Promise<void> {
  const section = "movies";
  initSection(section);
  console.log("\n🎬 TMDB Movies...");
  const all: CatalogItem[] = [];

  const sources: [string, number][] = [
    ["/discover/movie?sort_by=popularity.desc", 250],
    ["/movie/top_rated", 100],
    ["/trending/movie/week", 10],
    ["/movie/now_playing", 10],
    ["/movie/upcoming", 10],
  ];
  // Genre-specific (documentary=99, animation=16, horror=27, romance=10749, war=10752, western=37, music=10402, history=36)
  const genreIds = [99, 16, 27, 10749, 10752, 37, 10402, 36];
  for (const gid of genreIds) {
    sources.push([`/discover/movie?sort_by=popularity.desc&with_genres=${gid}`, 10]);
  }

  for (const [path, pages] of sources) {
    const items = await fetchTmdbPages(path, pages, "movie");
    all.push(...items);
    console.log(`  ${path.slice(0, 50)}: ${items.length} fetched`);
  }

  console.log(`  Total fetched: ${all.length} movies — inserting...`);
  let n = 0;
  for (const item of all) {
    await insertItem(prisma, item, section);
    n++;
    if (n % 200 === 0) {
      const s = summary[section];
      process.stdout.write(`\r  Progress: ${n}/${all.length} | +${s.inserted} new, ${s.skipped} skip   `);
    }
  }
  console.log();
  logSection(section);
}

async function populateTmdbTv(prisma: PrismaClient): Promise<void> {
  const section = "tv";
  initSection(section);
  console.log("\n📺 TMDB TV Shows...");
  const all: CatalogItem[] = [];

  const sources: [string, number][] = [
    ["/discover/tv?sort_by=popularity.desc", 150],
    ["/tv/top_rated", 50],
    ["/trending/tv/week", 10],
  ];
  // Genre-specific: animation(16), documentary(99), crime(80), reality(10764), talk(10767)
  const genreIds = [16, 99, 80, 10764, 10767, 10766];
  for (const gid of genreIds) {
    sources.push([`/discover/tv?sort_by=popularity.desc&with_genres=${gid}`, 10]);
  }

  for (const [path, pages] of sources) {
    const items = await fetchTmdbPages(path, pages, "tv");
    all.push(...items);
    console.log(`  ${path.slice(0, 50)}: ${items.length} fetched`);
  }

  console.log(`  Total fetched: ${all.length} shows — inserting...`);
  let n = 0;
  for (const item of all) {
    await insertItem(prisma, item, section);
    n++;
    if (n % 200 === 0) {
      const s = summary[section];
      process.stdout.write(`\r  Progress: ${n}/${all.length} | +${s.inserted} new, ${s.skipped} skip   `);
    }
  }
  console.log();
  logSection(section);
}

// ── IGDB ─────────────────────────────────────────────────────────────────────
let igdbToken = "";
async function getIgdbToken(): Promise<string> {
  if (igdbToken) return igdbToken;
  const data = await fetchJson(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  igdbToken = data.access_token;
  return igdbToken;
}

async function igdbQuery(endpoint: string, body: string): Promise<any[]> {
  const token = await getIgdbToken();
  try {
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: { "Client-ID": IGDB_ID, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
      body,
    });
    if (res.status === 429) {
      await sleep(4000);
      return igdbQuery(endpoint, body);
    }
    if (!res.ok) throw new Error(`IGDB ${res.status}: ${await res.text()}`);
    return res.json();
  } catch (e: any) {
    console.warn(`  IGDB query failed: ${e.message}`);
    return [];
  }
}

const IGDB_GENRES_MAP: Record<number, string> = {
  2: "RPG", 4: "Fighting", 5: "Shooter", 7: "Music", 8: "Platform",
  9: "Puzzle", 10: "Racing", 11: "Strategy", 12: "Simulation",
  13: "Sports", 14: "Survival", 15: "Turn-Based", 24: "Tactical",
  25: "Hack & Slash", 26: "Adventure", 30: "Card Game", 31: "Indie",
  32: "MOBA", 33: "Arcade", 34: "Visual Novel", 35: "Open World",
};

function igdbToItem(g: any): CatalogItem | null {
  if (!g.name || !g.cover?.image_id) return null;
  const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : 0;
  if (year === 0) return null;

  const genres = (g.genres || [])
    .map((gn: any) => (typeof gn === "object" ? gn.name : IGDB_GENRES_MAP[gn]) || "")
    .filter(Boolean).slice(0, 5) as string[];

  const platforms: string[] = [];
  for (const p of g.platforms || []) {
    const pid = typeof p === "number" ? p : p.id;
    if ([48, 167].includes(pid)) platforms.push("ps");
    if ([49, 169].includes(pid)) platforms.push("xbox");
    if (pid === 130) platforms.push("switch");
    if ([6, 3, 14].includes(pid)) platforms.push("steam");
  }

  // Extract Steam App ID from external_games
  let steamAppId: number | undefined;
  for (const eg of g.external_games || []) {
    if (eg.category === 1 && eg.uid) {
      const parsed = parseInt(eg.uid);
      if (!isNaN(parsed)) { steamAppId = parsed; break; }
    }
  }

  const igdbScore = g.total_rating ? Math.round(g.total_rating) : 0;
  const criticsScore = g.aggregated_rating ? Math.round(g.aggregated_rating) : 0;
  const ext: Record<string, number> = {};
  const scores: ExtScore[] = [];
  if (igdbScore) { ext.igdb = igdbScore; scores.push({ source: "igdb", score: igdbScore, maxScore: 100 }); }
  if (criticsScore) { ext.igdb_critics = criticsScore; scores.push({ source: "igdb_critics", score: criticsScore, maxScore: 100, scoreType: "critics" }); }

  const companies = g.involved_companies || [];
  const people: Person[] = companies
    .filter((c: any) => c.company?.name)
    .map((c: any) => ({ role: c.developer ? "Developer" : "Publisher", name: c.company.name }))
    .slice(0, 3);

  return {
    title: g.name,
    type: "game",
    genre: [...new Set(genres)] as string[],
    vibes: deriveVibes(genres, igdbScore ? igdbScore / 10 : undefined),
    year,
    cover: `https://images.igdb.com/igdb/image/upload/t_720p/${g.cover.image_id}.jpg`,
    description: (g.summary || "").slice(0, 800),
    people,
    platforms: [...new Set(platforms)] as string[],
    totalEp: 0,
    voteCount: g.total_rating_count || 0,
    ext,
    scores,
    igdbId: g.id,
    steamAppId,
  };
}

async function populateIgdb(prisma: PrismaClient): Promise<void> {
  const section = "games";
  initSection(section);
  console.log("\n🎮 IGDB Games...");

  const FIELDS = `fields name,cover.image_id,summary,genres.name,first_release_date,total_rating,total_rating_count,aggregated_rating,aggregated_rating_count,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,platforms,external_games.category,external_games.uid;`;

  let totalFetched = 0;
  let n = 0;

  const maxOffset = LIMIT > 0 ? Math.min(LIMIT, 4000) : 4000;

  // Main sweep: top by total_rating_count
  for (let offset = 0; offset < maxOffset; offset += 500) {
    const limit = Math.min(500, maxOffset - offset);
    const games = await igdbQuery("games",
      `${FIELDS} where total_rating_count > 5 & cover != null; sort total_rating_count desc; limit ${limit}; offset ${offset};`
    );
    totalFetched += games.length;
    for (const g of games) {
      const item = igdbToItem(g);
      if (item) { await insertItem(prisma, item, section); n++; }
    }
    process.stdout.write(`\r  Progress: ${offset + limit}/${maxOffset} queried | +${summary[section].inserted} new   `);
    await sleep(300);
    if (games.length < limit) break; // end of data
  }

  // Genre sweeps for breadth — genre IDs to check
  const genreIds = [2, 4, 5, 8, 9, 10, 11, 12, 13, 14, 25, 26, 31, 34];
  if (LIMIT === 0) {
    console.log("\n  Genre sweeps for breadth...");
    for (const gid of genreIds) {
      const games = await igdbQuery("games",
        `${FIELDS} where genres = (${gid}) & total_rating_count > 10 & cover != null; sort total_rating_count desc; limit 200;`
      );
      for (const g of games) {
        const item = igdbToItem(g);
        if (item) { await insertItem(prisma, item, section); n++; }
      }
      await sleep(300);
    }
  }

  console.log();
  logSection(section);
}

// ── Google Books ──────────────────────────────────────────────────────────────
function gBookToItem(vol: any, genreTag: string): CatalogItem | null {
  const info = vol.volumeInfo;
  if (!info?.title) return null;
  const thumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
  if (!thumb) return null;
  const cover = thumb.replace("zoom=1", "zoom=2").replace("&edge=curl", "").replace("http://", "https://");
  const year = parseInt((info.publishedDate || "0").slice(0, 4)) || 0;
  const cats = (info.categories || []).flatMap((c: string) => c.split(" / "));
  const genres = [...new Set([genreTag, ...cats])].filter(Boolean).slice(0, 5) as string[];
  const people: Person[] = [
    ...(info.authors || []).map((a: string) => ({ role: "Author", name: a })),
    ...(info.publisher ? [{ role: "Publisher", name: info.publisher }] : []),
  ].slice(0, 3);

  const gbScore = info.averageRating || 0;
  const scores: ExtScore[] = gbScore > 0 ? [{ source: "google_books", score: gbScore, maxScore: 5 }] : [];

  return {
    title: info.title,
    type: "book",
    genre: genres,
    vibes: deriveVibes(genres, gbScore ? gbScore * 2 : undefined),
    year,
    cover,
    description: (info.description || "").replace(/<[^>]*>/g, "").slice(0, 800),
    people,
    platforms: ["kindle", "audible"],
    totalEp: info.pageCount || 0,
    voteCount: info.ratingsCount || 0,
    ext: gbScore > 0 ? { google_books: gbScore } : {},
    scores,
    googleBooksId: vol.id,
  };
}

async function populateGoogleBooks(prisma: PrismaClient): Promise<void> {
  const section = "books-google";
  initSection(section);
  console.log("\n📖 Google Books...");

  const categories = [
    "fiction", "fantasy", "science fiction", "mystery", "thriller", "romance", "horror",
    "literary fiction", "young adult", "non-fiction", "biography", "history", "philosophy",
    "psychology", "self-help", "true crime", "memoir", "poetry", "graphic novels", "business",
    "science", "politics", "humor", "travel",
  ];
  const authors = [
    "Stephen King", "Brandon Sanderson", "Neil Gaiman", "Ursula Le Guin", "Terry Pratchett",
    "J.R.R. Tolkien", "George R.R. Martin", "Patrick Rothfuss", "Robin Hobb", "Joe Abercrombie",
    "Haruki Murakami", "Cormac McCarthy", "Toni Morrison", "Margaret Atwood", "Octavia Butler",
    "Philip K. Dick", "Isaac Asimov", "Frank Herbert", "Agatha Christie", "Arthur Conan Doyle",
    "Ray Bradbury", "Kurt Vonnegut", "Douglas Adams", "Liu Cixin", "Andrzej Sapkowski",
    "James Baldwin", "Gabriel Garcia Marquez", "Fyodor Dostoevsky", "Jane Austen", "Charles Dickens",
    "Ernest Hemingway", "F. Scott Fitzgerald", "Virginia Woolf", "Franz Kafka", "Albert Camus",
    "Chimamanda Ngozi Adichie", "Kazuo Ishiguro", "Donna Tartt", "Sally Rooney",
  ];

  const maxPerQuery = LIMIT > 0 ? Math.min(200, LIMIT) : 200;

  for (const cat of categories) {
    const query = `subject:${cat}`;
    let fetched = 0;
    for (let start = 0; start < maxPerQuery; start += 40) {
      const lim = Math.min(40, maxPerQuery - start);
      try {
        const data = await fetchWithRetry(
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${lim}&startIndex=${start}&orderBy=relevance&key=${GBOOKS_KEY}&langRestrict=en`
        );
        for (const vol of data.items || []) {
          const item = gBookToItem(vol, cat.charAt(0).toUpperCase() + cat.slice(1));
          if (item) { await insertItem(prisma, item, section); fetched++; }
        }
        await sleep(200);
      } catch (e: any) {
        console.warn(`  GBooks cat "${cat}" @${start}: ${e.message}`);
        break;
      }
    }
    process.stdout.write(`\r  categories: ${categories.indexOf(cat) + 1}/${categories.length} | +${summary[section].inserted} new   `);
  }

  for (const author of authors) {
    const query = `inauthor:"${author}"`;
    const maxA = LIMIT > 0 ? Math.min(50, LIMIT) : 50;
    for (let start = 0; start < maxA; start += 40) {
      const lim = Math.min(40, maxA - start);
      try {
        const data = await fetchWithRetry(
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${lim}&startIndex=${start}&key=${GBOOKS_KEY}&langRestrict=en`
        );
        for (const vol of data.items || []) {
          const item = gBookToItem(vol, "Fiction");
          if (item) await insertItem(prisma, item, section);
        }
        await sleep(200);
      } catch (e: any) {
        console.warn(`  GBooks author "${author}": ${e.message}`);
        break;
      }
    }
    process.stdout.write(`\r  authors: ${authors.indexOf(author) + 1}/${authors.length} | +${summary[section].inserted} new   `);
  }

  console.log();
  logSection(section);
}

// ── OpenLibrary ──────────────────────────────────────────────────────────────
function olToItem(doc: any): CatalogItem | null {
  if (!doc.title || !doc.author_name?.[0]) return null;
  const coverId = doc.cover_i;
  if (!coverId) return null;
  const cover = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  const year = doc.first_publish_year || 0;
  const genres = (doc.subject || []).slice(0, 5) as string[];
  const isbn = doc.isbn?.[0] as string | undefined;
  const olScore = doc.ratings_average ? Math.round(doc.ratings_average * 10) / 10 : 0;
  const scores: ExtScore[] = olScore > 0 ? [{ source: "google_books", score: olScore, maxScore: 5 }] : [];

  return {
    title: doc.title,
    type: "book",
    genre: genres.filter(Boolean).slice(0, 5),
    vibes: deriveVibes(genres, olScore ? olScore * 2 : undefined),
    year,
    cover,
    description: "",
    people: (doc.author_name || []).slice(0, 3).map((a: string) => ({ role: "Author", name: a })),
    platforms: ["kindle"],
    totalEp: doc.number_of_pages_median || 0,
    voteCount: doc.ratings_count || doc.edition_count || 0,
    ext: olScore > 0 ? { google_books: olScore } : {},
    scores,
  };
}

async function populateOpenLibrary(prisma: PrismaClient): Promise<void> {
  const section = "books-openlibrary";
  initSection(section);
  console.log("\n📚 OpenLibrary Books...");

  const subjects = [
    "fiction", "fantasy", "science_fiction", "mystery", "thriller", "horror", "romance",
    "literary_fiction", "young_adult", "historical_fiction", "biography", "philosophy",
    "poetry", "classics", "adventure", "dystopian", "crime", "humor", "war",
    "nature", "art", "true_crime",
  ];
  const authors = [
    "stephen+king", "neil+gaiman", "tolkien", "george+orwell", "agatha+christie",
    "isaac+asimov", "frank+herbert", "ursula+le+guin", "terry+pratchett", "philip+k+dick",
    "haruki+murakami", "cormac+mccarthy", "toni+morrison", "margaret+atwood",
    "octavia+butler", "james+baldwin", "gabriel+garcia+marquez", "dostoevsky",
    "jane+austen", "charles+dickens", "mark+twain", "ernest+hemingway",
    "f+scott+fitzgerald", "virginia+woolf", "franz+kafka", "albert+camus",
  ];

  const maxPerQuery = LIMIT > 0 ? Math.min(100, LIMIT) : 100;

  for (const subject of subjects) {
    for (let page = 1; page <= Math.ceil(maxPerQuery / 100); page++) {
      try {
        const data = await fetchWithRetry(
          `${OL_BASE}/search.json?subject=${subject}&limit=100&page=${page}&fields=title,author_name,first_publish_year,number_of_pages_median,subject,cover_i,isbn,edition_count,ratings_average,ratings_count`
        );
        for (const doc of data.docs || []) {
          const item = olToItem(doc);
          if (item) await insertItem(prisma, item, section);
        }
        await sleep(300);
      } catch (e: any) {
        console.warn(`  OL subject "${subject}": ${e.message}`);
      }
    }
    process.stdout.write(`\r  subjects: ${subjects.indexOf(subject) + 1}/${subjects.length} | +${summary[section].inserted} new   `);
  }

  for (const author of authors) {
    try {
      const data = await fetchWithRetry(
        `${OL_BASE}/search.json?author=${author}&limit=100&fields=title,author_name,first_publish_year,number_of_pages_median,subject,cover_i,isbn,edition_count,ratings_average,ratings_count`
      );
      for (const doc of data.docs || []) {
        const item = olToItem(doc);
        if (item) await insertItem(prisma, item, section);
      }
      await sleep(300);
    } catch (e: any) {
      console.warn(`  OL author "${author}": ${e.message}`);
    }
    process.stdout.write(`\r  authors: ${authors.indexOf(author) + 1}/${authors.length} | +${summary[section].inserted} new   `);
  }

  console.log();
  logSection(section);
}

// ── Jikan ────────────────────────────────────────────────────────────────────
function jikanToItem(r: any, type: "tv" | "manga"): CatalogItem | null {
  if (!r.title) return null;
  const cover = r.images?.jpg?.large_image_url || r.images?.jpg?.image_url;
  if (!cover) return null;

  const dateStr = type === "tv" ? r.aired?.from : r.published?.from;
  const year = dateStr ? new Date(dateStr).getFullYear() : 0;

  const baseGenres = [
    ...(r.genres || []).map((g: any) => g.name),
    ...(r.demographics || []).map((d: any) => d.name),
  ].slice(0, 5) as string[];

  const genres = type === "tv" ? ["Anime", ...baseGenres].slice(0, 5) : baseGenres;

  const malScore = r.score || 0;
  const scores: ExtScore[] = malScore > 0 ? [{ source: "mal", score: malScore, maxScore: 10 }] : [];

  const people: Person[] = type === "tv"
    ? (r.studios || []).map((s: any) => ({ role: "Studio", name: s.name })).slice(0, 2)
    : (r.authors || []).map((a: any) => ({ role: "Author", name: a.name })).slice(0, 2);

  return {
    title: r.title_english || r.title,
    type,
    genre: genres,
    vibes: deriveVibes(genres, malScore),
    year,
    cover,
    description: (r.synopsis || "").replace(/\[Written by MAL Rewrite\]/g, "").trim().slice(0, 800),
    people,
    platforms: type === "tv" ? ["crunchyroll", "funimation"] : ["mangaplus", "viz"],
    totalEp: type === "tv" ? (r.episodes || 0) : (r.chapters || r.volumes || 0),
    voteCount: r.scored_by || r.members || 0,
    ext: malScore > 0 ? { mal: malScore } : {},
    scores,
    malId: r.mal_id,
    itemSubtype: type === "tv" ? "anime" : undefined,
  };
}

async function fetchJikanPages(path: string, pages: number, type: "tv" | "manga"): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  const maxPages = LIMIT > 0 ? Math.ceil(LIMIT / 25) : pages;
  for (let page = 1; page <= maxPages; page++) {
    try {
      const data = await fetchWithRetry(`${JIKAN_BASE}${path}&page=${page}&limit=25`);
      for (const r of data.data || []) {
        const item = jikanToItem(r, type);
        if (item) items.push(item);
      }
      await sleep(400);
    } catch (e: any) {
      console.warn(`  Jikan ${path} p${page}: ${e.message}`);
      await sleep(1000);
    }
    if (LIMIT > 0 && items.length >= LIMIT) break;
  }
  return items;
}

async function populateJikanAnime(prisma: PrismaClient): Promise<void> {
  const section = "anime";
  initSection(section);
  console.log("\n🗾 Jikan Anime...");

  const sources: [string, number][] = [
    ["/top/anime?filter=bypopularity", 40],
    ["/top/anime?filter=favorite", 40],
    ["/top/anime?order_by=score", 40],
    ["/top/anime?filter=airing", 10],
  ];
  const animeGenres = [1, 2, 4, 5, 7, 8, 10, 22, 24, 36, 37, 41, 46]; // MAL genre IDs

  const all: CatalogItem[] = [];
  for (const [path, pages] of sources) {
    const items = await fetchJikanPages(path, pages, "tv");
    all.push(...items);
    console.log(`  ${path}: ${items.length} fetched`);
  }

  if (LIMIT === 0) {
    for (const gid of animeGenres) {
      const items = await fetchJikanPages(`/anime?genres=${gid}&order_by=members&sort=desc`, 8, "tv");
      all.push(...items);
      await sleep(400);
    }
  }

  console.log(`  Total: ${all.length} — inserting...`);
  for (const item of all) await insertItem(prisma, item, section);
  logSection(section);
}

async function populateJikanManga(prisma: PrismaClient): Promise<void> {
  const section = "manga";
  initSection(section);
  console.log("\n📕 Jikan Manga...");

  const sources: [string, number][] = [
    ["/top/manga?filter=bypopularity", 40],
    ["/top/manga?filter=favorite", 40],
    ["/top/manga?order_by=score", 40],
    ["/top/manga?filter=publishing", 10],
    ["/top/manga?type=manga", 20],
    ["/top/manga?type=manhwa", 8],
    ["/top/manga?type=manhua", 8],
    ["/top/manga?type=lightnovel", 8],
  ];

  const all: CatalogItem[] = [];
  for (const [path, pages] of sources) {
    const items = await fetchJikanPages(path, pages, "manga");
    all.push(...items);
    console.log(`  ${path}: ${items.length} fetched`);
  }

  if (LIMIT === 0) {
    const mangaGenres = [1, 2, 4, 7, 8, 10, 22, 36, 41, 46];
    for (const gid of mangaGenres) {
      const items = await fetchJikanPages(`/manga?genres=${gid}&order_by=members&sort=desc`, 8, "manga");
      all.push(...items);
      await sleep(400);
    }
  }

  console.log(`  Total: ${all.length} — inserting...`);
  for (const item of all) await insertItem(prisma, item, section);
  logSection(section);
}

// ── Comic Vine ───────────────────────────────────────────────────────────────
function cvToItem(vol: any, publisher: string): CatalogItem | null {
  const cover = vol.image?.original_url || vol.image?.medium_url;
  if (!cover || !vol.name) return null;
  const desc = (vol.description || vol.deck || "").replace(/<[^>]*>/g, "").slice(0, 800);
  const nameLow = (vol.name || "").toLowerCase();
  const genres: string[] = ["Comics"];
  if (nameLow.match(/batman|spider|superman|avenger|justice|x-men|fantastic/)) genres.push("Superhero");
  if (nameLow.match(/x-men|mutant/)) genres.push("Sci-Fi");
  if (["Image Comics", "Vertigo", "Dark Horse Comics", "IDW Publishing", "BOOM! Studios"].includes(publisher)) genres.push("Indie");

  return {
    title: vol.name,
    type: "comic",
    genre: [...new Set(genres)].slice(0, 4),
    vibes: deriveVibes(genres),
    year: parseInt(vol.start_year) || 0,
    cover,
    description: desc,
    people: [{ role: "Publisher", name: publisher }],
    platforms: ["comixology"],
    totalEp: vol.count_of_issues || 0,
    voteCount: vol.count_of_issues || 0,
    ext: {},
    scores: [],
    comicVineId: vol.id,
  };
}

async function populateComicVine(prisma: PrismaClient): Promise<void> {
  const section = "comics";
  initSection(section);
  console.log("\n💥 Comic Vine...");

  const publishers = [
    "Marvel", "DC Comics", "Image Comics", "Dark Horse Comics", "Vertigo",
    "IDW Publishing", "BOOM! Studios", "Oni Press", "Valiant", "Dynamite Entertainment",
  ];
  const maxPerPub = LIMIT > 0 ? Math.min(50, LIMIT) : 100;

  for (const pub of publishers) {
    console.log(`  ${pub}...`);
    for (let offset = 0; offset < maxPerPub; offset += 100) {
      const lim = Math.min(100, maxPerPub - offset);
      try {
        const data = await fetchWithRetry(
          `https://comicvine.gamespot.com/api/volumes/?api_key=${CV_KEY}&format=json&filter=publisher:${encodeURIComponent(pub)}&sort=count_of_issues:desc&limit=${lim}&offset=${offset}&field_list=name,image,start_year,count_of_issues,deck,description,publisher,id`
        );
        for (const vol of data.results || []) {
          const item = cvToItem(vol, pub);
          if (item) await insertItem(prisma, item, section);
        }
        await sleep(1200); // Comic Vine rate limit
      } catch (e: any) {
        console.warn(`  CV ${pub} @${offset}: ${e.message}`);
        await sleep(3000);
      }
    }
    process.stdout.write(`\r  publishers: ${publishers.indexOf(pub) + 1}/${publishers.length} | +${summary[section].inserted} new   `);
  }

  console.log();
  logSection(section);
}

// ── Spotify ──────────────────────────────────────────────────────────────────
let spotifyToken = "";
let spotifyTotalWaitMs = 0;
let spotifyConsecutive429 = 0;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken) return spotifyToken;
  const data = await fetchJson("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${SPOTIFY_ID}:${SPOTIFY_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  spotifyToken = data.access_token;
  return spotifyToken;
}

async function spotifyFetch(url: string): Promise<any | null> {
  if (spotifyConsecutive429 >= 3 || spotifyTotalWaitMs >= 5 * 60_000) return null;
  const token = await getSpotifyToken();
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429) {
      const wait = (parseInt(res.headers.get("retry-after") ?? "10") || 10) * 1000;
      spotifyTotalWaitMs += wait;
      spotifyConsecutive429++;
      console.warn(`\n  Spotify 429 (#${spotifyConsecutive429}), waiting ${wait / 1000}s (total ${spotifyTotalWaitMs / 1000}s)...`);
      if (spotifyConsecutive429 >= 3 || spotifyTotalWaitMs >= 5 * 60_000) {
        console.warn(`  Spotify stopped due to rate limiting.`);
        return null;
      }
      await sleep(wait);
      spotifyConsecutive429 = 0;
      return spotifyFetch(url);
    }
    if (!res.ok) throw new Error(`Spotify ${res.status}`);
    spotifyConsecutive429 = 0;
    await sleep(SPOTIFY_DELAY);
    return res.json();
  } catch (e: any) {
    console.warn(`  Spotify fetch error: ${e.message}`);
    return null;
  }
}

function spotifyAlbumToItem(a: any, genre: string): CatalogItem | null {
  if (!a?.name || !a.images?.[0]?.url) return null;
  const year = parseInt((a.release_date || "0").slice(0, 4)) || 0;
  const artists = (a.artists || []).map((ar: any) => ar.name).join(", ");
  const pop = a.popularity ?? 0;
  return {
    title: a.name,
    type: "music",
    genre: [genre].filter(Boolean),
    vibes: deriveVibes([genre]),
    year,
    cover: a.images[0].url,
    description: `${a.name} by ${artists}. ${a.album_type || "Album"}, ${a.total_tracks || 0} tracks.`,
    people: (a.artists || []).map((ar: any) => ({ role: "Artist", name: ar.name })).slice(0, 3),
    platforms: ["spotify", "apple_music"],
    totalEp: a.total_tracks || 0,
    voteCount: pop,
    ext: pop > 0 ? { spotify_popularity: pop } : {},
    scores: pop > 0 ? [{ source: "spotify_popularity", score: pop, maxScore: 100, scoreType: "platform" }] : [],
    spotifyId: a.id,
  };
}

function spotifyShowToItem(s: any): CatalogItem | null {
  if (!s?.name || !s.images?.[0]?.url) return null;
  const desc = (s.description || "").toLowerCase();
  const genres: string[] = [];
  if (desc.includes("true crime") || desc.includes("crime")) genres.push("True Crime");
  if (desc.includes("comedy") || desc.includes("humor")) genres.push("Comedy");
  if (desc.includes("news") || desc.includes("politics")) genres.push("News");
  if (desc.includes("tech") || desc.includes("science")) genres.push("Technology");
  if (desc.includes("business") || desc.includes("finance")) genres.push("Business");
  if (desc.includes("history")) genres.push("History");
  if (desc.includes("health") || desc.includes("wellness")) genres.push("Health");
  if (genres.length === 0) genres.push("General");
  const pop = s.popularity ?? 0;
  return {
    title: s.name,
    type: "podcast",
    genre: genres.slice(0, 3),
    vibes: deriveVibes(genres),
    year: 0,
    cover: s.images[0].url,
    description: (s.description || "").slice(0, 800),
    people: [{ role: "Host", name: s.publisher || "Unknown" }],
    platforms: ["spotify", "apple_pod"],
    totalEp: s.total_episodes || 0,
    voteCount: pop || s.total_episodes || 0,
    ext: pop > 0 ? { spotify_popularity: pop } : {},
    scores: pop > 0 ? [{ source: "spotify_popularity", score: pop, maxScore: 100, scoreType: "platform" }] : [],
    spotifyId: s.id,
  };
}

async function populateSpotifyMusic(prisma: PrismaClient): Promise<void> {
  const section = "music";
  initSection(section);
  console.log(`\n🎵 Spotify Music (delay: ${SPOTIFY_DELAY}ms)...`);
  spotifyConsecutive429 = 0;
  spotifyTotalWaitMs = 0;

  const genreQueries: [string, string][] = [
    ["genre:rock", "Rock"], ["genre:hip-hop", "Hip-Hop"], ["genre:pop", "Pop"],
    ["genre:jazz", "Jazz"], ["genre:classical", "Classical"], ["genre:electronic", "Electronic"],
    ["genre:r-b", "R&B"], ["genre:country", "Country"], ["genre:indie", "Indie"],
    ["genre:metal", "Metal"], ["genre:punk", "Punk"], ["genre:folk", "Folk"],
    ["genre:latin", "Latin"], ["genre:soul", "Soul"], ["genre:blues", "Blues"],
    ["genre:reggae", "Reggae"], ["genre:k-pop", "K-Pop"], ["genre:alternative", "Alternative"],
    ["genre:ambient", "Ambient"], ["genre:funk", "Funk"], ["genre:gospel", "Gospel"],
    ["genre:house", "Electronic"], ["genre:techno", "Electronic"], ["genre:trap", "Hip-Hop"],
    ["genre:lo-fi", "Lo-Fi"],
  ];
  const artistQueries: [string, string][] = [
    ["Radiohead", "Alternative"], ["Kendrick Lamar", "Hip-Hop"], ["Beyonce", "Pop"],
    ["Pink Floyd", "Rock"], ["The Beatles", "Rock"], ["Led Zeppelin", "Rock"],
    ["Nirvana", "Rock"], ["Kanye West", "Hip-Hop"], ["Taylor Swift", "Pop"],
    ["Drake", "Hip-Hop"], ["Frank Ocean", "R&B"], ["Tyler the Creator", "Hip-Hop"],
    ["Arctic Monkeys", "Indie"], ["Tame Impala", "Indie"], ["Daft Punk", "Electronic"],
    ["Gorillaz", "Alternative"], ["David Bowie", "Rock"], ["Queen", "Rock"],
    ["Fleetwood Mac", "Rock"], ["Stevie Wonder", "Soul"], ["Miles Davis", "Jazz"],
    ["John Coltrane", "Jazz"], ["Bob Marley", "Reggae"], ["OutKast", "Hip-Hop"],
    ["MF DOOM", "Hip-Hop"], ["SZA", "R&B"], ["Billie Eilish", "Pop"],
  ];

  const maxPerGenre = LIMIT > 0 ? Math.min(100, LIMIT) : 100;

  for (const [query, genre] of genreQueries) {
    if (spotifyConsecutive429 >= 3 || spotifyTotalWaitMs >= 5 * 60_000) {
      console.warn(`\n  Spotify music stopped early at ${summary[section].inserted} inserted due to rate limiting.`);
      console.warn(`  Re-run with: npx tsx scripts/populate-catalog.ts --type=music --spotify-delay=${SPOTIFY_DELAY + 500}`);
      break;
    }
    for (let offset = 0; offset < maxPerGenre; offset += 50) {
      const lim = Math.min(50, maxPerGenre - offset);
      const data = await spotifyFetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=${lim}&offset=${offset}&market=US`
      );
      if (!data) break;
      for (const a of data.albums?.items || []) {
        const item = spotifyAlbumToItem(a, genre);
        if (item) await insertItem(prisma, item, section);
      }
    }
    process.stdout.write(`\r  genres: ${genreQueries.indexOf([query, genre] as any) + 1}/${genreQueries.length} | +${summary[section].inserted} new   `);
  }

  for (const [artist, genre] of artistQueries) {
    if (spotifyConsecutive429 >= 3 || spotifyTotalWaitMs >= 5 * 60_000) break;
    const maxA = LIMIT > 0 ? Math.min(50, LIMIT) : 50;
    for (let offset = 0; offset < maxA; offset += 50) {
      const data = await spotifyFetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(`artist:${artist}`)}&type=album&limit=50&offset=${offset}&market=US`
      );
      if (!data) break;
      for (const a of data.albums?.items || []) {
        const item = spotifyAlbumToItem(a, genre);
        if (item) await insertItem(prisma, item, section);
      }
    }
  }

  console.log();
  logSection(section);
}

async function populateSpotifyPodcasts(prisma: PrismaClient): Promise<void> {
  const section = "podcasts";
  initSection(section);
  console.log(`\n🎙️ Spotify Podcasts (delay: ${SPOTIFY_DELAY}ms)...`);
  spotifyConsecutive429 = 0;
  spotifyTotalWaitMs = 0;

  const categories = [
    "technology", "comedy", "true crime", "society culture", "education",
    "music", "sports", "business", "health fitness", "science",
    "politics", "history", "news", "arts", "gaming",
  ];
  const knownPodcasts = [
    "Joe Rogan podcast", "Serial podcast", "This American Life", "Radiolab",
    "Hardcore History Dan Carlin", "Conan O Brien podcast", "Huberman Lab",
    "Lex Fridman podcast", "The Daily New York Times", "Stuff You Should Know",
    "My Favorite Murder", "Lore podcast", "Welcome to Night Vale",
    "Freakonomics Radio",
  ];

  const maxPerCat = LIMIT > 0 ? Math.min(100, LIMIT) : 100;

  for (const cat of [...categories, ...knownPodcasts]) {
    if (spotifyConsecutive429 >= 3 || spotifyTotalWaitMs >= 5 * 60_000) {
      console.warn(`\n  Spotify podcasts stopped early at ${summary[section].inserted} inserted.`);
      console.warn(`  Re-run with: npx tsx scripts/populate-catalog.ts --type=podcasts --spotify-delay=${SPOTIFY_DELAY + 500}`);
      break;
    }
    for (let offset = 0; offset < maxPerCat; offset += 50) {
      const lim = Math.min(50, maxPerCat - offset);
      const data = await spotifyFetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(cat)}&type=show&limit=${lim}&offset=${offset}&market=US`
      );
      if (!data) break;
      for (const s of data.shows?.items || []) {
        const item = spotifyShowToItem(s);
        if (item) await insertItem(prisma, item, section);
      }
    }
    process.stdout.write(`\r  queries: ${[...categories, ...knownPodcasts].indexOf(cat) + 1}/${categories.length + knownPodcasts.length} | +${summary[section].inserted} new   `);
  }

  console.log();
  logSection(section);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Literacy catalog population\n");
  if (TYPE_ARG) console.log(`  Type filter: --type=${TYPE_ARG}`);
  if (LIMIT) console.log(`  Limit: --limit=${LIMIT}`);
  if (SPOTIFY_DELAY !== 500) console.log(`  Spotify delay: --spotify-delay=${SPOTIFY_DELAY}ms`);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter } as any);

  // Preload existing IDs for fast dedup
  console.log("\n📊 Loading existing catalog...");
  const existingItems = await (prisma as any).item.findMany({
    select: { id: true, title: true, type: true, tmdbId: true, igdbId: true, malId: true, spotifyId: true, googleBooksId: true, comicVineId: true, parentItemId: true },
  });
  for (const e of existingItems) {
    if (e.tmdbId) existing.tmdbIds.add(e.tmdbId);
    if (e.igdbId) existing.igdbIds.add(e.igdbId);
    if (e.malId) existing.malIds.add(e.malId);
    if (e.spotifyId) existing.spotifyIds.add(e.spotifyId);
    if (e.googleBooksId) existing.googleBooksIds.add(e.googleBooksId);
    if (e.comicVineId) existing.comicVineIds.add(e.comicVineId);
    existing.titleType.add(`${normalizeTitle(e.title)}|||${e.type}`);
    // Populate anime base map for season-linking: only non-child, non-suffix entries
    if ((e.type === "tv" || e.type === "manga") && !e.parentItemId && !hasAnimeSuffix(e.title)) {
      const base = animeBaseKey(e.title);
      if (!existing.animeBaseIds.has(base)) existing.animeBaseIds.set(base, e.id);
    }
  }
  console.log(`  Loaded ${existingItems.length} existing items (${existing.tmdbIds.size} TMDB, ${existing.igdbIds.size} IGDB, ${existing.malIds.size} MAL, ${existing.spotifyIds.size} Spotify)`);

  // Decide which sections to run
  const run = (t: string) => !TYPE_ARG || TYPE_ARG === t;

  const startWall = Date.now();

  if (run("movies")) await populateTmdbMovies(prisma);
  if (run("tv")) await populateTmdbTv(prisma);
  if (run("games")) await populateIgdb(prisma);
  if (run("books")) { await populateGoogleBooks(prisma); await populateOpenLibrary(prisma); }
  if (run("anime")) await populateJikanAnime(prisma);
  if (run("manga")) await populateJikanManga(prisma);
  if (run("comics")) await populateComicVine(prisma);
  if (run("music")) await populateSpotifyMusic(prisma);
  if (run("podcasts")) await populateSpotifyPodcasts(prisma);

  // Final counts
  console.log("\n\n══════════════════════════════════════════");
  console.log("✅ Population complete!\n");

  const elapsed = Math.round((Date.now() - startWall) / 1000);
  console.log(`⏱  Runtime: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);

  if (elapsed > 30 * 60) {
    console.warn("⚠️  Script ran over 30 minutes. Consider running individual types with --type flag next time.");
  }

  console.log("\n📊 Items added this run:");
  let totalAdded = 0;
  for (const [name, s] of Object.entries(summary)) {
    if (s.inserted > 0 || s.skipped > 0) {
      console.log(`  ${name}: +${s.inserted} new, ${s.skipped} skipped, ${s.failed} failed`);
      totalAdded += s.inserted;
    }
  }
  console.log(`  TOTAL NEW: ${totalAdded}`);

  const counts: any[] = await (prisma as any).$queryRaw`SELECT type, COUNT(*)::int as count FROM items GROUP BY type ORDER BY count DESC`;
  console.log("\n📈 Current database totals:");
  let grandTotal = 0;
  for (const r of counts) {
    console.log(`  ${r.type}: ${r.count.toLocaleString()}`);
    grandTotal += r.count;
  }
  console.log(`  TOTAL: ${grandTotal.toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
