/**
 * Mega seed script — pulls real data from all connected APIs and populates the database.
 * Run with: npx tsx scripts/seed-catalog.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Config ──────────────────────────────────────────────────────────────────
const TMDB_KEY = process.env.TMDB_API_KEY!;
const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;
const GBOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY!;
const SPOTIFY_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const JIKAN_BASE = "https://api.jikan.moe/v4";
const CV_KEY = process.env.COMICVINE_API_KEY!;

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

interface Person { role: string; name: string }
interface SeedItem {
  title: string;
  type: string;
  genre: string[];
  vibes: string[];
  year: number;
  cover: string;
  description: string;
  people: Person[];
  awards: string[];
  platforms: string[];
  ext: Record<string, number>;
  totalEp: number;
  voteCount?: number;
}

const counts: Record<string, number> = {};
let totalAdded = 0;
let totalSkipped = 0;

// ── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
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
  if (score && score < 6) vibes.push("gritty");
  return [...new Set(vibes)].slice(0, 4);
}

const TMDB_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi", 10766: "Soap", 10767: "Talk", 10768: "War",
};

// ── TMDB ────────────────────────────────────────────────────────────────────
async function fetchTmdbList(path: string, pages: number): Promise<SeedItem[]> {
  const items: SeedItem[] = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const data = await fetchJson(
        `https://api.themoviedb.org/3${path}?api_key=${TMDB_KEY}&page=${page}&language=en-US`
      );
      for (const r of data.results || []) {
        if (!r.poster_path) continue;
        const isMovie = "title" in r;
        const title = r.title || r.name || "";
        const year = parseInt((r.release_date || r.first_air_date || "0").slice(0, 4)) || 0;
        if (!title || year === 0) continue;
        const genres = (r.genre_ids || []).map((id: number) => TMDB_GENRES[id]).filter(Boolean);
        items.push({
          title,
          type: isMovie ? "movie" : "tv",
          genre: [...new Set(genres)].slice(0, 4),
          vibes: deriveVibes(genres, r.vote_average),
          year,
          cover: `${TMDB_IMG}${r.poster_path}`,
          description: r.overview || "",
          people: [],
          awards: [],
          platforms: [],
          ext: r.vote_average ? { tmdb: Math.round(r.vote_average * 10) / 10 } : {},
          totalEp: isMovie ? 1 : 0,
        });
      }
      await sleep(250);
    } catch (e: any) {
      console.warn(`  TMDB ${path} page ${page} failed: ${e.message}`);
    }
  }
  return items;
}

async function seedTmdb(): Promise<SeedItem[]> {
  console.log("\n🎬 Fetching TMDB movies & TV...");
  const all: SeedItem[] = [];

  // Top rated movies (200 = 10 pages)
  console.log("  Top rated movies...");
  all.push(...await fetchTmdbList("/movie/top_rated", 10));

  // Popular movies (100 = 5 pages)
  console.log("  Popular movies...");
  all.push(...await fetchTmdbList("/movie/popular", 5));

  // Top rated TV (100 = 5 pages)
  console.log("  Top rated TV...");
  all.push(...await fetchTmdbList("/tv/top_rated", 5));

  // Currently airing TV (50 = 3 pages)
  console.log("  Currently airing TV...");
  all.push(...await fetchTmdbList("/tv/on_the_air", 3));

  console.log(`  → ${all.length} TMDB items fetched`);
  return all;
}

// ── IGDB ────────────────────────────────────────────────────────────────────
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

const IGDB_GENRES: Record<number, string> = {
  2: "RPG", 4: "Fighting", 5: "Shooter", 7: "Music", 8: "Platform",
  9: "Puzzle", 10: "Racing", 11: "Strategy", 12: "Simulation",
  13: "Sports", 14: "Survival", 15: "Turn-Based", 24: "Tactical",
  25: "Hack & Slash", 26: "Adventure", 30: "Card Game", 31: "Indie",
  32: "MOBA", 33: "Arcade", 34: "Visual Novel", 35: "Open World",
  36: "MMORPG",
};

const IGDB_PLATFORMS: Record<number, string> = {
  6: "ps", 48: "ps", 167: "ps", 169: "ps",
  49: "xbox", 169: "xbox",
  130: "switch",
  3: "steam", 6: "steam", 14: "steam",
};

async function igdbQuery(endpoint: string, body: string): Promise<any[]> {
  const token = await getIgdbToken();
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": IGDB_ID,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!res.ok) throw new Error(`IGDB ${res.status}: ${await res.text()}`);
  return res.json();
}

function igdbToItem(g: any): SeedItem | null {
  if (!g.name || !g.cover?.image_id) return null;
  const year = g.first_release_date
    ? new Date(g.first_release_date * 1000).getFullYear()
    : 0;
  if (year === 0) return null;

  const genres = (g.genres || [])
    .map((gn: any) => gn.name || IGDB_GENRES[gn.id || gn] || "")
    .filter(Boolean)
    .slice(0, 4);

  const companies = g.involved_companies || [];
  const people: Person[] = [];
  for (const c of companies) {
    if (c.company?.name) {
      people.push({
        role: c.developer ? "Developer" : c.publisher ? "Publisher" : "Company",
        name: c.company.name,
      });
    }
  }

  const platforms: string[] = [];
  for (const p of g.platforms || []) {
    const pid = typeof p === "number" ? p : p.id;
    if ([6, 48, 167, 169].includes(pid)) platforms.push("ps");
    if ([49, 169].includes(pid)) platforms.push("xbox");
    if (pid === 130) platforms.push("switch");
    if ([3, 6, 14].includes(pid)) platforms.push("steam");
  }

  // total_rating is 0-100 (community blend); aggregated_rating is 0-100 (critics only)
  const igdbScore = g.total_rating ? Math.round(g.total_rating) : undefined;
  const criticsScore = g.aggregated_rating ? Math.round(g.aggregated_rating) : undefined;
  const ext: Record<string, number> = {};
  if (igdbScore) ext.igdb = igdbScore;
  if (criticsScore) ext.igdb_critics = criticsScore;

  return {
    title: g.name,
    type: "game",
    genre: [...new Set(genres)],
    vibes: deriveVibes(genres, igdbScore),
    year,
    cover: `https://images.igdb.com/igdb/image/upload/t_720p/${g.cover.image_id}.jpg`,
    description: g.summary || "",
    people: people.slice(0, 3),
    awards: [],
    platforms: [...new Set(platforms)],
    ext,
    totalEp: 0,
  };
}

async function seedIgdb(): Promise<SeedItem[]> {
  console.log("\n🎮 Fetching IGDB games...");
  const all: SeedItem[] = [];

  const IGDB_FIELDS = `fields name,cover.image_id,summary,genres.name,first_release_date,total_rating,aggregated_rating,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,platforms;`;

  // Top rated games (150)
  console.log("  Top rated games...");
  for (let offset = 0; offset < 150; offset += 50) {
    try {
      const games = await igdbQuery("games",
        `${IGDB_FIELDS}
        where total_rating_count > 50 & cover != null;
        sort total_rating desc;
        limit 50; offset ${offset};`
      );
      for (const g of games) {
        const item = igdbToItem(g);
        if (item) all.push(item);
      }
      await sleep(300);
    } catch (e: any) {
      console.warn(`  IGDB top rated offset ${offset} failed: ${e.message}`);
    }
  }

  // Popular recent games (50)
  console.log("  Popular recent games...");
  const twoYearsAgo = Math.floor(Date.now() / 1000) - 2 * 365 * 24 * 3600;
  try {
    const games = await igdbQuery("games",
      `${IGDB_FIELDS}
      where first_release_date > ${twoYearsAgo} & total_rating_count > 10 & cover != null;
      sort total_rating desc;
      limit 50;`
    );
    for (const g of games) {
      const item = igdbToItem(g);
      if (item) all.push(item);
    }
  } catch (e: any) {
    console.warn(`  IGDB popular recent failed: ${e.message}`);
  }

  // Top indie games (30)
  console.log("  Top indie games...");
  try {
    const games = await igdbQuery("games",
      `${IGDB_FIELDS}
      where genres = (31) & total_rating_count > 20 & cover != null;
      sort total_rating desc;
      limit 30;`
    );
    for (const g of games) {
      const item = igdbToItem(g);
      if (item) all.push(item);
    }
  } catch (e: any) {
    console.warn(`  IGDB indie failed: ${e.message}`);
  }

  console.log(`  → ${all.length} IGDB items fetched`);
  return all;
}

// ── Google Books ────────────────────────────────────────────────────────────
async function searchBooks(query: string, maxResults: number): Promise<SeedItem[]> {
  const items: SeedItem[] = [];
  for (let start = 0; start < maxResults; start += 40) {
    const limit = Math.min(40, maxResults - start);
    try {
      const data = await fetchJson(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${limit}&startIndex=${start}&orderBy=relevance&key=${GBOOKS_KEY}&langRestrict=en`
      );
      for (const vol of data.items || []) {
        const info = vol.volumeInfo;
        if (!info?.title) continue;
        // Skip if no cover
        const thumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
        if (!thumb) continue;
        // Upgrade cover quality
        const cover = thumb.replace("zoom=1", "zoom=2").replace("&edge=curl", "").replace("http://", "https://");

        const year = parseInt((info.publishedDate || "0").slice(0, 4)) || 0;
        const genres = (info.categories || []).flatMap((c: string) => c.split(" / ")).slice(0, 4);

        const people: Person[] = [];
        for (const a of info.authors || []) people.push({ role: "Author", name: a });
        if (info.publisher) people.push({ role: "Publisher", name: info.publisher });

        items.push({
          title: info.title,
          type: "book",
          genre: [...new Set(genres)],
          vibes: deriveVibes(genres, info.averageRating ? info.averageRating * 2 : undefined),
          year,
          cover,
          description: (info.description || "").replace(/<[^>]*>/g, "").slice(0, 500),
          people: people.slice(0, 3),
          awards: [],
          platforms: ["kindle", "audible"],
          // google_books key: 0-5 scale (Google Books averageRating, NOT Goodreads)
          ext: info.averageRating ? { google_books: info.averageRating } : {},
          totalEp: info.pageCount || 0,
          // Store Google Books ratingsCount so books pass the quality floor
          voteCount: info.ratingsCount || 0,
        });
      }
      await sleep(200);
    } catch (e: any) {
      console.warn(`  Google Books "${query}" offset ${start} failed: ${e.message}`);
    }
  }
  return items;
}

async function seedBooks(): Promise<SeedItem[]> {
  console.log("\n📖 Fetching Google Books...");
  const all: SeedItem[] = [];

  const queries: [string, number][] = [
    ["subject:fiction bestseller", 50],
    ["subject:science fiction best", 30],
    ["subject:fantasy best rated", 30],
    ["subject:thriller mystery best", 30],
    ["subject:fiction literary classics", 30],
    ["subject:nonfiction bestseller", 20],
    ["subject:horror best", 20],
  ];

  for (const [query, limit] of queries) {
    console.log(`  "${query}" (${limit})...`);
    all.push(...await searchBooks(query, limit));
  }

  console.log(`  → ${all.length} book items fetched`);
  return all;
}

// ── Jikan (Manga & Anime) ──────────────────────────────────────────────────
async function fetchJikanPage(path: string): Promise<any[]> {
  try {
    const data = await fetchJson(`${JIKAN_BASE}${path}`);
    return data.data || [];
  } catch (e: any) {
    console.warn(`  Jikan ${path} failed: ${e.message}`);
    return [];
  }
}

function jikanMangaToItem(m: any): SeedItem | null {
  if (!m.title) return null;
  const cover = m.images?.jpg?.large_image_url || m.images?.jpg?.image_url;
  if (!cover) return null;

  const year = m.published?.from ? new Date(m.published.from).getFullYear() : 0;
  const genres = [
    ...(m.genres || []).map((g: any) => g.name),
    ...(m.demographics || []).map((d: any) => d.name),
  ].slice(0, 4);

  return {
    title: m.title_english || m.title,
    type: "manga",
    genre: genres,
    vibes: deriveVibes(genres, m.score),
    year,
    cover,
    description: (m.synopsis || "").slice(0, 500),
    people: (m.authors || []).map((a: any) => ({ role: "Author", name: a.name })).slice(0, 2),
    awards: [],
    platforms: ["mangaplus", "viz"],
    ext: m.score ? { mal: m.score } : {},
    totalEp: m.chapters || m.volumes || 0,
  };
}

function jikanAnimeToItem(a: any): SeedItem | null {
  if (!a.title) return null;
  const cover = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url;
  if (!cover) return null;

  const year = a.aired?.from ? new Date(a.aired.from).getFullYear() : 0;
  const genres = [
    "Anime",
    ...(a.genres || []).map((g: any) => g.name),
  ].slice(0, 5);

  return {
    title: a.title_english || a.title,
    type: "tv",
    genre: genres,
    vibes: deriveVibes(genres, a.score),
    year,
    cover,
    description: (a.synopsis || "").slice(0, 500),
    people: (a.studios || []).map((s: any) => ({ role: "Studio", name: s.name })).slice(0, 2),
    awards: [],
    platforms: [],
    ext: a.score ? { mal: a.score } : {},
    totalEp: a.episodes || 0,
  };
}

async function seedJikan(): Promise<SeedItem[]> {
  console.log("\n🗾 Fetching Jikan manga & anime...");
  const all: SeedItem[] = [];

  // Top manga (100 = 4 pages)
  console.log("  Top rated manga...");
  for (let page = 1; page <= 4; page++) {
    const data = await fetchJikanPage(`/top/manga?page=${page}&limit=25`);
    for (const m of data) {
      const item = jikanMangaToItem(m);
      if (item) all.push(item);
    }
    await sleep(400); // Jikan rate limit: ~3 req/s
  }

  // Popular publishing manga (50 = 2 pages)
  console.log("  Popular publishing manga...");
  for (let page = 1; page <= 2; page++) {
    const data = await fetchJikanPage(`/top/manga?page=${page}&limit=25&filter=publishing`);
    for (const m of data) {
      const item = jikanMangaToItem(m);
      if (item) all.push(item);
    }
    await sleep(400);
  }

  // Top anime (100 = 4 pages)
  console.log("  Top rated anime...");
  for (let page = 1; page <= 4; page++) {
    const data = await fetchJikanPage(`/top/anime?page=${page}&limit=25`);
    for (const a of data) {
      const item = jikanAnimeToItem(a);
      if (item) all.push(item);
    }
    await sleep(400);
  }

  // Currently airing anime (30)
  console.log("  Currently airing anime...");
  for (let page = 1; page <= 2; page++) {
    const data = await fetchJikanPage(`/top/anime?page=${page}&limit=15&filter=airing`);
    for (const a of data) {
      const item = jikanAnimeToItem(a);
      if (item) all.push(item);
    }
    await sleep(400);
  }

  console.log(`  → ${all.length} Jikan items fetched`);
  return all;
}

// ── Spotify ─────────────────────────────────────────────────────────────────
let spotifyToken = "";

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

async function spotifySearch(query: string, type: "album" | "show", limit: number): Promise<any[]> {
  const token = await getSpotifyToken();
  const results: any[] = [];
  for (let offset = 0; offset < limit; offset += 20) {
    const batchLimit = Math.min(20, limit - offset);
    try {
      const data = await fetchJson(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${batchLimit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const items = type === "album" ? data.albums?.items : data.shows?.items;
      if (items) results.push(...items);
      await sleep(100);
    } catch (e: any) {
      console.warn(`  Spotify search "${query}" failed: ${e.message}`);
    }
  }
  return results;
}

function spotifyAlbumToItem(a: any): SeedItem | null {
  if (!a.name || !a.images?.[0]?.url) return null;
  const year = parseInt((a.release_date || "0").slice(0, 4)) || 0;
  const artists = (a.artists || []).map((ar: any) => ar.name).join(", ");

  return {
    title: a.name,
    type: "music",
    genre: [],  // Album search doesn't return genres; we'll tag by search query
    vibes: [],
    year,
    cover: a.images[0].url,
    description: `${a.name} by ${artists}. ${a.album_type || "album"}, ${a.total_tracks || 0} tracks.`,
    people: (a.artists || []).map((ar: any) => ({ role: "Artist", name: ar.name })).slice(0, 3),
    awards: [],
    platforms: ["spotify", "apple_music"],
    // popularity populated by enrichSpotifyPopularity() after initial fetch
    ext: a.popularity !== undefined ? { spotify_popularity: a.popularity } : {},
    totalEp: a.total_tracks || 0,
    voteCount: a.popularity || 0,
  };
}

/** Batch-fetch album popularity from Spotify (search results don't include it) */
async function enrichSpotifyPopularity(albums: any[]): Promise<void> {
  const token = await getSpotifyToken();
  const ids = albums.filter((a) => a.id && a.ext && !Object.keys(a.ext).length).map((a) => a._spotifyId).filter(Boolean);
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20).join(",");
    try {
      const data = await fetchJson(`https://api.spotify.com/v1/albums?ids=${batch}&market=US`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      for (const album of (data?.albums || [])) {
        if (!album?.id || album.popularity === undefined) continue;
        const match = albums.find((a) => a._spotifyId === album.id);
        if (match) {
          match.ext = { spotify_popularity: album.popularity };
          match.voteCount = album.popularity;
        }
      }
      await sleep(100);
    } catch {}
  }
}

