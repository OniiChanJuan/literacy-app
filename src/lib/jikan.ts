import type { Item, Person, ExternalSource, MediaType } from "./data";

const BASE = "https://api.jikan.moe/v4";

// ── Rate limiting (Jikan allows ~3 req/sec) ─────────────────────────────
let lastRequest = 0;
async function jikanFetch(path: string): Promise<unknown> {
  const now = Date.now();
  const wait = Math.max(0, 350 - (now - lastRequest));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) return null;
  return res.json();
}

// ── Genre mapping ───────────────────────────────────────────────────────

function mapGenres(genres: { name: string }[], demographics?: { name: string }[]): string[] {
  const all = [...(genres || []), ...(demographics || [])];
  return all
    .map((g) => g.name)
    .filter((g) => g !== "Award Winning") // not a useful genre tag
    .slice(0, 5);
}

// ── Vibe derivation ─────────────────────────────────────────────────────

function deriveVibes(genres: string[], score: number): string[] {
  const vibes: string[] = [];
  const g = new Set(genres.map((s) => s.toLowerCase()));

  if (g.has("horror") || g.has("suspense")) vibes.push("dark");
  if (g.has("action")) vibes.push("intense");
  if (g.has("comedy")) vibes.push("funny");
  if (g.has("romance") || g.has("drama")) vibes.push("emotional");
  if (g.has("fantasy") || g.has("adventure")) vibes.push("epic");
  if (g.has("mystery") || g.has("psychological")) vibes.push("mind-bending");
  if (g.has("sci-fi")) vibes.push("thought-provoking");
  if (g.has("slice of life")) vibes.push("wholesome");
  if (g.has("sports")) vibes.push("uplifting");
  if (score >= 8.5) vibes.push("immersive");

  return vibes.length > 0 ? vibes.slice(0, 3) : ["atmospheric"];
}

// ── Jikan response types ────────────────────────────────────────────────

interface JikanManga {
  mal_id: number;
  title: string;
  title_english?: string;
  images: { jpg: { large_image_url: string } };
  authors?: { name: string }[];
  published?: { string: string; from?: string };
  chapters?: number | null;
  volumes?: number | null;
  genres?: { name: string }[];
  demographics?: { name: string }[];
  score?: number;
  status?: string;
  synopsis?: string;
}

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string;
  images: { jpg: { large_image_url: string } };
  studios?: { name: string }[];
  aired?: { string: string; from?: string };
  episodes?: number | null;
  genres?: { name: string }[];
  demographics?: { name: string }[];
  score?: number;
  status?: string;
  synopsis?: string;
  type?: string;
  source?: string;
}

// ── Public API ──────────────────────────────────────────────────────────

export interface JikanSearchResult extends Item {
  malId: number;
  jikanType: "manga" | "anime";
}

/** Search Jikan for manga */
export async function searchJikanManga(query: string): Promise<JikanSearchResult[]> {
  const data = await jikanFetch(`/manga?q=${encodeURIComponent(query)}&limit=10&sfw=true`) as { data: JikanManga[] } | null;
  if (!data?.data) return [];

  return data.data.map((m) => ({
    ...mapMangaToItem(m),
    malId: m.mal_id,
    jikanType: "manga" as const,
  }));
}

/** Search Jikan for anime */
export async function searchJikanAnime(query: string): Promise<JikanSearchResult[]> {
  const data = await jikanFetch(`/anime?q=${encodeURIComponent(query)}&limit=10&sfw=true`) as { data: JikanAnime[] } | null;
  if (!data?.data) return [];

  return data.data.map((a) => ({
    ...mapAnimeToItem(a),
    malId: a.mal_id,
    jikanType: "anime" as const,
  }));
}

/** Fetch full manga details by MAL ID */
export async function getJikanMangaDetails(malId: number): Promise<Item | null> {
  const data = await jikanFetch(`/manga/${malId}/full`) as { data: JikanManga } | null;
  if (!data?.data) return null;
  return mapMangaToItem(data.data);
}

/** Fetch full anime details by MAL ID */
export async function getJikanAnimeDetails(malId: number): Promise<Item | null> {
  const data = await jikanFetch(`/anime/${malId}/full`) as { data: JikanAnime } | null;
  if (!data?.data) return null;
  return mapAnimeToItem(data.data);
}

// ── Mappers ─────────────────────────────────────────────────────────────

function mapMangaToItem(m: JikanManga): Item {
  const title = m.title_english || m.title;
  const year = m.published?.from ? parseInt(m.published.from.split("-")[0]) : 0;
  const cover = m.images.jpg.large_image_url || "";
  const genres = mapGenres(m.genres || [], m.demographics);
  const vibes = deriveVibes(genres, m.score || 0);

  const people: Person[] = (m.authors || []).map((a) => ({
    role: "Author",
    name: a.name.split(", ").reverse().join(" "), // "Last, First" → "First Last"
  }));

  const ext: Partial<Record<ExternalSource, number>> = {};
  if (m.score) ext.mal = m.score;

  return {
    id: m.mal_id,
    title,
    type: "manga" as MediaType,
    genre: genres,
    vibes,
    year,
    cover,
    desc: m.synopsis || "",
    people,
    awards: [],
    platforms: ["mangaplus", "viz"],
    ext,
    totalEp: m.chapters || m.volumes || 0,
  };
}

function mapAnimeToItem(a: JikanAnime): Item {
  const title = a.title_english || a.title;
  const year = a.aired?.from ? parseInt(a.aired.from.split("-")[0]) : 0;
  const cover = a.images.jpg.large_image_url || "";
  const rawGenres = mapGenres(a.genres || [], a.demographics);
  // Add "Anime" tag so users can filter for it
  const genres = rawGenres.includes("Anime") ? rawGenres : ["Anime", ...rawGenres];
  const vibes = deriveVibes(rawGenres, a.score || 0);

  const people: Person[] = (a.studios || []).map((s) => ({
    role: "Studio",
    name: s.name,
  }));

  const ext: Partial<Record<ExternalSource, number>> = {};
  if (a.score) ext.mal = a.score;

  return {
    id: a.mal_id,
    title,
    type: "tv" as MediaType, // Anime classified as TV
    genre: genres,
    vibes,
    year,
    cover,
    desc: a.synopsis || "",
    people,
    awards: [],
    platforms: [],
    ext,
    totalEp: a.episodes || 0,
    // Mark as anime in a way the system can detect
  };
}

// ── Route ID helpers ────────────────────────────────────────────────────

export function jikanItemId(type: "manga" | "anime", malId: number): string {
  return `jikan-${type}-${malId}`;
}

export function parseJikanId(routeId: string): { type: "manga" | "anime"; malId: number } | null {
  const match = routeId.match(/^jikan-(manga|anime)-(\d+)$/);
  if (!match) return null;
  return { type: match[1] as "manga" | "anime", malId: parseInt(match[2]) };
}

/** Check if a TMDB TV result is likely anime (should be skipped in favor of Jikan) */
export function isLikelyAnime(title: string, genreIds: number[], originCountry?: string[]): boolean {
  // TMDB genre ID 16 = Animation
  const isAnimation = genreIds.includes(16);
  const isJapanese = originCountry?.includes("JP") || false;

  // Check title for common anime patterns
  const lowerTitle = title.toLowerCase();
  const animeKeywords = ["no ", " no ", "shingeki", "kimetsu", "jujutsu", "boku no", "ore no"];
  const hasAnimeTitle = animeKeywords.some((k) => lowerTitle.includes(k));

  return (isAnimation && isJapanese) || hasAnimeTitle;
}
