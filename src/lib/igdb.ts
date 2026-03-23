import type { Item, Person, ExternalSource } from "./data";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_BASE = "https://api.igdb.com/v4";
const IMG_BASE = "https://images.igdb.com/igdb/image/upload";

// ── Token cache ─────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.IGDB_CLIENT_ID!;
  const clientSecret = process.env.IGDB_CLIENT_SECRET!;

  const res = await fetch(
    `${TWITCH_TOKEN_URL}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

async function igdbFetch(endpoint: string, body: string): Promise<unknown[]> {
  const token = await getAccessToken();
  const res = await fetch(`${IGDB_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": process.env.IGDB_CLIENT_ID!,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!res.ok) return [];
  return res.json();
}

// ── Cover URL helper ────────────────────────────────────────────────────

function coverUrl(imageId: string, size: "t_cover_big" | "t_720p" = "t_cover_big"): string {
  return `${IMG_BASE}/${size}/${imageId}.jpg`;
}

// ── Platform mapping ────────────────────────────────────────────────────

function mapPlatforms(platforms: { name: string }[]): string[] {
  const result: string[] = [];
  for (const p of platforms) {
    const n = p.name.toLowerCase();
    if (n.includes("pc") || n.includes("windows") || n.includes("mac") || n.includes("linux")) {
      if (!result.includes("steam")) result.push("steam");
    } else if (n.includes("playstation")) {
      if (!result.includes("ps")) result.push("ps");
    } else if (n.includes("xbox")) {
      if (!result.includes("xbox")) result.push("xbox");
    } else if (n.includes("switch")) {
      if (!result.includes("switch")) result.push("switch");
    }
  }
  return result;
}

// ── Genre mapping ───────────────────────────────────────────────────────

function mapGenres(genres: { name: string }[]): string[] {
  const map: Record<string, string> = {
    "role-playing (rpg)": "RPG",
    "hack and slash/beat 'em up": "Action",
    "shooter": "Action",
    "fighting": "Action",
    "adventure": "Adventure",
    "puzzle": "Puzzle",
    "strategy": "Strategy",
    "real time strategy (rts)": "Strategy",
    "turn-based strategy (tbs)": "Strategy",
    "simulator": "Simulation",
    "sport": "Sports",
    "racing": "Racing",
    "indie": "Indie",
    "platform": "Platformer",
    "visual novel": "Visual Novel",
    "point-and-click": "Adventure",
    "music": "Music",
    "arcade": "Arcade",
    "tactical": "Strategy",
    "card & board game": "Strategy",
    "moba": "MOBA",
    "quiz/trivia": "Puzzle",
    "pinball": "Arcade",
  };

  return genres.map((g) => {
    const lower = g.name.toLowerCase();
    return map[lower] || g.name;
  });
}

// ── Vibe derivation ─────────────────────────────────────────────────────

function deriveVibes(genres: string[], rating: number): string[] {
  const vibes: string[] = [];
  const g = new Set(genres.map((s) => s.toLowerCase()));

  if (g.has("rpg") || g.has("adventure")) vibes.push("immersive");
  if (g.has("action")) vibes.push("intense");
  if (g.has("indie") || g.has("platformer")) vibes.push("stylish");
  if (g.has("strategy")) vibes.push("cerebral");
  if (g.has("puzzle")) vibes.push("mind-bending");
  if (g.has("simulation")) vibes.push("atmospheric");
  if (rating >= 85) vibes.push("epic");
  if (rating >= 90) vibes.push("thought-provoking");

  return vibes.slice(0, 3);
}

// ── Public API ──────────────────────────────────────────────────────────

interface IgdbGame {
  id: number;
  name: string;
  cover?: { image_id: string };
  first_release_date?: number;
  genres?: { name: string }[];
  platforms?: { name: string }[];
  summary?: string;
  involved_companies?: {
    company: { name: string };
    developer: boolean;
    publisher: boolean;
  }[];
  total_rating?: number;
  total_rating_count?: number;
  external_games?: { category: number; uid: string }[];
}

const SEARCH_FIELDS = "fields name,cover.image_id,first_release_date,genres.name,platforms.name,summary,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,total_rating,total_rating_count;";

const DETAIL_FIELDS = "fields name,cover.image_id,first_release_date,genres.name,platforms.name,summary,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,total_rating,total_rating_count,external_games.category,external_games.uid;";

/** Search IGDB for games */
export async function searchIgdb(query: string): Promise<Item[]> {
  const results = await igdbFetch(
    "/games",
    `search "${query.replace(/"/g, "")}"; ${SEARCH_FIELDS} limit 15;`
  ) as IgdbGame[];

  return results.map(mapGameToItem);
}

/** Fetch full IGDB game details by ID, including Steam review score */
export async function getIgdbDetails(igdbId: number): Promise<Item | null> {
  const results = await igdbFetch(
    "/games",
    `where id = ${igdbId}; ${DETAIL_FIELDS} limit 1;`
  ) as IgdbGame[];

  if (results.length === 0) return null;
  const item = mapGameToItem(results[0]);

  // Try to get Steam review score
  const steamEntry = results[0].external_games?.find((e) => e.category === 1); // category 1 = Steam
  if (steamEntry?.uid) {
    const steamScore = await fetchSteamReviewScore(steamEntry.uid);
    if (steamScore !== null) {
      item.ext = { ...item.ext, steam: steamScore };
    }
  }

  return item;
}

/** Fetch Steam review percentage for a given Steam App ID */
async function fetchSteamReviewScore(steamAppId: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/appreviews/${steamAppId}?json=1&language=all&purchase_type=all`,
      { next: { revalidate: 86400 } } // cache for 24h
    );
    if (!res.ok) return null;
    const data = await res.json();
    const s = data.query_summary;
    if (!s || s.total_reviews === 0) return null;
    return Math.round((s.total_positive / s.total_reviews) * 100);
  } catch {
    return null;
  }
}

function mapGameToItem(g: IgdbGame): Item {
  const genres = g.genres ? mapGenres(g.genres) : [];
  const platforms = g.platforms ? mapPlatforms(g.platforms) : [];
  const year = g.first_release_date
    ? new Date(g.first_release_date * 1000).getFullYear()
    : 0;
  const cover = g.cover?.image_id
    ? coverUrl(g.cover.image_id)
    : "";

  // Extract people
  const people: Person[] = [];
  if (g.involved_companies) {
    const dev = g.involved_companies.find((c) => c.developer);
    const pub = g.involved_companies.find((c) => c.publisher && !c.developer);
    if (dev) people.push({ role: "Developer", name: dev.company.name });
    if (pub) people.push({ role: "Publisher", name: pub.company.name });
  }

  // External scores
  const ext: Partial<Record<ExternalSource, number>> = {};
  if (g.total_rating) {
    ext.ign = Math.round(g.total_rating) / 10; // Convert 0-100 to 0-10 scale
  }

  const vibes = deriveVibes(genres, g.total_rating || 0);

  return {
    id: g.id,
    title: g.name,
    type: "game",
    genre: genres,
    vibes,
    year,
    cover,
    desc: g.summary || "",
    people,
    awards: [],
    platforms,
    ext,
    totalEp: 0,
  };
}

/** Create an IGDB-specific route ID */
export function igdbItemId(igdbId: number): string {
  return `igdb-game-${igdbId}`;
}

/** Parse an IGDB route ID */
export function parseIgdbId(routeId: string): number | null {
  const match = routeId.match(/^igdb-game-(\d+)$/);
  return match ? parseInt(match[1]) : null;
}