function spotifyShowToItem(s: any): SeedItem | null {
  if (!s.name || !s.images?.[0]?.url) return null;
  const genres: string[] = [];
  const desc = (s.description || "").toLowerCase();
  if (desc.includes("true crime") || desc.includes("crime")) genres.push("True Crime");
  if (desc.includes("comedy") || desc.includes("humor")) genres.push("Comedy");
  if (desc.includes("news") || desc.includes("politics")) genres.push("News");
  if (desc.includes("tech") || desc.includes("science")) genres.push("Technology");
  if (desc.includes("business") || desc.includes("finance")) genres.push("Business");
  if (desc.includes("history")) genres.push("History");
  if (desc.includes("health") || desc.includes("wellness")) genres.push("Health");
  if (genres.length === 0) genres.push("General");

  return {
    title: s.name,
    type: "podcast",
    genre: genres.slice(0, 3),
    vibes: deriveVibes(genres),
    year: 0,
    cover: s.images[0].url,
    description: (s.description || "").slice(0, 500),
    people: [{ role: "Host", name: s.publisher || "Unknown" }],
    awards: [],
    platforms: ["spotify", "apple_pod"],
    ext: s.popularity !== undefined ? { spotify_popularity: s.popularity } : {},
    totalEp: s.total_episodes || 0,
    voteCount: s.popularity || s.total_episodes || 0,
  };
}

