import type { Item, Person, ExternalSource, MediaType } from "./data";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

// ── Token cache ─────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken!;
}

async function spotifyFetch(path: string): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Genre mapping ───────────────────────────────────────────────────────

function mapGenres(spotifyGenres: string[]): string[] {
  const genreMap: Record<string, string> = {
    "art rock": "Alternative",
    "alternative rock": "Alternative",
    "indie rock": "Indie",
    "indie pop": "Indie",
    "hip hop": "Hip-Hop",
    "rap": "Hip-Hop",
    "pop": "Pop",
    "r&b": "R&B",
    "soul": "Soul",
    "jazz": "Jazz",
    "classical": "Classical",
    "electronic": "Electronic",
    "edm": "Electronic",
    "rock": "Rock",
    "metal": "Metal",
    "punk": "Punk",
    "country": "Country",
    "folk": "Folk",
    "blues": "Blues",
    "latin": "Latin",
    "reggae": "Reggae",
    "k-pop": "K-Pop",
    "j-pop": "J-Pop",
  };

  const mapped: string[] = [];
  for (const g of (spotifyGenres || [])) {
    if (!g) continue;
    const lower = g.toLowerCase();
    const match = Object.entries(genreMap).find(([key]) => lower.includes(key));
    const genre = match ? match[1] : g.split(" ").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    if (genre && !mapped.includes(genre)) mapped.push(genre);
  }
  return mapped.slice(0, 4);
}

// ── Vibe derivation ─────────────────────────────────────────────────────

function deriveVibesMusic(genres: string[]): string[] {
  const vibes: string[] = [];
  const g = new Set(genres.map((s) => s.toLowerCase()));

  if (g.has("alternative") || g.has("indie")) vibes.push("atmospheric");
  if (g.has("hip-hop") || g.has("rap")) vibes.push("intense");
  if (g.has("r&b") || g.has("soul")) vibes.push("emotional");
  if (g.has("electronic")) vibes.push("immersive");
  if (g.has("jazz") || g.has("classical")) vibes.push("cerebral");
  if (g.has("rock") || g.has("metal")) vibes.push("intense");
  if (g.has("folk") || g.has("country")) vibes.push("heartfelt");
  if (g.has("pop")) vibes.push("uplifting");

  return vibes.length > 0 ? vibes.slice(0, 3) : ["thought-provoking"];
}

function deriveVibesPodcast(description: string): string[] {
  const d = (description || "").toLowerCase();
  const vibes: string[] = [];

  if (d.includes("tech") || d.includes("science") || d.includes("ai")) vibes.push("cerebral");
  if (d.includes("true crime") || d.includes("murder") || d.includes("mystery")) vibes.push("dark");
  if (d.includes("comedy") || d.includes("funny") || d.includes("humor")) vibes.push("funny");
  if (d.includes("history") || d.includes("culture")) vibes.push("thought-provoking");
  if (d.includes("interview") || d.includes("conversation")) vibes.push("thought-provoking");
  if (d.includes("story") || d.includes("narrative")) vibes.push("immersive");

  return vibes.length > 0 ? vibes.slice(0, 3) : ["thought-provoking"];
}

// ── Spotify response types ──────────────────────────────────────────────

interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

interface SpotifyAlbum {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  release_date: string;
  total_tracks: number;
  images: SpotifyImage[];
  album_type: string;
  label?: string;
}

interface SpotifyShow {
  id: string;
  name: string;
  publisher: string;
  description: string;
  total_episodes: number;
  images: SpotifyImage[];
}

interface SpotifyArtist {
  genres: string[];
  popularity: number;
}

// ── Public API ──────────────────────────────────────────────────────────

export interface SpotifySearchResult extends Item {
  spotifyId: string;
  spotifyType: "album" | "show";
}

