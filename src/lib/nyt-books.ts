/**
 * nyt-books.ts — New York Times Books API wrapper (Bestseller lists).
 *
 * Fetch-only. This wrapper knows nothing about the CrossShelf `items` schema;
 * translating NYT book objects into catalog rows is the populate script's job
 * (scripts/populate-from-nyt-bestsellers.ts). It is also NOT wired into the
 * search fan-out — NYT is a catalog *seed* source, not a search source.
 *
 * API docs: https://developer.nytimes.com/docs/books-product/1/overview
 *   Base:  https://api.nytimes.com/svc/books/v3
 *   Auth:  ?api-key=<NYT_BOOKS_API_KEY> on every request
 *   Limits: 5 requests/minute, 500 requests/day (free tier)
 *   Backfill: 2017-01-01 to present (older "coming soon", not yet live)
 *
 * Throttling is enforced in-module: every request waits until at least
 * MIN_GAP_MS has elapsed since the previous one (13s → comfortably < 5/min),
 * and a per-process counter aborts once DAILY_BUDGET requests are spent.
 * 429s get exponential backoff (2s/4s/8s, 3 tries) then resolve to null so a
 * long history walk degrades gracefully instead of crashing.
 */

const BASE = "https://api.nytimes.com/svc/books/v3";
const USER_AGENT = "CrossShelf/1.0 (hello@crossshelf.app)";

/** ~4.6 req/min — safely under the 5/min cap. */
const MIN_GAP_MS = 13_000;
/** Per-process safety stop, below the 500/day account cap. */
const DAILY_BUDGET = 480;

// ── Module-level throttle state ──────────────────────────────────────────
let lastRequestAt = 0;
let requestsThisRun = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function apiKey(): string {
  const key = process.env.NYT_BOOKS_API_KEY;
  if (!key) {
    throw new Error(
      "NYT_BOOKS_API_KEY is not set. Add it to .env.local (and Vercel) before using the NYT Books wrapper."
    );
  }
  return key;
}

/** How many NYT requests this process has spent (for run-summary logging). */
export function nytRequestCount(): number {
  return requestsThisRun;
}

/**
 * Core throttled fetch. Spaces calls ≥ MIN_GAP_MS apart, enforces the daily
 * budget, retries 429s with exponential backoff, and parses JSON.
 *
 * Returns the parsed body typed as T, or null if the request ultimately fails
 * (429-exhausted, network error, or non-OK status other than 404). A 404 also
 * returns null — used by the populate script to detect "date before backfill".
 */
async function nytFetch<T>(path: string): Promise<T | null> {
  if (requestsThisRun >= DAILY_BUDGET) {
    throw new Error(
      `NYT daily request budget (${DAILY_BUDGET}) exhausted this run — stopping to avoid hitting the 500/day cap.`
    );
  }

  // Space requests out to respect 5/min.
  const since = Date.now() - lastRequestAt;
  if (lastRequestAt !== 0 && since < MIN_GAP_MS) {
    await sleep(MIN_GAP_MS - since);
  }

  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}api-key=${apiKey()}`;

  const backoffs = [2_000, 4_000, 8_000];
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    lastRequestAt = Date.now();
    requestsThisRun++;

    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    } catch (err) {
      // Network error — treat like a retryable failure.
      if (attempt < backoffs.length) {
        console.warn(`  [nyt] network error (${(err as Error).message}); retry in ${backoffs[attempt] / 1000}s`);
        await sleep(backoffs[attempt]);
        continue;
      }
      console.warn(`  [nyt] network error, giving up on ${path}: ${(err as Error).message}`);
      return null;
    }

    if (res.status === 429) {
      if (attempt < backoffs.length) {
        console.warn(`  [nyt] 429 rate-limited; backing off ${backoffs[attempt] / 1000}s (attempt ${attempt + 1}/${backoffs.length})`);
        await sleep(backoffs[attempt]);
        continue;
      }
      console.warn(`  [nyt] 429 after ${backoffs.length} retries; skipping ${path}`);
      return null;
    }

    if (res.status === 404) {
      // Date outside the available backfill window, or unknown list.
      return null;
    }

    if (!res.ok) {
      console.warn(`  [nyt] HTTP ${res.status} for ${path}; skipping`);
      return null;
    }

    try {
      return (await res.json()) as T;
    } catch (err) {
      console.warn(`  [nyt] JSON parse failed for ${path}: ${(err as Error).message}`);
      return null;
    }
  }

  return null;
}

// ── Response types (match the actual NYT Books v3 API shape) ──────────────

/** A single book entry as it appears inside an overview list's `books` array. */
export interface NytBook {
  rank: number;
  rank_last_week: number;
  weeks_on_list: number;
  primary_isbn13: string;
  primary_isbn10: string;
  publisher: string;
  description: string;
  title: string;
  author: string;
  contributor: string;
  contributor_note: string;
  book_image: string;
  book_image_width?: number;
  book_image_height?: number;
  amazon_product_url: string;
  age_group: string;
  price?: string;
  book_uri?: string;
}

/** One bestseller list within an overview response. */
export interface NytOverviewList {
  list_id: number;
  list_name: string;
  list_name_encoded: string;
  display_name: string;
  updated: string;
  list_image?: string | null;
  books: NytBook[];
}

export interface NytOverviewResults {
  bestsellers_date: string;
  /** Print publication date for this overview (YYYY-MM-DD). */
  published_date: string;
  published_date_description: string;
  /** Chain backwards through history using this. Empty string at the boundary. */
  previous_published_date: string;
  next_published_date: string;
  lists: NytOverviewList[];
}

export interface NytOverviewResponse {
  status: string;
  copyright: string;
  num_results: number;
  results: NytOverviewResults;
}

/** Results object for the single-list endpoint (`books` is a flat NytBook[]). */
export interface NytSingleListResults {
  list_name: string;
  list_name_encoded: string;
  bestsellers_date: string;
  published_date: string;
  previous_published_date: string;
  next_published_date: string;
  books: NytBook[];
}

export interface NytListResponse {
  status: string;
  copyright: string;
  num_results: number;
  last_modified: string;
  results: NytSingleListResults;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch the full bestseller overview (every list + its books) for a print date.
 *
 * @param date  Print publication date `YYYY-MM-DD`. Omit for the current week.
 *              NYT snaps to the nearest valid list date, so arbitrary dates are
 *              tolerated. Returns null on 404 (date before the 2017 backfill).
 */
export async function fetchOverview(date?: string): Promise<NytOverviewResponse | null> {
  const path = date
    ? `/lists/overview.json?published_date=${encodeURIComponent(date)}`
    : `/lists/overview.json`;
  return nytFetch<NytOverviewResponse>(path);
}

/**
 * Fetch a single named bestseller list for a date. Use sparingly — the overview
 * endpoint returns every list in one call, so this is only a targeted fallback.
 *
 * @param listName  Encoded list name, e.g. "hardcover-fiction".
 * @param date      Print publication date `YYYY-MM-DD`, or "current".
 */
export async function fetchList(listName: string, date: string): Promise<NytListResponse | null> {
  return nytFetch<NytListResponse>(`/lists/${encodeURIComponent(date)}/${encodeURIComponent(listName)}.json`);
}