async function seedSpotify(): Promise<SeedItem[]> {
  console.log("\n🎵 Fetching Spotify albums & podcasts...");
  const all: SeedItem[] = [];

  const albumQueries: [string, string[], number][] = [
    ["greatest albums of all time", ["Rock", "Pop"], 20],
    ["best hip hop albums", ["Hip-Hop"], 15],
    ["best rock albums", ["Rock"], 15],
    ["best electronic albums", ["Electronic"], 10],
    ["best R&B albums", ["R&B"], 10],
    ["best indie albums", ["Indie"], 10],
    ["best jazz albums", ["Jazz"], 10],
    ["best classical albums", ["Classical"], 10],
  ];

  const rawAlbums: any[] = [];
  for (const [query, genreTags, limit] of albumQueries) {
    console.log(`  Albums: "${query}" (${limit})...`);
    const albums = await spotifySearch(query, "album", limit);
    for (const a of albums) {
      const item = spotifyAlbumToItem(a) as any;
      if (item) {
        item.genre = genreTags;
        item.vibes = deriveVibes(genreTags);
        item._spotifyId = a.id; // Store for popularity batch fetch
        rawAlbums.push(item);
        all.push(item);
      }
    }
  }

  // Batch-fetch album popularity from Spotify (20 at a time)
  console.log(`  Fetching album popularity for ${rawAlbums.length} albums...`);
  const token = await getSpotifyToken();
  const noPopularity = rawAlbums.filter((a) => !Object.keys(a.ext).length && a._spotifyId);
  for (let i = 0; i < noPopularity.length; i += 20) {
    const ids = noPopularity.slice(i, i + 20).map((a: any) => a._spotifyId).join(",");
    try {
      const data = await fetchJson(`https://api.spotify.com/v1/albums?ids=${ids}&market=US`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      for (const album of (data?.albums || [])) {
        if (!album?.id || album.popularity === undefined) continue;
        const match = noPopularity.find((a: any) => a._spotifyId === album.id);
        if (match) { match.ext = { spotify_popularity: album.popularity }; match.voteCount = album.popularity; }
      }
    } catch {}
    await sleep(150);
  }

  // Podcasts
  console.log("  Top podcasts (30)...");
  const shows = await spotifySearch("top podcasts", "show", 30);
  for (const s of shows) {
    const item = spotifyShowToItem(s);
    if (item) all.push(item);
  }

  console.log(`  → ${all.length} Spotify items fetched`);
  return all;
}

// ── Comic Vine ──────────────────────────────────────────────────────────────
async function seedComicVine(): Promise<SeedItem[]> {
  console.log("\n💥 Fetching Comic Vine comics...");
  const all: SeedItem[] = [];

  const publishers = ["Marvel", "DC Comics", "Image Comics", "Dark Horse Comics", "Vertigo"];

  for (const pub of publishers) {
    console.log(`  ${pub}...`);
    try {
      const data = await fetchJson(
        `https://comicvine.gamespot.com/api/volumes/?api_key=${CV_KEY}&format=json&filter=publisher:${encodeURIComponent(pub)}&sort=count_of_issues:desc&limit=10&field_list=name,image,start_year,count_of_issues,deck,description,publisher`
      );
      for (const vol of data.results || []) {
        const cover = vol.image?.original_url || vol.image?.medium_url;
        if (!cover || !vol.name) continue;

        const desc = vol.description
          ? vol.description.replace(/<[^>]*>/g, "").slice(0, 500)
          : vol.deck || "";

        const genres: string[] = ["Comics"];
        const nameLower = (vol.name || "").toLowerCase();
        if (nameLower.includes("batman") || nameLower.includes("spider") || nameLower.includes("aveng")) genres.push("Superhero");
        if (nameLower.includes("x-men") || nameLower.includes("mutant")) genres.push("Superhero", "Sci-Fi");
        if (pub === "Image Comics" || pub === "Vertigo") genres.push("Indie");

        all.push({
          title: vol.name,
          type: "comic",
          genre: [...new Set(genres)].slice(0, 4),
          vibes: deriveVibes(genres),
          year: parseInt(vol.start_year) || 0,
          cover,
          description: desc,
          people: [{ role: "Publisher", name: pub }],
          awards: [],
          platforms: ["comixology"],
          ext: {},
          totalEp: vol.count_of_issues || 0,
        });
      }
      await sleep(1000); // Comic Vine is rate-limited
    } catch (e: any) {
      console.warn(`  Comic Vine ${pub} failed: ${e.message}`);
    }
  }

  console.log(`  → ${all.length} Comic Vine items fetched`);
  return all;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Starting mega catalog seed...\n");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Get existing titles for deduplication
  const existing = await prisma.item.findMany({ select: { title: true, type: true } });
  const existingSet = new Set(existing.map((e) => `${e.title}|||${e.type}`));
  console.log(`📊 ${existingSet.size} items already in database\n`);

  // Fetch from all APIs
  const [tmdb, igdb, books, jikan, spotify, comics] = await Promise.all([
    seedTmdb(),
    seedIgdb(),
    seedBooks(),
    seedJikan(),
    seedSpotify(),
    seedComicVine(),
  ]);

  const allItems = [...tmdb, ...igdb, ...books, ...jikan, ...spotify, ...comics];
  console.log(`\n📦 Total fetched: ${allItems.length} items`);

  // Deduplicate by title+type
  const seen = new Set(existingSet);
  const toInsert: SeedItem[] = [];
  for (const item of allItems) {
    const key = `${item.title}|||${item.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    toInsert.push(item);
  }

  console.log(`🔍 After dedup: ${toInsert.length} new items to insert\n`);

  // Insert in batches
  let inserted = 0;
  const batchSize = 50;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    try {
      await prisma.item.createMany({
        data: batch.map((item) => ({
          title: item.title,
          type: item.type,
          genre: item.genre,
          vibes: item.vibes,
          year: item.year,
          cover: item.cover,
          description: item.description,
          people: item.people as any,
          awards: item.awards as any,
          platforms: item.platforms as any,
          ext: item.ext as any,
          totalEp: item.totalEp,
          isUpcoming: false,
          ...(item.voteCount !== undefined ? { voteCount: item.voteCount } : {}),
        })),
        skipDuplicates: true,
      });
      inserted += batch.length;
      // Count by type
      for (const item of batch) {
        counts[item.type] = (counts[item.type] || 0) + 1;
      }
      process.stdout.write(`\r  Inserted ${inserted}/${toInsert.length}...`);
    } catch (e: any) {
      console.warn(`\n  Batch insert failed at ${i}: ${e.message}`);
    }
  }

  console.log(`\n\n✅ Seed complete!`);
  console.log(`\n📊 Items added by type:`);
  for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  const total = await prisma.item.count();
  console.log(`\n📈 Total items in database: ${total}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
