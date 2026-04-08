import type { Item, Person, ExternalSource, MediaType } from "./data";

const BASE = "https://comicvine.gamespot.com/api";
const UA = "CrossShelf-App/1.0";

function apiKey(): string {
  return process.env.COMICVINE_API_KEY || "";
}

async function cvFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Genre derivation ────────────────────────────────────────────────────

function deriveGenres(name: string, publisher: string, deck: string): string[] {
  const genres: string[] = [];
  const text = `${name} ${deck}`.toLowerCase();

  if (text.includes("superhero") || text.includes("hero")) genres.push("Superhero");
  if (text.includes("horror") || text.includes("zombie") || text.includes("dark")) genres.push("Horror");
  if (text.includes("sci-fi") || text.includes("science fiction") || text.includes("space")) genres.push("Sci-Fi");
  if (text.includes("fantasy") || text.includes("magic")) genres.push("Fantasy");
  if (text.includes("romance") || text.includes("love")) genres.push("Romance");
  if (text.includes("mystery") || text.includes("detective")) genres.push("Mystery");
  if (text.includes("war")) genres.push("War");

  // Publisher-based defaults
  const pub = publisher.toLowerCase();
  if ((pub.includes("marvel") || pub.includes("dc")) && genres.length === 0) {
    genres.push("Superhero");
  }
  if (pub.includes("image") && genres.length === 0) genres.push("Sci-Fi");

  if (genres.length === 0) genres.push("Comics");
  return genres.slice(0, 4);
}

// ── Vibe derivation ─────────────────────────────────────────────────────

function deriveVibes(genres: string[], deck: string): string[] {
  const vibes: string[] = [];
  const g = new Set(genres.map((s) => s.toLowerCase()));
  const d = deck.toLowerCase();

  if (g.has("horror")) vibes.push("dark");
  if (g.has("superhero")) vibes.push("epic");
  if (g.has("sci-fi")) vibes.push("mind-bending");
  if (g.has("fantasy")) vibes.push("immersive");
  if (g.has("romance")) vibes.push("emotional");
  if (d.includes("gritty") || d.includes("violent")) vibes.push("intense");
  if (d.includes("award") || d.includes("classic")) vibes.push("thought-provoking");

  return vibes.length > 0 ? vibes.slice(0, 3) : ["stylish"];
}

// ── Comic Vine response types ───────────────────────────────────────────

interface CVVolume {
  id: number;
  name: string;
  start_year?: string;
  count_of_issues?: number;
  publisher?: { name: string };
  image?: { medium_url?: string; original_url?: string };
  deck?: string;
  description?: string;
  characters?: { name: string }[];
}

// ── Public API ──────────────────────────────────────────────────────────

export interface CVSearchResult extends Item {
  cvId: number;
}

/** Search Comic Vine for volumes (comic series) */
export async function searchComicVine(query: string): Promise<CVSearchResult[]> {
  const data = await cvFetch("/search/", {
    resources: "volume",
    query,
    limit: "15",
    field_list: "id,name,start_year,count_of_issues,publisher,image,deck",
  }) as { results: CVVolume[] } | null;

  if (!data?.results) return [];

  return data.results
    .filter((v) => v.image?.original_url || v.image?.medium_url)
    .map((v) => ({
      ...mapVolumeToItem(v),
      cvId: v.id,
    }));
}

/** Fetch full Comic Vine volume details */
export async function getComicVineDetails(volumeId: number): Promise<Item | null> {
  const data = await cvFetch(`/volume/4050-${volumeId}/`, {
    field_list: "id,name,start_year,count_of_issues,publisher,image,deck,description,characters",
  }) as { results: CVVolume } | null;

  if (!data?.results) return null;
  return mapVolumeToItem(data.results);
}

function mapVolumeToItem(v: CVVolume): Item {
  const publisher = v.publisher?.name || "";
  const deck = v.deck || "";
  const genres = deriveGenres(v.name, publisher, deck);
  const vibes = deriveVibes(genres, deck);
  const year = v.start_year ? parseInt(v.start_year) : 0;
  const cover = v.image?.original_url || v.image?.medium_url || "";

  const people: Person[] = [];
  if (publisher) people.push({ role: "Publisher", name: publisher });
  // Add notable characters
  if (v.characters) {
    for (const c of v.characters.slice(0, 3)) {
      people.push({ role: "Character", name: c.name });
    }
  }

  const desc = v.description
    ? stripHtml(v.description).slice(0, 500)
    : deck;

  return {
    id: v.id,
    title: v.name,
    type: "comic" as MediaType,
    genre: genres,
    vibes,
    year,
    cover,
    desc,
    people,
    awards: [],
    platforms: ["comixology"],
    ext: {} as Partial<Record<ExternalSource, number>>,
    totalEp: v.count_of_issues || 0,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim();
}

// ── Route ID helpers ────────────────────────────────────────────────────

export function cvItemId(cvId: number): string {
  return `cv-${cvId}`;
}

export function parseCvId(routeId: string): number | null {
  const match = routeId.match(/^cv-(\d+)$/);
  return match ? parseInt(match[1]) : null;
}
