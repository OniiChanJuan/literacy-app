/**
 * reenrich-orphans.ts — reusable core for re-enriching NYT-orphan books via
 * Google Books (by ISBN).
 *
 * "Orphan" = a book with ext.nyt set but an empty genre array (the NYT
 * ingestion couldn't reach Google Books for it, so it has only NYT metadata
 * and a generic vibes=["thought-provoking"] fallback). This core fills real
 * genre/description/pageCount/cover/rating and nulls itemDimensions so the next
 * calculate-dimensions pass recomputes a proper taste vector.
 *
 * DESIGN: this function is intentionally context-free — no fs, no process.argv,
 * no long sleeps. It processes a BOUNDED batch and RETURNS on quota (it never
 * waits minutes), so it is safe to call from both:
 *   - the CLI script (scripts/reenrich-orphan-books.ts), which wraps it with a
 *     progress file + 1min/10min backoff-retry across the daily quota, and
 *   - a future Vercel cron route (/api/cron/reenrich-orphans), which would call
 *     it once per tick with a small maxItems and persist the cursor itself.
 *
 * Write-back policy (approved):
 *   genre              ← Google categories, when non-empty
 *   description        ← Google's, only if longer than max(100, existing×1.2)
 *   totalEp(pageCount) ← Google's, only if currently 0
 *   cover              ← Google's, only if currently missing
 *   ext.google_books   ← min(averageRating×2, 10)  [search-path shape], MERGED
 *                        into existing ext so ext.nyt is preserved
 *   googleBooksId      ← set if currently missing
 *   itemDimensions     ← NULL (flag for re-dimensioning)
 *   popularityScore / voteCount ← LEFT UNTOUCHED (NYT behavioral signal beats
 *                        Google's ratingsCount, especially for fiction)
 */
import { Prisma } from "@prisma/client";
import { getGoogleBookByIsbn } from "./google-books";

export interface ReenrichOptions {
  /** Max books to process this batch. 0 / undefined = no cap (CLI use). */
  maxItems?: number;
  /** Resume cursor: only scan books with id > startAfterId (ordered by id ASC). */
  startAfterId?: number;
  /** Specific ids to force into the batch first (testing / targeted fixes),
   *  not subject to startAfterId and not advancing the cursor. */
  forceIds?: number[];
  /** Report what would change without writing. */
  dryRun?: boolean;
  /** Delay between Google requests (ms). Default 1100 (~0.9 req/s). */
  reqDelayMs?: number;
  /** Called after each processed book with the running summary. */
  onProgress?: (s: ReenrichSummary) => void;
}

export interface ReenrichSummary {
  processed: number;       // books examined (incl. no-isbn skips)
  enriched: number;        // got a Google result and wrote something
  withGenre: number;       // subset of enriched that received real categories
  notFound: number;        // Google had no match for the ISBN
  skippedNoIsbn: number;   // no ISBN → cannot look up
  quotaHit: boolean;       // stopped early because Google returned QUOTA
  lastProcessedId: number; // highest id-ordered cursor reached (for resume)
}

interface OrphanRow {
  id: number;
  title: string;
  isbn: string | null;
  description: string | null;
  cover: string | null;
  totalEp: number | null;
  ext: unknown;
  googleBooksId: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ORPHAN_PRED =
  `type='book' AND ext->'nyt' IS NOT NULL ` +
  `AND (genre IS NULL OR array_length(genre,1) IS NULL OR array_length(genre,1)=0)`;

const SELECT_COLS =
  `id, title, isbn, description, cover, total_ep AS "totalEp", ext, google_books_id AS "googleBooksId"`;

/** Process one bounded batch of orphan books. See module header for contract. */
export async function reenrichOrphanBatch(
  prisma: any,
  opts: ReenrichOptions = {},
): Promise<ReenrichSummary> {
  const { maxItems = 0, startAfterId = 0, forceIds = [], dryRun = false, reqDelayMs = 1100, onProgress } = opts;

  const summary: ReenrichSummary = {
    processed: 0, enriched: 0, withGenre: 0, notFound: 0, skippedNoIsbn: 0,
    quotaHit: false, lastProcessedId: startAfterId,
  };

  // 1) Forced ids first (validated integers only — safe to inline).
  const forced = forceIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const rows: OrphanRow[] = [];
  const seen = new Set<number>();

  if (forced.length) {
    const forcedRows: OrphanRow[] = await prisma.$queryRawUnsafe(
      `SELECT ${SELECT_COLS} FROM items WHERE ${ORPHAN_PRED} AND id IN (${forced.join(",")}) ORDER BY id ASC`,
    );
    for (const r of forcedRows) { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } }
  }

