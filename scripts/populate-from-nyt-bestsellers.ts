/**
 * populate-from-nyt-bestsellers.ts
 * ─────────────────────────────────
 * Walks NYT bestseller-list history (overview endpoint, week by week, newest →
 * oldest back to the 2017 backfill boundary) and ingests missing books into the
 * `items` catalog. Enriches each new book with Google Books metadata by ISBN;
 * falls back to NYT-only metadata when Google has no match.
 *
 * Usage:
 *   npx tsx scripts/populate-from-nyt-bestsellers.ts                 # full walk
 *   npx tsx scripts/populate-from-nyt-bestsellers.ts --max-weeks=12  # one quarter
 *   npx tsx scripts/populate-from-nyt-bestsellers.ts --reset         # ignore/clear progress file
 *
 * Resumable: after each week it writes the next date to walk into
 * .nyt-ingestion-progress.json. Re-running resumes from there. Idempotent:
 * a from-scratch re-run finds every book already present and ingests nothing.
 *
 * Throttling lives in the wrapper (lib/nyt-books.ts): >=13s/call, 429 backoff,
 * 480/day budget. Google Books lookups are spaced by GBOOKS_GAP_MS here.
 *
 * NOTE: newly-ingested books have NULL itemDimensions until scripts/
 * calculate-dimensions.ts is run — that is a separate, deliberate step and is
 * intentionally NOT invoked here.
 */
import * as dotenv from "dotenv";
// .env.local holds the current DB password + NYT_BOOKS_API_KEY; the old .env
// (stale DB password) has been removed, but load .env.local first to be safe.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import * as fs from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { fetchOverview, nytRequestCount, type NytBook } from "../src/lib/nyt-books";
import { searchGoogleBooks } from "../src/lib/google-books";

// ── CLI args ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const MAX_WEEKS = parseInt(argv.find((a) => a.startsWith("--max-weeks="))?.split("=")[1] ?? "0") || 0; // 0 = unlimited
const RESET = argv.includes("--reset");

// ── Constants ──────────────────────────────────────────────────────────────
const PROGRESS_FILE = ".nyt-ingestion-progress.json";
const BACKFILL_FLOOR_YEAR = 2017; // NYT backfill currently starts here
const GBOOKS_GAP_MS = 250; // be gentle with Google Books quota
const POP_MAX = 5000;

/**
 * NYT lists to skip. "Graphic Books and Manga" contains manga and graphic
 * novels that belong to the separate `manga`/`comic` media types — ingesting
 * them as `type=book` would mistype them and duplicate the existing manga
 * catalog. Books-only this session, so we skip it. (A future session could
 * route this list to the correct type.)
 */
const EXCLUDE_LISTS = new Set<string>(["Graphic Books and Manga"]);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Connection (DATABASE_URL from .env.local) ────────────────────────────────
const connUrl = process.env.DATABASE_URL;
if (!connUrl) {
  console.error("DATABASE_URL is not set (expected in .env.local). Aborting.");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connUrl }) } as any);

// ── Types ────────────────────────────────────────────────────────────────────
interface NytMeta { peakRank: number; totalWeeks: number; lists: Set<string> }
interface BookEntry {
  id: number;
  /** ext object minus the nyt key — preserved on update. */
  baseExt: Record<string, unknown>;
  /** True if this run inserted the row (safe to update popularityScore). */
  isNew: boolean;
  meta: NytMeta;
  /** Last-written snapshot, to debounce no-op writes. */
  written: { peakRank: number; totalWeeks: number; listCount: number };
}
interface Progress {
  nextDate: string | null; // previous_published_date to fetch next; null = start at current
  firstDate: string | null;
  processedWeeks: number;
  newTotal: number;
  dupTotal: number;
  orphanTotal: number;
  perList: Record<string, { ingested: number; duplicates: number }>;
}

