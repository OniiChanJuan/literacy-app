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

/**
 * Inject the popularity signals that mapVolumeToItem doesn't set,
 * applied only on search-result paths so catalog ingestion via
 * getGoogleBookDetails stays untouched.
 *
 *   voteCount         = ratingsCount     (Google Books user-rating count)
 *   popularityScore   = ratingsCount     (highest-volume books rank up)
 *
 * ext.google_books needs no override here: mapVolumeToItem already writes it
 * on the canonical 0-10 scale (averageRating × 2).
 */
function enrichSearchResult(v: GoogleBookVolume): GoogleBookSearchResult {
  const item = mapVolumeToItem(v);
  const ratingsCount = v.volumeInfo.ratingsCount ?? 0;
  return {
    ...item,
    volumeId: v.id,
    voteCount: ratingsCount,
    popularityScore: ratingsCount,
  };
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

  return filtered.map(enrichSearchResult);
}

/** Search Google Books by author name using inauthor: qualifier */
export async function searchGoogleBooksByAuthor(authorName: string): Promise<GoogleBookSearchResult[]> {
  const res = await fetch(
    `${BASE}/volumes?q=${encodeURIComponent(`inauthor:${authorName}`)}&key=${apiKey()}&maxResults=15&printType=books&orderBy=relevance`
  );
  if (!res.ok) return [];
  const data = await res.json();

  const filtered = (data.items || []).filter((v: GoogleBookVolume) => {
    const title = (v.volumeInfo.title || "").toLowerCase();
    return !title.includes("movie tie-in") && !title.includes("study guide") && !title.includes("spark notes");
  });

  return filtered.map(enrichSearchResult);
}

/** Fetch a single Google Books volume by ID */
export async function getGoogleBookDetails(volumeId: string): Promise<Item | null> {
  const res = await fetch(`${BASE}/volumes/${volumeId}?key=${apiKey()}`);
  if (!res.ok) return null;
  const v: GoogleBookVolume = await res.json();
  return mapVolumeToItem(v);
}

/** Raw fields from an ISBN lookup, for catalog re-enrichment (not search). */
export interface GoogleBookIsbnResult {
  volumeId: string;
  title: string;
  categories: string[];
  description: string;
  pageCount: number;
  cover: string;
  averageRating?: number;
  ratingsCount?: number;
}

/**
 * `"QUOTA"` sentinel = Google Books quota/rate-limit hit (HTTP 429, or 403 with
 * a rate/quota reason). Callers MUST treat this differently from a genuine miss
 * so a quota wall doesn't get mistaken for "book not in Google Books" and skip
 * it forever. The search functions in this file collapse 429 → `[]`, which is
 * fine for graceful search degradation but wrong for catalog ingestion — hence
 * this dedicated ISBN lookup. (Surfacing 429 from the search functions too is a
 * filed follow-up; intentionally not changed here.)
 */
export type GoogleBookByIsbnOutcome = GoogleBookIsbnResult | null | "QUOTA";

/**
 * Look up a book by ISBN-13/10. Returns the volume's enrichable fields, `null`
 * for a genuine miss / malformed response, or `"QUOTA"` on rate-limit so the
 * caller can back off and resume rather than skip.
 */
export async function getGoogleBookByIsbn(isbn: string): Promise<GoogleBookByIsbnOutcome> {
  const clean = (isbn || "").replace(/[^0-9Xx]/g, "");
  if (!clean) return null;

  let res: Response;
  try {
    res = await fetch(
      `${BASE}/volumes?q=${encodeURIComponent(`isbn:${clean}`)}&key=${apiKey()}&maxResults=5&printType=books`
    );
  } catch {
    return null; // network blip — treat as miss; the run is resumable
  }

  if (res.status === 429) return "QUOTA";
  if (res.status === 403) {
    const body = await res.text().catch(() => "");
    return /rateLimitExceeded|dailyLimitExceeded|quotaExceeded|userRateLimitExceeded/i.test(body)
      ? "QUOTA"
      : null;
  }
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const v: GoogleBookVolume | undefined = data?.items?.[0];
  if (!v?.volumeInfo) return null;

  const info = v.volumeInfo;
  return {
    volumeId: v.id,
    title: info.title + (info.subtitle ? `: ${info.subtitle}` : ""),
    categories: mapCategories(info.categories),
    description: cleanDescription(stripHtml(info.description || ""), "book"),
    pageCount: info.pageCount || 0,
    cover: coverUrl(info.imageLinks),
    averageRating: info.averageRating,
    ratingsCount: info.ratingsCount,
  };
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
    // Canonical 0-10 scale (Google's 0-5 stars × 2); key must match ranking.ts priorities
    ext.google_books = Math.min(info.averageRating * 2, 10);
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