  // 2) id-ordered scan for the remainder of the batch.
  const scanLimit = maxItems > 0 ? Math.max(0, maxItems - rows.length) : 0;
  if (maxItems === 0 || scanLimit > 0) {
    const limitClause = maxItems > 0 ? `LIMIT ${Number(scanLimit)}` : "";
    const scanRows: OrphanRow[] = await prisma.$queryRawUnsafe(
      `SELECT ${SELECT_COLS} FROM items WHERE ${ORPHAN_PRED} AND id > ${Number(startAfterId)} ORDER BY id ASC ${limitClause}`,
    );
    for (const r of scanRows) { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } }
  }

  const forcedSet = new Set(forced);

  for (const row of rows) {
    if (maxItems > 0 && summary.processed >= maxItems) break;
    summary.processed++;
    // Cursor advances only over the id-ordered scan, not forced ids.
    if (!forcedSet.has(row.id) && row.id > summary.lastProcessedId) summary.lastProcessedId = row.id;

    if (!row.isbn || !row.isbn.trim()) { summary.skippedNoIsbn++; onProgress?.(summary); continue; }

    const result = await getGoogleBookByIsbn(row.isbn);

    if (result === "QUOTA") {
      summary.quotaHit = true;
      // Do NOT advance past this book; it'll be retried on resume.
      summary.processed--; // wasn't actually processed
      if (!forcedSet.has(row.id) && row.id - 1 >= startAfterId) {
        // leave cursor at the prior item so this id is re-fetched next run
        summary.lastProcessedId = Math.min(summary.lastProcessedId, row.id - 1);
      }
      break;
    }

    if (result === null) { summary.notFound++; onProgress?.(summary); await sleep(reqDelayMs); continue; }

    // ── Build write-back (only changed fields + dims reset) ──────────────
    const data: Record<string, unknown> = {};
    if (result.categories.length > 0) { data.genre = result.categories; summary.withGenre++; }

    const existingDesc = row.description || "";
    if (result.description && result.description.length > Math.max(100, existingDesc.length * 1.2)) {
      data.description = result.description;
    }
    if ((row.totalEp ?? 0) === 0 && result.pageCount > 0) data.totalEp = result.pageCount;
    if ((!row.cover || row.cover.trim() === "") && result.cover) data.cover = result.cover;
    if ((!row.googleBooksId || row.googleBooksId.trim() === "") && result.volumeId) data.googleBooksId = result.volumeId;

    // Merge ext — preserve ext.nyt (and anything else already there).
    if (typeof result.averageRating === "number" && result.averageRating > 0) {
      const baseExt = (row.ext && typeof row.ext === "object") ? (row.ext as Record<string, unknown>) : {};
      data.ext = { ...baseExt, google_books: Math.min(result.averageRating * 2, 10) };
    }

    // Always flag for re-dimensioning when we got real Google data.
    // MUST be Prisma.DbNull (SQL NULL) — calculate-dimensions.ts selects on
    // `itemDimensions: { equals: Prisma.DbNull }`. A JS `null` here writes
    // JSON null, which that query would NOT pick up.
    data.itemDimensions = Prisma.DbNull;

    if (!dryRun) {
      await prisma.item.update({ where: { id: row.id }, data });
    }
    summary.enriched++;
    onProgress?.(summary);
    await sleep(reqDelayMs);
  }

  return summary;
}
