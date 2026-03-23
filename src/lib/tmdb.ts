import type { Item, MediaType, ExternalSource, Person } from "./data";

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

function apiKey(): string {
  return process.env.TMDB_API_KEY || "";
}

function url(path: string, params: Record<string, string> = {}): string {
  const u = new URL(`${BASE}${path}`);
  u.searchParams.set("api_key", apiKey());
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

// ── Genre mappings ──────────────────────────────────────────────────────

const TMDB_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
  // TV genres
  10759: "Action", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi", 10766: "Soap", 10767: "Talk", 10768: "War",
};

// ── Public API ──────────────────────────────────────────────────────────

export interface TmdbSearchResult {
  id: number;
  title?: string;       // movies
  name?: string;        // tv
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date?: string; // movies
  first_air_date?: string; // tv
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  media_type?: string;
}

/** Search TMDB for movies and TV shows */
export async function searchTmdb(query: string): Promise<Item[]> {
  const res = await fetch(url("/search/multi", { query, include_adult: "false" }));
  if (!res.ok) return [];
  const data = await res.json();

  return (data.results || [])
    .filter((r: TmdbSearchResult) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 20)
    .map((r: TmdbSearchResult) => mapSearchResult(r));
}

/** Fetch full TMDB details for a movie or TV show */
export async function getTmdbDetails(type: "movie" | "tv", tmdbId: number): Promise<Item | null> {
  const detailRes = await fetch(url(`/${type}/${tmdbId}`, { append_to_response: "credits,watch/providers" }));
  if (!detailRes.ok) return null;
  const d = await detailRes.json();

  const isMovie = type === "movie";
  const title = isMovie ? d.title : d.name;
  const year = parseInt((isMovie ? d.release_date : d.first_air_date)?.split("-")[0] || "0");
  const poster = d.poster_path ? `${IMG}/w500${d.poster_path}` : "";

  // Map genres
  const genres = (d.genres || []).map((g: { id: number; name: string }) => g.name);

  // Map people (director + top 5 cast for movies, creator + top 5 for TV)
  const people: Person[] = [];
  if (isMovie && d.credits?.crew) {
    const director = d.credits.crew.find((c: { job: string; name: string }) => c.job === "Director");
    if (director) people.push({ role: "Director", name: director.name });
  } else if (!isMovie && d.created_by?.length) {
    people.push({ role: "Creator", name: d.created_by[0].name });
  }
  if (d.credits?.cast) {
    for (const c of d.credits.cast.slice(0, 5)) {
      people.push({ role: "Star", name: c.name });
    }
  }

  // External scores
  const ext: Partial<Record<ExternalSource, number>> = {};
  if (d.vote_average > 0) ext.imdb = Math.round(d.vote_average * 10) / 10;

  // Platforms from watch providers (US region)
  const platforms: string[] = [];
  const providers = d["watch/providers"]?.results?.US;
  if (providers?.flatrate) {
    for (const p of providers.flatrate.slice(0, 4)) {
      const key = mapProviderName(p.provider_name);
      if (key) platforms.push(key);
    }
  }

  // Total episodes for TV
  const totalEp = isMovie ? 1 : (d.number_of_episodes || 0);

  // Vibes (derive from genres as a rough heuristic)
  const vibes = deriveVibes(genres, d.vote_average);

  return {
    id: tmdbId,
    title,
    type,
    genre: genres,
    vibes,
    year,
    cover: poster,
    desc: d.overview || "",
    people,
    awards: [],
    platforms,
    ext,
    totalEp,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function mapSearchResult(r: TmdbSearchResult): Item {
  const isMovie = r.media_type === "movie";
  const type: MediaType = isMovie ? "movie" : "tv";
  const title = isMovie ? r.title! : r.name!;
  const dateStr = isMovie ? r.release_date : r.first_air_date;
  const year = parseInt(dateStr?.split("-")[0] || "0");
  const poster = r.poster_path ? `${IMG}/w500${r.poster_path}` : "";
  const genres = r.genre_ids.map((id) => TMDB_GENRES[id]).filter(Boolean);

  const ext: Partial<Record<ExternalSource, number>> = {};
  if (r.vote_average > 0) ext.imdb = Math.round(r.vote_average * 10) / 10;

  return {
    id: r.id,
    title,
    type,
    genre: genres,
    vibes: [],
    year,
    cover: poster,
    desc: r.overview || "",
    people: [],
    awards: [],
    platforms: [],
    ext,
    totalEp: isMovie ? 1 : 0,
  };
}

function mapProviderName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("netflix")) return "netflix";
  if (lower.includes("amazon") || lower.includes("prime")) return "prime";
  if (lower.includes("hbo") || lower.includes("max")) return "hbo";
  if (lower.includes("hulu")) return "hulu";
  if (lower.includes("apple")) return "apple";
  if (lower.includes("disney")) return "disney";
  return null;
}

function deriveVibes(genres: string[], rating: number): string[] {
  const vibes: string[] = [];
  const g = new Set(genres.map((s) => s.toLowerCase()));

  if (g.has("horror")) vibes.push("dark");
  if (g.has("thriller")) vibes.push("intense");
  if (g.has("comedy")) vibes.push("funny");
  if (g.has("romance")) vibes.push("emotional");
  if (g.has("sci-fi") || g.has("science fiction")) vibes.push("mind-bending");
  if (g.has("drama")) vibes.push("thought-provoking");
  if (g.has("adventure") || g.has("fantasy")) vibes.push("epic");
  if (g.has("animation")) vibes.push("stylish");
  if (g.has("documentary")) vibes.push("cerebral");
  if (rating >= 8) vibes.push("immersive");

  return vibes.slice(0, 3);
}

/** Create a TMDB-specific route ID (e.g., "tmdb-movie-12345") */
export function tmdbItemId(type: "movie" | "tv", tmdbId: number): string {
  return `tmdb-${type}-${tmdbId}`;
}

/** Parse a TMDB route ID back to type + tmdbId */
export function parseTmdbId(routeId: string): { type: "movie" | "tv"; tmdbId: number } | null {
  const match = routeId.match(/^tmdb-(movie|tv)-(\d+)$/);
  if (!match) return null;
  return { type: match[1] as "movie" | "tv", tmdbId: parseInt(match[2]) };
}
