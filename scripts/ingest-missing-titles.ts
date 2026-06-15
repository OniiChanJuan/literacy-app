/**
 * Targeted single-title ingestion of the ~55 confirmed-missing corpus titles
 * (from docs/handoffs/catalog-expansion-reconciliation-2026-06-14.md), leverage-first.
 * NOT a populate-catalog re-run — searches each source API for the specific title.
 *
 * Sources: Movies/TV=TMDB, Books=Google Books (intitle+inauthor), Game=IGDB, Anime=Jikan.
 * (Anime uses Jikan to stay consistent with the existing anime catalog + `mal` score
 *  convention; the reconciliation's "AniList" note would need a new integration — flagged.)
 *
 * Run: npx tsx scripts/ingest-missing-titles.ts --dry   # preview matches, no writes
 *      npx tsx scripts/ingest-missing-titles.ts         # insert
 *
 * Item shaping mirrors scripts/populate-catalog.ts exactly (same fields, dedup,
 * ExternalScore upsert). Captures inserted ids to ingested-missing-ids.json.
 * Run scripts/calculate-dimensions.ts afterwards (per the task instruction).
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";

const DRY = process.argv.includes("--dry");
const TMDB_KEY = process.env.TMDB_API_KEY!;
const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;
const GBOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY!;
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const JIKAN_BASE = "https://api.jikan.moe/v4";

type Person = { role: string; name: string };
type ExtScore = { source: string; score: number; maxScore: number; scoreType?: string };
type CatalogItem = {
  title: string; type: string; genre: string[]; vibes: string[]; year: number; cover: string;
  description: string; people: Person[]; platforms: string[]; totalEp: number; voteCount: number;
  ext: Record<string, number>; scores: ExtScore[];
  tmdbId?: number; igdbId?: number; malId?: number; googleBooksId?: string; steamAppId?: number; itemSubtype?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function nrm(t: string): string {
  return t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, " ");
}
function deriveVibes(genres: string[], score?: number): string[] {
  const vibes: string[] = []; const gl = genres.map((g) => g.toLowerCase());
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
const TMDB_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary",
  18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War",
  37: "Western", 10759: "Action & Adventure", 10765: "Sci-Fi & Fantasy", 10768: "War & Politics",
  10766: "Soap", 10767: "Talk", 10764: "Reality", 10763: "News", 10762: "Kids",
};

// ── The ~55 confirmed-missing, leverage-first (activates desc). year/author hints disambiguate. ──
type Seed = { title: string; type: "movie" | "tv" | "book" | "game" | "anime"; act: number; year?: number; author?: string; q?: string };
const SEEDS: Seed[] = [
  { title: "Outer Wilds", type: "game", act: 7, year: 2019 },
  { title: "The Time Traveler's Wife", type: "book", act: 5, author: "Audrey Niffenegger" },
  { title: "The Power Broker", type: "book", act: 4, author: "Robert Caro" },
  { title: "Mistborn", type: "book", act: 3, author: "Brandon Sanderson" },
  { title: "Altered Carbon", type: "book", act: 3, author: "Richard K. Morgan" },
  { title: "The Silence of the Lambs", type: "book", act: 3, author: "Thomas Harris" },
  { title: "Snow Crash", type: "book", act: 2, author: "Neal Stephenson" },
  { title: "The Call of Cthulhu", type: "book", act: 2, author: "Lovecraft" },
  { title: "The Girl with All the Gifts", type: "book", act: 2, author: "M. R. Carey" },
  { title: "The Wheel of Time", type: "book", act: 2, author: "Robert Jordan", q: "Eye of the World Robert Jordan" },
  { title: "Battle Royale", type: "book", act: 2, author: "Koushun Takami" },
  { title: "Parks and Recreation", type: "tv", act: 2, year: 2009 },
  { title: "The Death of Stalin", type: "movie", act: 2, year: 2017 },
  { title: "20,000 Leagues Under the Sea", type: "book", act: 1, author: "Jules Verne" },
  { title: "Atlas Shrugged", type: "book", act: 1, author: "Ayn Rand" },
  { title: "Blindsight", type: "book", act: 1, author: "Peter Watts" },
  { title: "Brideshead Revisited", type: "book", act: 1, author: "Evelyn Waugh" },
  { title: "Fear and Loathing in Las Vegas", type: "book", act: 1, author: "Hunter S. Thompson" },
  { title: "Fight Club", type: "book", act: 1, author: "Chuck Palahniuk" },
  { title: "From Blood and Ash", type: "book", act: 1, author: "Jennifer L. Armentrout" },
  { title: "If We Were Villains", type: "book", act: 1, author: "M. L. Rio" },
  { title: "Lore Olympus", type: "book", act: 1, author: "Rachel Smythe" },
  { title: "Murderbot Diaries", type: "book", act: 1, author: "Martha Wells", q: "All Systems Red Martha Wells" },
  { title: "My Side of the Mountain", type: "book", act: 1, author: "Jean Craighead George" },
  { title: "Shōgun", type: "book", act: 1, author: "James Clavell" },
  { title: "The City of Ember", type: "book", act: 1, author: "Jeanne DuPrau" },
  { title: "The Count of Monte Cristo", type: "book", act: 1, author: "Alexandre Dumas" },
  { title: "The Expanse", type: "book", act: 1, author: "James S. A. Corey", q: "Leviathan Wakes James Corey" },
  { title: "The Fountainhead", type: "book", act: 1, author: "Ayn Rand" },
  { title: "The Hating Game", type: "book", act: 1, author: "Sally Thorne" },
  { title: "The House of the Spirits", type: "book", act: 1, author: "Isabel Allende" },
  { title: "The Long Way to a Small, Angry Planet", type: "book", act: 1, author: "Becky Chambers" },
  { title: "The Magicians", type: "book", act: 1, author: "Lev Grossman" },
  { title: "Uprooted", type: "book", act: 1, author: "Naomi Novik" },
  { title: "We", type: "book", act: 1, author: "Yevgeny Zamyatin" },
  { title: "World War Z", type: "book", act: 1, author: "Max Brooks" },
  { title: "Ready or Not", type: "movie", act: 1, year: 2019 },
  { title: "The Witch", type: "movie", act: 1, year: 2015 },
  { title: "Begin Again", type: "movie", act: 1, year: 2013 },
  { title: "Glengarry Glen Ross", type: "movie", act: 1, year: 1992 },
  { title: "Kill Your Darlings", type: "movie", act: 1, year: 2013 },
  { title: "The Fountain", type: "movie", act: 1, year: 2006 },
  { title: "The Last of Sheila", type: "movie", act: 1, year: 1973 },
  { title: "The Stepford Wives", type: "movie", act: 1, year: 1975 },
  { title: "Buffy the Vampire Slayer", type: "tv", act: 1, year: 1997 },
  { title: "Penny Dreadful", type: "tv", act: 1, year: 2014 },
  { title: "Russian Doll", type: "tv", act: 1, year: 2019 },
  { title: "Wolf Hall", type: "tv", act: 1, year: 2015 },
  { title: "Years and Years", type: "tv", act: 1, year: 2019 },
  { title: "The Corner", type: "tv", act: 1, year: 2000 },
  { title: "Critical Role", type: "tv", act: 1, year: 2015 },
  { title: "Little Fires Everywhere", type: "tv", act: 1, year: 2020 },
  { title: "The Walking Dead", type: "tv", act: 1, year: 2010 },
  { title: "Record of Lodoss War", type: "anime", act: 1 },
  { title: "Hajime no Ippo", type: "anime", act: 1 },
];

async function jget(url: string, opts?: RequestInit, retries = 4): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, opts);
    if (res.status === 429) {
      const wait = Math.min(2000 * (i + 1), 8000);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`);
    return res.json();
  }
  throw new Error(`HTTP 429 (exhausted retries) ${url.slice(0, 90)}`);
}

// ── searchers → best CatalogItem ──
async function searchTmdb(s: Seed): Promise<CatalogItem | null> {
  const kind = s.type === "movie" ? "movie" : "tv";
  const yearParam = s.year ? (kind === "movie" ? `&primary_release_year=${s.year}` : `&first_air_date_year=${s.year}`) : "";
  const data = await jget(`https://api.themoviedb.org/3/search/${kind}?api_key=${TMDB_KEY}&query=${encodeURIComponent(s.title)}${yearParam}`);
  let results: any[] = (data.results || []).filter((r: any) => r.poster_path);
  if (results.length === 0) {
    const d2 = await jget(`https://api.themoviedb.org/3/search/${kind}?api_key=${TMDB_KEY}&query=${encodeURIComponent(s.title)}`);
    results = (d2.results || []).filter((r: any) => r.poster_path);
  }
  if (results.length === 0) return null;
  const qn = nrm(s.title);
  results.sort((a, b) => {
    const an = nrm(a.title || a.name || ""), bn = nrm(b.title || b.name || "");
    const aExact = an === qn ? 1 : 0, bExact = bn === qn ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    if (s.year) {
      const ay = Math.abs((parseInt((a.release_date || a.first_air_date || "0").slice(0, 4)) || 0) - s.year);
      const by = Math.abs((parseInt((b.release_date || b.first_air_date || "0").slice(0, 4)) || 0) - s.year);
      if (ay !== by) return ay - by;
    }
    return (b.vote_count || 0) - (a.vote_count || 0);
  });
  return tmdbResToItem(results[0], kind as "movie" | "tv");
}
function tmdbResToItem(r: any, type: "movie" | "tv"): CatalogItem | null {
  if (!r.poster_path) return null;
  const title = r.title || r.name || "";
  const year = parseInt((r.release_date || r.first_air_date || "0").slice(0, 4)) || 0;
  if (!title || year === 0) return null;
  const genres = (r.genre_ids || []).map((id: number) => TMDB_GENRES[id]).filter(Boolean);
  const vc = r.vote_count || 0;
  const score = r.vote_average && vc >= 20 ? Math.round(r.vote_average * 10) / 10 : 0;
  return {
    title, type, genre: [...new Set(genres)] as string[], vibes: deriveVibes(genres, r.vote_average), year,
    cover: `${TMDB_IMG}${r.poster_path}`, description: (r.overview || "").slice(0, 800), people: [],
    platforms: [], totalEp: type === "movie" ? 1 : 0, voteCount: vc,
    ext: score > 0 ? { tmdb: score } : {}, scores: score > 0 ? [{ source: "tmdb", score, maxScore: 10 }] : [], tmdbId: r.id,
  };
}

let igdbToken = "";
async function getIgdbToken(): Promise<string> {
  if (igdbToken) return igdbToken;
  const d = await jget(`https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`, { method: "POST" });
  igdbToken = d.access_token; return igdbToken;
}
async function searchIgdb(s: Seed): Promise<CatalogItem | null> {
  const token = await getIgdbToken();
  const FIELDS = `fields name,cover.image_id,summary,genres.name,first_release_date,total_rating,total_rating_count,aggregated_rating,aggregated_rating_count,involved_companies.company.name,involved_companies.developer,platforms,external_games.category,external_games.uid,category;`;
  // NOTE: IGDB `search` cannot be combined with `where category` — it returns
  // empty. Search broadly, map (igdbToItem filters out non-main categories /
  // editions → null), then prefer the exact-name main game.
  const res = await fetch(`https://api.igdb.com/v4/games`, {
    method: "POST", headers: { "Client-ID": IGDB_ID, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: `${FIELDS} search "${s.title}"; limit 15;`,
  });
  if (!res.ok) throw new Error(`IGDB ${res.status}`);
  const games: any[] = await res.json();
  const qn = nrm(s.title);
  const exactRaw = games.find((g) => nrm(g.name || "") === qn);
  const mapped = (exactRaw ? igdbToItem(exactRaw) : null) ?? games.map((g) => igdbToItem(g)).find((x) => x && nrm(x.title) === qn) ?? null;
  return mapped;
}
const IGDB_GENRES_MAP: Record<number, string> = { 2: "RPG", 5: "Shooter", 8: "Platform", 9: "Puzzle", 11: "Strategy", 12: "Simulation", 13: "Sports", 14: "Survival", 26: "Adventure", 31: "Indie", 35: "Open World" };
function igdbToItem(g: any): CatalogItem | null {
  if (!g.name || !g.cover?.image_id) return null;
  const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : 0;
  if (year === 0) return null;
  const genres = (g.genres || []).map((gn: any) => (typeof gn === "object" ? gn.name : IGDB_GENRES_MAP[gn]) || "").filter(Boolean).slice(0, 5) as string[];
  const platforms: string[] = [];
  for (const p of g.platforms || []) { const pid = typeof p === "number" ? p : p.id; if ([48, 167].includes(pid)) platforms.push("ps"); if ([49, 169].includes(pid)) platforms.push("xbox"); if (pid === 130) platforms.push("switch"); if ([6, 3, 14].includes(pid)) platforms.push("steam"); }
  let steamAppId: number | undefined;
  for (const eg of g.external_games || []) { if (eg.category === 1 && eg.uid) { const p = parseInt(eg.uid); if (!isNaN(p)) { steamAppId = p; break; } } }
  const igdbScore = g.total_rating ? Math.round(g.total_rating) : 0;
  const critics = g.aggregated_rating ? Math.round(g.aggregated_rating) : 0;
  const ext: Record<string, number> = {}; const scores: ExtScore[] = [];
  if (igdbScore) { ext.igdb = igdbScore; ext.igdb_count = g.total_rating_count || 0; scores.push({ source: "igdb", score: igdbScore, maxScore: 100 }); }
  if (critics) { ext.igdb_critics = critics; ext.igdb_critics_count = g.aggregated_rating_count || 0; scores.push({ source: "igdb_critics", score: critics, maxScore: 100, scoreType: "critics" }); }
  const people: Person[] = (g.involved_companies || []).filter((c: any) => c.company?.name).map((c: any) => ({ role: c.developer ? "Developer" : "Publisher", name: c.company.name })).slice(0, 3);
  return {
    title: g.name, type: "game", genre: [...new Set(genres)] as string[], vibes: deriveVibes(genres, igdbScore ? igdbScore / 10 : undefined), year,
    cover: `https://images.igdb.com/igdb/image/upload/t_720p/${g.cover.image_id}.jpg`, description: (g.summary || "").slice(0, 800),
    people, platforms: [...new Set(platforms)] as string[], totalEp: 0, voteCount: g.total_rating_count || 0, ext, scores, igdbId: g.id, steamAppId,
  };
}

const OL_BASE = "https://openlibrary.org";
async function searchOpenLibrary(s: Seed): Promise<CatalogItem | null> {
  // OpenLibrary search — keyless, no daily-quota wall (Google Books is capped at
  // 1,000/day and was exhausted). Same shaping as populate-catalog's olToItem.
  const FIELDS = "title,author_name,first_publish_year,number_of_pages_median,subject,cover_i,isbn,edition_count,ratings_average,ratings_count";
  const params = new URLSearchParams({ limit: "8", fields: FIELDS });
  if (s.q) params.set("q", s.q); // canonical-volume hint (e.g. series → book 1)
  else { params.set("title", s.title); if (s.author) params.set("author", s.author); }
  let data = await jget(`${OL_BASE}/search.json?${params}`);
  let docs: any[] = data.docs || [];
  if (docs.length === 0 && s.author && !s.q) { // retry without author constraint
    params.delete("author");
    data = await jget(`${OL_BASE}/search.json?${params}`);
    docs = data.docs || [];
  }
  const withCover = docs.filter((d) => d.cover_i && d.author_name?.[0]);
  // q-hint searches are precise (series → canonical volume): take top relevance.
  // Title searches: prefer a real title match, else top result.
  const qn = nrm(s.title);
  const pick = s.q ? withCover[0]
    : (withCover.find((d) => { const t = nrm(d.title || ""); return t === qn || t.startsWith(qn) || qn.startsWith(t); }) || withCover[0]);
  return pick ? olToItem(pick) : null;
}
function olToItem(doc: any): CatalogItem | null {
  if (!doc.title || !doc.author_name?.[0] || !doc.cover_i) return null;
  const year = doc.first_publish_year || 0;
  const genres = (doc.subject || []).filter(Boolean).slice(0, 5) as string[];
  const ol = doc.ratings_average ? Math.round(doc.ratings_average * 10) / 10 : 0;
  return {
    title: doc.title, type: "book", genre: genres, vibes: deriveVibes(genres, ol ? ol * 2 : undefined), year,
    cover: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`, description: "",
    people: (doc.author_name || []).slice(0, 3).map((a: string) => ({ role: "Author", name: a })),
    platforms: ["kindle"], totalEp: doc.number_of_pages_median || 0, voteCount: doc.ratings_count || doc.edition_count || 0,
    ext: ol > 0 ? { google_books: Math.min(ol * 2, 10) } : {}, scores: ol > 0 ? [{ source: "google_books", score: ol, maxScore: 5 }] : [],
  };
}

async function searchGoogleBooks(s: Seed): Promise<CatalogItem | null> {
  const q = s.q ? s.q : `intitle:${JSON.stringify(s.title)}${s.author ? `+inauthor:${JSON.stringify(s.author)}` : ""}`;
  const data = await jget(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books&key=${GBOOKS_KEY}`);
  const items: any[] = data.items || [];
  const withCover = items.filter((v) => v.volumeInfo?.imageLinks?.thumbnail || v.volumeInfo?.imageLinks?.smallThumbnail);
  if (withCover.length === 0) return null;
  const qn = nrm(s.title);
  const pick = withCover.find((v) => { const t = nrm(v.volumeInfo?.title || ""); return t === qn || t.startsWith(qn) || qn.startsWith(t); }) || withCover[0];
  return gBookToItem(pick, "Fiction");
}
function gBookToItem(vol: any, genreTag: string): CatalogItem | null {
  const info = vol.volumeInfo; if (!info?.title) return null;
  const thumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail; if (!thumb) return null;
  const cover = thumb.replace("zoom=1", "zoom=2").replace("&edge=curl", "").replace("http://", "https://");
  const year = parseInt((info.publishedDate || "0").slice(0, 4)) || 0;
  const cats = (info.categories || []).flatMap((c: string) => c.split(" / "));
  const genres = [...new Set([genreTag, ...cats])].filter(Boolean).slice(0, 5) as string[];
  const people: Person[] = [...(info.authors || []).map((a: string) => ({ role: "Author", name: a })), ...(info.publisher ? [{ role: "Publisher", name: info.publisher }] : [])].slice(0, 3);
  const gb = info.averageRating || 0;
  return {
    title: info.title, type: "book", genre: genres, vibes: deriveVibes(genres, gb ? gb * 2 : undefined), year, cover,
    description: (info.description || "").replace(/<[^>]*>/g, "").slice(0, 800), people, platforms: ["kindle", "audible"],
    totalEp: info.pageCount || 0, voteCount: info.ratingsCount || 0, ext: gb > 0 ? { google_books: Math.min(gb * 2, 10) } : {},
    scores: gb > 0 ? [{ source: "google_books", score: gb, maxScore: 5 }] : [], googleBooksId: vol.id,
  };
}

async function searchJikan(s: Seed): Promise<CatalogItem | null> {
  const data = await jget(`${JIKAN_BASE}/anime?q=${encodeURIComponent(s.title)}&limit=10`);
  const results: any[] = data.data || [];
  if (results.length === 0) return null;
  const qn = nrm(s.title);
  // Require a real title match across title / title_english / synonyms — do NOT
  // fall back to "most popular result", which grabs an unrelated show.
  const matches = (r: any): boolean => {
    const cands = [r.title, r.title_english, ...(r.titles || []).map((t: any) => t.title), ...(r.title_synonyms || [])]
      .filter(Boolean).map((t: string) => nrm(t));
    return cands.some((c) => c === qn || c.startsWith(qn) || qn.startsWith(c));
  };
  const pick = results.find(matches);
  return pick ? jikanToItem(pick, "tv") : null;
}
function jikanToItem(r: any, type: "tv" | "manga"): CatalogItem | null {
  if (!r.title) return null;
  const raw = r.images?.jpg?.large_image_url || r.images?.jpg?.image_url; if (!raw) return null;
  const cover = raw.replace("https://myanimelist.net/", "https://cdn.myanimelist.net/");
  const dateStr = type === "tv" ? r.aired?.from : r.published?.from;
  const year = dateStr ? new Date(dateStr).getFullYear() : 0;
  const base = [...(r.genres || []).map((g: any) => g.name), ...(r.demographics || []).map((d: any) => d.name)].slice(0, 5) as string[];
  const genres = ["Anime", ...base].slice(0, 5);
  const mal = r.score || 0;
  const people: Person[] = (r.studios || []).map((st: any) => ({ role: "Studio", name: st.name })).slice(0, 2);
  return {
    title: r.title_english || r.title, type, genre: genres, vibes: deriveVibes(genres, mal), year, cover,
    description: (r.synopsis || "").replace(/\[Written by MAL Rewrite\]/g, "").trim().slice(0, 800), people,
    platforms: ["crunchyroll", "funimation"], totalEp: r.episodes || 0, voteCount: r.scored_by || r.members || 0,
    ext: mal > 0 ? { mal } : {}, scores: mal > 0 ? [{ source: "mal", score: mal, maxScore: 10 }] : [], malId: r.mal_id, itemSubtype: "anime",
  };
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL! });
  const prisma = new PrismaClient({ adapter });

  // dedup sets
  const existingItems = await prisma.item.findMany({ select: { id: true, title: true, type: true, tmdbId: true, igdbId: true, malId: true, googleBooksId: true } });
  const tmdbIds = new Map(existingItems.filter((i) => i.tmdbId).map((i) => [i.tmdbId!, i]));
  const igdbIds = new Map(existingItems.filter((i) => i.igdbId).map((i) => [i.igdbId!, i]));
  const malIds = new Map(existingItems.filter((i) => i.malId).map((i) => [i.malId!, i]));
  const gbIds = new Map(existingItems.filter((i) => i.googleBooksId).map((i) => [i.googleBooksId!, i]));
  const titleType = new Map(existingItems.map((i) => [`${nrm(i.title)}|||${i.type}`, i]));

  const inserted: { seed: string; id: number; title: string; type: string; year: number }[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  // seed-title → catalog id, for BOTH inserts and already-present skips. Bridges
  // the corpus's series names to the catalog's canonical volume (e.g. "The Wheel
  // of Time" → "The Eye of the World"); consumed by the resolver in Step 3.
  const aliases: Record<string, number> = {};

  const sorted = [...SEEDS].sort((a, b) => b.act - a.act);
  for (const s of sorted) {
    let item: CatalogItem | null = null;
    try {
      if (s.type === "movie" || s.type === "tv") item = await searchTmdb(s);
      else if (s.type === "game") item = await searchIgdb(s);
      else if (s.type === "book") { item = await searchOpenLibrary(s); await sleep(300); /* OL courtesy spacing */ }
      else if (s.type === "anime") { item = await searchJikan(s); await sleep(700); /* Jikan rate limit */ }
    } catch (e: any) {
      console.log(`  ✗ [${s.type}] ${s.title} — search error: ${e.message}`);
      failed.push(`${s.title} (${s.type})`); continue;
    }
    if (!item) { console.log(`  ✗ [${s.type}] ${s.title} — NO MATCH`); failed.push(`${s.title} (${s.type})`); continue; }
    if (s.type === "book") await sleep(400); // ease Google Books burst limit

    // dedup — report which existing item caused the skip (provenance).
    // External-id checks are TYPE-SCOPED: TMDB movie and TV ids share the same
    // integer space, so a flat tmdbId check false-collides a TV show with an
    // unrelated movie. Only count an id hit if the existing item is the same type.
    const sameType = (it: typeof existingItems[number] | undefined) => (it && it.type === item.type ? it : undefined);
    const hit =
      (item.tmdbId ? sameType(tmdbIds.get(item.tmdbId)) : undefined) ||
      (item.igdbId ? sameType(igdbIds.get(item.igdbId)) : undefined) ||
      (item.malId ? sameType(malIds.get(item.malId)) : undefined) ||
      (item.googleBooksId ? sameType(gbIds.get(item.googleBooksId)) : undefined) ||
      titleType.get(`${nrm(item.title)}|||${item.type}`);
    const tag = `${s.title} → "${item.title}" (${item.type} ${item.year})`;
    if (hit) { console.log(`  ⊘ ${tag} — already present as #${hit.id} "${hit.title}" ${hit.type} (skip)`); skipped.push(s.title); aliases[`${nrm(s.title)}|${s.type}`] = hit.id; continue; }

    if (DRY) { console.log(`  ✓ ${tag}  [DRY]`); continue; }
    try {
      const created = await prisma.item.create({
        data: {
          title: item.title, type: item.type, genre: item.genre, vibes: item.vibes, year: item.year,
          cover: item.cover, description: item.description, people: item.people as any, awards: [] as any,
          platforms: item.platforms as any, ext: item.ext as any, totalEp: item.totalEp, voteCount: item.voteCount, isUpcoming: false,
          ...(item.tmdbId ? { tmdbId: item.tmdbId } : {}), ...(item.igdbId ? { igdbId: item.igdbId } : {}),
          ...(item.malId ? { malId: item.malId } : {}), ...(item.googleBooksId ? { googleBooksId: item.googleBooksId } : {}),
          ...(item.steamAppId ? { steamAppId: item.steamAppId } : {}), ...(item.itemSubtype ? { itemSubtype: item.itemSubtype } : {}),
        },
        select: { id: true },
      });
      for (const sc of item.scores) {
        await prisma.externalScore.upsert({
          where: { itemId_source: { itemId: created.id, source: sc.source } },
          update: { score: sc.score, maxScore: sc.maxScore, updatedAt: new Date() },
          create: { itemId: created.id, source: sc.source, score: sc.score, maxScore: sc.maxScore, scoreType: sc.scoreType ?? "community", label: "" },
        });
      }
      const mini = { id: created.id, title: item.title, type: item.type } as typeof existingItems[number];
      titleType.set(`${nrm(item.title)}|||${item.type}`, mini);
      if (item.tmdbId) tmdbIds.set(item.tmdbId, mini); if (item.igdbId) igdbIds.set(item.igdbId, mini);
      if (item.malId) malIds.set(item.malId, mini); if (item.googleBooksId) gbIds.set(item.googleBooksId, mini);
      inserted.push({ seed: s.title, id: created.id, title: item.title, type: item.type, year: item.year });
      aliases[`${nrm(s.title)}|${s.type}`] = created.id;
      console.log(`  ✓ ${tag} → #${created.id}`);
    } catch (e: any) {
      console.log(`  ✗ ${tag} — insert error: ${e.message}`);
      failed.push(`${s.title} (${s.type})`);
    }
  }

  console.log(`\n=== ${DRY ? "DRY RUN" : "INGEST"} SUMMARY ===`);
  console.log(`  inserted: ${inserted.length}   skipped(already present): ${skipped.length}   no-match/failed: ${failed.length}`);
  if (skipped.length) console.log(`  skipped: ${skipped.join(", ")}`);
  if (failed.length) console.log(`  NO MATCH / FAILED: ${failed.join(", ")}`);
  if (!DRY && inserted.length) {
    fs.writeFileSync("ingested-missing-ids.json", JSON.stringify(inserted, null, 1));
    console.log(`\n  captured ${inserted.length} inserted ids -> ingested-missing-ids.json (reversibility)`);
    console.log("  NEXT: npx tsx scripts/calculate-dimensions.ts");
  }
  if (!DRY) {
    fs.writeFileSync("ingested-seed-aliases.json", JSON.stringify(aliases, null, 1));
    console.log(`  wrote ${Object.keys(aliases).length} seed→id aliases -> ingested-seed-aliases.json (for the Step 3 resolver)`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