/** Search Spotify for albums and podcasts */
export async function searchSpotify(query: string): Promise<SpotifySearchResult[]> {
  const data = await spotifyFetch(
    `/search?q=${encodeURIComponent(query)}&type=album,show&limit=10&market=US`
  ) as { albums?: { items: SpotifyAlbum[] }; shows?: { items: SpotifyShow[] } } | null;

  if (!data) return [];

  const results: SpotifySearchResult[] = [];

  // Albums
  for (const album of (data.albums?.items || [])) {
    results.push({
      ...mapAlbumToItem(album, []),
      spotifyId: album.id,
      spotifyType: "album",
    });
  }

  // Podcasts
  for (const show of (data.shows?.items || [])) {
    results.push({
      ...mapShowToItem(show),
      spotifyId: show.id,
      spotifyType: "show",
    });
  }

  return results;
}

/** Fetch full Spotify album details */
export async function getSpotifyAlbumDetails(albumId: string): Promise<Item | null> {
  const album = await spotifyFetch(`/albums/${albumId}`) as SpotifyAlbum | null;
  if (!album) return null;

  // Get artist genres
  let artistGenres: string[] = [];
  if (album.artists[0]?.id) {
    const artist = await spotifyFetch(`/artists/${album.artists[0].id}`) as SpotifyArtist | null;
    if (artist) artistGenres = artist.genres || [];
  }

  return mapAlbumToItem(album, artistGenres);
}

/** Fetch full Spotify podcast details */
export async function getSpotifyShowDetails(showId: string): Promise<Item | null> {
  const show = await spotifyFetch(`/shows/${showId}?market=US`) as SpotifyShow | null;
  if (!show) return null;
  return mapShowToItem(show);
}

// ── Mappers ─────────────────────────────────────────────────────────────

function mapAlbumToItem(album: SpotifyAlbum, artistGenres: string[]): Item {
  const year = parseInt((album.release_date || "0").split("-")[0]) || 0;
  const cover = album.images[0]?.url || "";
  const genres = mapGenres(artistGenres);
  const vibes = deriveVibesMusic(genres);

  const people: Person[] = album.artists.map((a) => ({ role: "Artist", name: a.name }));
  if (album.label) {
    people.push({ role: "Label", name: album.label });
  }

  return {
    id: hashString(album.id),
    title: album.name,
    type: "music" as MediaType,
    genre: genres.length > 0 ? genres : ["Music"],
    vibes,
    year,
    cover,
    desc: `${album.name} by ${album.artists.map((a) => a.name).join(", ")}. Released ${album.release_date}. ${album.total_tracks} tracks.`,
    people,
    awards: [],
    platforms: ["spotify", "apple_music"],
    ext: {} as Partial<Record<ExternalSource, number>>,
    totalEp: album.total_tracks,
  };
}

function mapShowToItem(show: SpotifyShow): Item {
  const vibes = deriveVibesPodcast(show.description);

  const people: Person[] = [{ role: "Host", name: show.publisher }];

  // Derive genres from description
  const d = show.description.toLowerCase();
  const genres: string[] = [];
  if (d.includes("tech") || d.includes("ai") || d.includes("software")) genres.push("Technology");
  if (d.includes("science")) genres.push("Science");
  if (d.includes("history")) genres.push("History");
  if (d.includes("true crime") || d.includes("crime")) genres.push("True Crime");
  if (d.includes("comedy") || d.includes("funny")) genres.push("Comedy");
  if (d.includes("business") || d.includes("entrepreneur")) genres.push("Business");
  if (d.includes("health") || d.includes("fitness")) genres.push("Health");
  if (d.includes("news") || d.includes("politic")) genres.push("News");
  if (genres.length === 0) genres.push("Talk");

  return {
    id: hashString(show.id),
    title: show.name,
    type: "podcast" as MediaType,
    genre: genres.slice(0, 3),
    vibes,
    year: 0,
    cover: show.images[0]?.url || "",
    desc: show.description,
    people,
    awards: [],
    platforms: ["spotify", "apple_pod"],
    ext: {} as Partial<Record<ExternalSource, number>>,
    totalEp: show.total_episodes,
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ── Route ID helpers ────────────────────────────────────────────────────

export function spotifyItemId(type: "album" | "show", spotifyId: string): string {
  return `spotify-${type}-${spotifyId}`;
}

export function parseSpotifyId(routeId: string): { type: "album" | "show"; spotifyId: string } | null {
  const match = routeId.match(/^spotify-(album|show)-(.+)$/);
  if (!match) return null;
  return { type: match[1] as "album" | "show", spotifyId: match[2] };
}