// ── Normalization helpers ────────────────────────────────────────────────────
function normTitle(t: string): string {
  return (t || "")
    .split(/[:(]/)[0] // drop subtitle / parenthetical series
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // letters+digits only, no spaces
}

/** Robust author last-name key — handles "First Last" and "Last, First". */
function authorLastKey(author: string): string {
  if (!author) return "";
  // First author only.
  const first = author.split(/\s+(?:and|with|&)\s+|[,;](?=\s*[A-Z][a-z])|\//)[0]?.trim() || author.trim();
  let last: string;
  if (first.includes(",")) {
    // "Kuang, R. F." → surname is before the comma.
    last = first.split(",")[0].trim();
  } else {
    const tokens = first.split(/\s+/).filter(Boolean);
    last = tokens[tokens.length - 1] || first;
  }
  return last.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function titleAuthorKey(title: string, author: string): string {
  return `${normTitle(title)}::${authorLastKey(author)}`;
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(And|Or|The|Of|A|An|In|On|To|For)\b/g, (m) => m.toLowerCase())
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

function computePopularity(meta: NytMeta): number {
  const raw = meta.totalWeeks * 10 + (16 - meta.peakRank) * 100;
  return Math.max(0, Math.min(POP_MAX, Math.round(raw)));
}

function yearOf(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const y = parseInt(dateStr.slice(0, 4));
  return Number.isFinite(y) ? y : 0;
}

// ── Dedup index (loaded once) ────────────────────────────────────────────────
const byIsbn = new Map<string, BookEntry>();
const byKey = new Map<string, BookEntry>();

function lookup(isbn13: string, key: string): BookEntry | undefined {
  return (isbn13 && byIsbn.get(isbn13)) || byKey.get(key) || undefined;
}

function indexEntry(entry: BookEntry, isbn13: string, key: string): void {
  if (isbn13) byIsbn.set(isbn13, entry);
  if (key) byKey.set(key, entry);
}

async function preload(): Promise<number> {
  const books: Array<{ id: number; isbn: string | null; title: string; people: unknown; ext: unknown }> =
    await (prisma as any).item.findMany({
      where: { type: "book" },
      select: { id: true, isbn: true, title: true, people: true, ext: true },
    });

  for (const b of books) {
    const ext = (b.ext && typeof b.ext === "object" ? (b.ext as Record<string, unknown>) : {}) as Record<string, unknown>;
    const nyt = ext.nyt as { peakRank?: number; totalWeeks?: number; lists?: string[] } | undefined;
    const baseExt: Record<string, unknown> = { ...ext };
    delete baseExt.nyt;

    // Derive an author key from the stored people array (role=Author).
    let authorName = "";
    if (Array.isArray(b.people)) {
      const a = (b.people as Array<{ role?: string; name?: string }>).find((p) => /author/i.test(p.role || ""));
      authorName = a?.name || (b.people[0] as { name?: string })?.name || "";
    }
    const key = titleAuthorKey(b.title, authorName);
    const isbn13 = b.isbn || "";

    const meta: NytMeta = {
      peakRank: nyt?.peakRank ?? 99,
      totalWeeks: nyt?.totalWeeks ?? 0,
      lists: new Set(nyt?.lists ?? []),
    };
    const entry: BookEntry = {
      id: b.id,
      baseExt,
      isNew: false,
      meta,
      written: { peakRank: meta.peakRank, totalWeeks: meta.totalWeeks, listCount: meta.lists.size },
    };
    indexEntry(entry, isbn13, key);
  }
  return books.length;
}

// ── Progress persistence ─────────────────────────────────────────────────────
function loadProgress(): Progress | null {
  if (RESET) {
    try { fs.unlinkSync(PROGRESS_FILE); } catch { /* none */ }
    return null;
  }
  try {
    const raw = fs.readFileSync(PROGRESS_FILE, "utf8");
    return JSON.parse(raw) as Progress;
  } catch {
    return null;
  }
}

function saveProgress(p: Progress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ── Ingest / refine one book encounter ───────────────────────────────────────
function bump(meta: NytMeta, rank: number, weeksOnList: number, listName: string): boolean {
  let changed = false;
  if (rank > 0 && rank < meta.peakRank) { meta.peakRank = rank; changed = true; }
  if (weeksOnList > meta.totalWeeks) { meta.totalWeeks = weeksOnList; changed = true; }
  if (listName && !meta.lists.has(listName)) { meta.lists.add(listName); changed = true; }
  return changed;
}

function entryChangedSinceWrite(entry: BookEntry): boolean {
  return (
    entry.meta.peakRank !== entry.written.peakRank ||
    entry.meta.totalWeeks !== entry.written.totalWeeks ||
    entry.meta.lists.size !== entry.written.listCount
  );
}

async function writeMeta(entry: BookEntry): Promise<void> {
  const nyt = { peakRank: entry.meta.peakRank, totalWeeks: entry.meta.totalWeeks, lists: [...entry.meta.lists] };
  const ext = { ...entry.baseExt, nyt };
  const data: Record<string, unknown> = { ext };
  // Only touch popularityScore/voteCount on rows WE created — never rewrite
  // signal on pre-existing catalog books (scope constraint).
  if (entry.isNew) {
    data.popularityScore = computePopularity(entry.meta);
    data.voteCount = Math.max(1, entry.meta.totalWeeks);
  }
  await (prisma as any).item.update({ where: { id: entry.id }, data });
  entry.written = { peakRank: entry.meta.peakRank, totalWeeks: entry.meta.totalWeeks, listCount: entry.meta.lists.size };
}

interface IngestResult { outcome: "new" | "duplicate"; orphan: boolean }

async function handleBook(book: NytBook, listName: string, weekYear: number): Promise<IngestResult> {
  const isbn13 = (book.primary_isbn13 || "").trim();
  const key = titleAuthorKey(book.title, book.author);
  const existing = lookup(isbn13, key);

  if (existing) {
    const changed = bump(existing.meta, book.rank, book.weeks_on_list, listName);
    if (changed) await writeMeta(existing);
    return { outcome: "duplicate", orphan: false };
  }

  // Brand new → enrich via Google Books by ISBN.
  let orphan = false;
  let gb: Awaited<ReturnType<typeof searchGoogleBooks>>[number] | undefined;
  if (isbn13) {
    try {
      const results = await searchGoogleBooks(`isbn:${isbn13}`);
      gb = results.find((r) => r.cover) || results[0];
    } catch { /* fall through to NYT-only */ }
    await sleep(GBOOKS_GAP_MS);
  }
  if (!gb) orphan = true;

  const meta: NytMeta = { peakRank: book.rank > 0 ? book.rank : 99, totalWeeks: book.weeks_on_list || 0, lists: new Set([listName]) };
  const nyt = { peakRank: meta.peakRank, totalWeeks: meta.totalWeeks, lists: [...meta.lists] };

  const title = gb?.title || toTitleCase(book.title);
  const cover = gb?.cover || book.book_image || "";
  const description = gb?.desc || stripHtml(book.description || "");
  const genre = gb?.genre || [];
  const vibes = gb && gb.vibes.length ? gb.vibes : ["thought-provoking"];
  const year = gb?.year && gb.year > 0 ? gb.year : weekYear; // fallback: the week's year (approx; flagged for orphans)
  const totalEp = gb?.totalEp || 0;
  const people = gb && gb.people.length
    ? gb.people
    : [
        { role: "Author", name: book.author || "Unknown" },
        ...(book.publisher ? [{ role: "Publisher", name: book.publisher }] : []),
      ];
  const baseExt: Record<string, unknown> = { ...(gb?.ext || {}) };
  const ext = { ...baseExt, nyt };

  const created = await (prisma as any).item.create({
    data: {
      title,
      type: "book",
      genre,
      vibes,
      year,
      cover,
      description,
      people: people as any,
      awards: [] as any,
      platforms: ["kindle", "library"] as any,
      ext: ext as any,
      totalEp,
      voteCount: Math.max(1, meta.totalWeeks),
      popularityScore: computePopularity(meta),
      isUpcoming: false,
      ...(isbn13 ? { isbn: isbn13 } : {}),
      ...(gb?.volumeId ? { googleBooksId: gb.volumeId } : {}),
    },
    select: { id: true },
  });

  const entry: BookEntry = {
    id: created.id,
    baseExt,
    isNew: true,
    meta,
    written: { peakRank: meta.peakRank, totalWeeks: meta.totalWeeks, listCount: meta.lists.size },
  };
  indexEntry(entry, isbn13, key);

  return { outcome: "new", orphan };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim();
}

// ── Main walk ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("📚 NYT bestseller ingestion");
  console.log(`  max-weeks: ${MAX_WEEKS || "unlimited"}${RESET ? "  (--reset)" : ""}`);

  const loadedCount = await preload();
  console.log(`  Preloaded ${loadedCount} existing books (${byIsbn.size} with ISBN, ${byKey.size} by title+author)\n`);

  const prior = loadProgress();
  const progress: Progress = prior ?? {
    nextDate: null,
    firstDate: null,
    processedWeeks: 0,
    newTotal: 0,
    dupTotal: 0,
    orphanTotal: 0,
    perList: {},
  };
  if (prior) console.log(`  Resuming from progress file: nextDate=${prior.nextDate}, ${prior.processedWeeks} weeks already done\n`);

  let currentDate: string | undefined = progress.nextDate ?? undefined;
  let weeksThisRun = 0;

  while (MAX_WEEKS === 0 || weeksThisRun < MAX_WEEKS) {
    const overview = await fetchOverview(currentDate);
    if (!overview) {
      if (progress.processedWeeks === 0 && weeksThisRun === 0) {
        console.error(
          "\n❌ First overview fetch returned null. Most likely the Books API product is not\n" +
          "   enabled on NYT_BOOKS_API_KEY (NYT returns 401 InvalidApiKeyForGivenResource),\n" +
          "   or the date is outside the 2017+ backfill. Nothing was ingested. Aborting."
        );
      } else {
        console.log(`\n⚠️  overview fetch returned null at date=${currentDate ?? "current"} — stopping the walk.`);
      }
      break;
    }

    const r = overview.results;
    const weekDate = r.published_date;
    const weekYear = yearOf(weekDate);
    if (progress.firstDate === null) progress.firstDate = weekDate;

    let weekNew = 0;
    let weekDup = 0;
    const listsThisWeek = r.lists.length;

    for (const list of r.lists) {
      const ln = list.list_name;
      if (EXCLUDE_LISTS.has(ln)) continue;
      if (!progress.perList[ln]) progress.perList[ln] = { ingested: 0, duplicates: 0 };
      for (const book of list.books) {
        const res = await handleBook(book, ln, weekYear);
        if (res.outcome === "new") {
          weekNew++;
          progress.newTotal++;
          progress.perList[ln].ingested++;
          if (res.orphan) progress.orphanTotal++;
        } else {
          weekDup++;
          progress.dupTotal++;
          progress.perList[ln].duplicates++;
        }
      }
    }

    progress.processedWeeks++;
    weeksThisRun++;
    console.log(`[NYT-ingest] week=${weekDate} newBooks=${weekNew} duplicates=${weekDup} lists=${listsThisWeek}`);

    const prev = r.previous_published_date;
    progress.nextDate = prev || null;
    saveProgress(progress);

    if (progress.processedWeeks % 50 === 0) {
      console.log(
        `  … tally: weeks=${progress.processedWeeks} new=${progress.newTotal} dup=${progress.dupTotal} ` +
        `orphans=${progress.orphanTotal} nytCalls=${nytRequestCount()}`
      );
    }

    if (!prev) { console.log("\n✅ Reached the start of NYT history (no previous date)."); break; }
    if (yearOf(prev) < BACKFILL_FLOOR_YEAR) { console.log(`\n✅ Reached backfill floor (${BACKFILL_FLOOR_YEAR}).`); break; }
    currentDate = prev;
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log("📊 NYT ingestion summary");
  console.log(`  weeks processed this run: ${weeksThisRun}`);
  console.log(`  total weeks (incl. prior): ${progress.processedWeeks}`);
  console.log(`  NYT API calls this run:   ${nytRequestCount()}`);
  console.log(`  new books ingested:       ${progress.newTotal}`);
  console.log(`  duplicates skipped:       ${progress.dupTotal}`);
  console.log(`  orphans (NYT-only meta):  ${progress.orphanTotal}`);
  console.log(`  date range walked:        ${progress.firstDate} → ${progress.nextDate ?? "(boundary)"}`);
  console.log("\n  Per-list breakdown (ingested / duplicates):");
  const lists = Object.entries(progress.perList).sort((a, b) => b[1].ingested - a[1].ingested);
  for (const [name, c] of lists) {
    console.log(`    ${name}: ${c.ingested} ingested, ${c.duplicates} duplicates`);
  }
  console.log("\n  Reminder: new books have NULL itemDimensions until calculate-dimensions.ts is run.");
}

main()
  .catch((e) => { console.error("Fatal:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
