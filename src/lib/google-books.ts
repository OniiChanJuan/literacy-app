import type { Item, Person, ExternalSource } from "./data";
import { cleanDescription } from "./clean-description";

const BASE = "https://www.googleapis.com/books/v1";

function apiKey(): string {
  return process.env.GOOGLE_BOOKS_API_KEY || "";
}

// ── Cover URL helper ────────────────────────────────────────────────────

function coverUrl(imageLinks?: { thumbnail?: string; smallThumbnail?: string }): string {
  const url = imageLinks?.thumbnail || imageLinks?.smallThumbnail || "";
  if (!url) return "";
  // Upgrade to higher quality: remove edge=curl, set zoom=0 for largest size
  return url
    .replace("&edge=curl", "")
    .replace("zoom=1", "zoom=0")
    .replace("http://", "https://");
}

// ── Genre mapping ───────────────────────────────────────────────────────

function mapCategories(categories?: string[]): string[] {
  if (!categories) return [];
  const genres: string[] = [];
  for (const cat of categories) {
    // Google Books categories are like "Fiction / Science Fiction" or just "Fiction"
    const parts = cat.split(/\s*\/\s*/);
    for (const p of parts) {
      const trimmed = p.trim();
      if (trimmed && !genres.includes(trimmed)) genres.push(trimmed);
    }
  }
  return genres.slice(0, 4);
}

// ── Vibe derivation ─────────────────────────────────────────────────────

function deriveVibes(genres: string[], description: string): string[] {
  const vibes: string[] = [];
  const g = new Set(genres.map((s) => s.toLowerCase()));
  const d = description.toLowerCase();

  if (g.has("science fiction") || g.has("sci-fi")) vibes.push("mind-bending");
  if (g.has("fantasy")) vibes.push("epic");
  if (g.has("horror") || g.has("thriller")) vibes.push("dark");
  if (g.has("romance")) vibes.push("emotional");
  if (g.has("mystery")) vibes.push("atmospheric");
  if (g.has("biography") || g.has("history")) vibes.push("thought-provoking");
  if (g.has("humor") || g.has("comedy")) vibes.push("funny");
  if (d.includes("heartbreak") || d.includes("loss") || d.includes("grief")) vibes.push("heartbreaking");
  if (d.includes("beautiful") || d.includes("lyrical") || d.includes("prose")) vibes.push("immersive");

  return vibes.length > 0 ? vibes.slice(0, 3) : ["thought-provoking"];
}

// ── Platform mapping ────────────────────────────────────────────────────

function mapPlatforms(saleInfo?: { isEbook?: boolean }): string[] {
  const platforms = ["kindle", "library"];
  if (saleInfo?.isEbook) platforms.unshift("audible");
  return platforms;
}

// ── Public types ────────────────────────────────────────────────────────

interface GoogleBookVolume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type: string; identifier: string }[];
    averageRating?: number;
    ratingsCount?: number;
  };
  saleInfo?: {
    isEbook?: boolean;
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/** Search result with volume ID preserved for routing */
export interface GoogleBookSearchResult extends Item {
  volumeId: string;
}

/** Search Google Books */
export async function searchGoogleBooks(query: string): Promise<GoogleBookSearchResult[]> {
  const res = await fetch(
    `${BASE}/volumes?q=${encodeURIComponent(query)}&key=${apiKey()}&maxResults=15&printType=books&langRestrict=en`
  );
  if (!res.ok) return [];
  const data = await res.json();

  // Filter out movie tie-in editions and study guides
  const filtered = (data.items || []).filter((v: GoogleBookVolume) => {
    const title = (v.volumeInfo.title || "").toLowerCase();
    return !title.includes("movie tie-in") && !title.includes("study guide") && !title.includes("spark notes");
  });

  return filtered.map((v: GoogleBookVolume) => ({
    ...mapVolumeToItem(v),
    volumeId: v.id,
  }));
}

/** Fetch a single Google Books volume by ID */
export async function getGoogleBookDetails(volumeId: string): Promise<Item | null> {
  const res = await fetch(`${BASE}/volumes/${volumeId}?key=${apiKey()}`);
  if (!res.ok) return null;
  const v: GoogleBookVolume = await res.json();
  return mapVolumeToItem(v);
}

function mapVolumeToItem(v: GoogleBookVolume): Item {
  const info = v.volumeInfo;
  const year = info.publishedDate
    ? parseInt(info.publishedDate.split("-")[0])
    : 0;
  const cover = coverUrl(info.imageLinks);
  const genres = mapCategories(info.categories);
  const description = info.description || "";
  const vibes = deriveVibes(genres, description);

  // People
  const people: Person[] = [];
  if (info.authors) {
    for (const a of info.authors) {
      people.push({ role: "Author", name: a });
    }
  }
  if (info.publisher) {
    people.push({ role: "Publisher", name: info.publisher });
  }

  // External scores
  const ext: Partial<Record<ExternalSource, number>> = {};
  if (info.averageRating) {
    ext.goodreads = info.averageRating; // Google Books uses same 0-5 scale
  }

  // Page count as totalEp
  const totalEp = info.pageCount || 0;

  // Platforms
  const platforms = mapPlatforms(v.saleInfo);

  return {
    id: hashStringToNumber(v.id),
    title: info.title + (info.subtitle ? `: ${info.subtitle}` : ""),
    type: "book",
    genre: genres,
    vibes,
    year,
    cover,
    desc: cleanDescription(stripHtml(description), "book"),
    people,
    awards: [],
    platforms,
    ext,
    totalEp,
  };
}

/** Strip HTML tags from description */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim();
}

/** Convert Google Books volume ID (string) to a stable numeric ID */
function hashStringToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Create a Google Books route ID */
export function gbookItemId(volumeId: string): string {
  return `gbook-${volumeId}`;
}

/** Parse a Google Books route ID */
export function parseGbookId(routeId: string): string | null {
  const match = routeId.match(/^gbook-(.+)$/);
  return match ? match[1] : null;
}
