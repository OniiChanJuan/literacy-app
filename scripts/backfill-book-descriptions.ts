/**
 * Backfill descriptions for book items that have null or very short descriptions.
 *
 * Many imported books have description=null or stubs shorter than 20 characters,
 * which previously caused them to fail the universal quality floor check.
 * The floor has been relaxed for books (score + votes now sufficient), but
 * having real descriptions improves discovery, search, and item detail pages.
 *
 * This script:
 * 1. Finds all book items where description IS NULL or length < 20
 * 2. Tries Google Books API first (volumes/{googleBooksId} or search by title/author)
 * 3. Falls back to OpenLibrary (/works/{openlibraryKey}.json)
 * 4. Updates the item with the fetched description (max 1000 chars, clean HTML stripped)
 * 5. Logs: "Book descriptions backfill: X of Y books updated"
 *
 * Run: npx tsx scripts/backfill-book-descriptions.ts
 * Options:
 *   --limit=100    Process only N books (default: all)
 *   --dry-run      Print what would be updated without changing DB
 *   --skip-existing  Only process books with description IS NULL (skip short ones)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const GBOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;
const DRY_RUN = args.includes("--dry-run");
const SKIP_EXISTING = args.includes("--skip-existing");

// Strip HTML tags and normalize whitespace
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Truncate to max length at a sentence boundary if possible
function truncateDesc(text: string, maxLen = 1000): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf(".");
  return lastPeriod > maxLen * 0.7 ? truncated.slice(0, lastPeriod + 1) : truncated + "…";
}

// ── Google Books ──────────────────────────────────────────────────────────

async function fetchDescriptionByGoogleBooksId(googleBooksId: string): Promise<string | null> {
  if (!GBOOKS_KEY) return null;
  try {
    const url = `https://www.googleapis.com/books/v1/volumes/${googleBooksId}?key=${GBOOKS_KEY}&fields=volumeInfo(description)`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const desc = data?.volumeInfo?.description as string | undefined;
    return desc && desc.length >= 20 ? stripHtml(desc) : null;
  } catch {
    return null;
  }
}

async function fetchDescriptionBySearch(title: string, author?: string): Promise<string | null> {
  if (!GBOOKS_KEY) return null;
  try {
    const query = author ? `intitle:${title} inauthor:${author}` : `intitle:${title}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&key=${GBOOKS_KEY}&langRestrict=en&fields=items(id,volumeInfo(title,description))`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data.items || [];

    // Best match: title starts with or exactly matches
    const titleLower = title.toLowerCase();
    const match = items.find((v) => {
      const t = (v.volumeInfo?.title || "").toLowerCase();
      return t === titleLower || t.startsWith(titleLower.slice(0, 15));
    }) || items[0];

    const desc = match?.volumeInfo?.description as string | undefined;
    return desc && desc.length >= 20 ? stripHtml(desc) : null;
  } catch {
    return null;
  }
}

// ── OpenLibrary ───────────────────────────────────────────────────────────

async function fetchDescriptionFromOpenLibrary(openlibraryKey: string): Promise<string | null> {
  // openlibraryKey is typically "/works/OLxxxxxxW"
  try {
    const key = openlibraryKey.startsWith("/") ? openlibraryKey : `/works/${openlibraryKey}`;
    const url = `https://openlibrary.org${key}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    // description can be a string or { type, value }
    const raw = data?.description;
    const desc = typeof raw === "string" ? raw : typeof raw === "object" ? raw?.value : null;
    if (!desc || desc.length < 20) return null;
    return truncateDesc(stripHtml(String(desc)));
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Find books needing descriptions
  const descWhere = SKIP_EXISTING
    ? { description: null }
    : { OR: [{ description: null }, { description: "" }] };

  // Fetch candidates (we'll filter short descriptions in JS for flexibility)
  const books = await prisma.item.findMany({
    where: { type: "book", ...descWhere },
    select: {
      id: true, title: true, description: true,
      ext: true, people: true,
    },
    orderBy: { voteCount: "desc" },
    take: Math.min(LIMIT === Infinity ? 999999 : LIMIT, 999999),
  });

  // Also include books with short descriptions (< 20 chars) unless --skip-existing
  let candidates = books;
  if (!SKIP_EXISTING) {
    // Also grab short-description books in a second query
    const shortDescBooks = await prisma.item.findMany({
      where: {
        type: "book",
        description: { not: null },
      },
      select: { id: true, title: true, description: true, ext: true, people: true },
      orderBy: { voteCount: "desc" },
    });
    const shortOnes = shortDescBooks.filter(b => (b.description?.length ?? 0) < 20);
    const seen = new Set(books.map(b => b.id));
    candidates = [...books, ...shortOnes.filter(b => !seen.has(b.id))];
  }

  if (LIMIT !== Infinity) candidates = candidates.slice(0, LIMIT);

  console.log(`Book descriptions backfill: ${candidates.length} books to process${DRY_RUN ? " (DRY RUN)" : ""}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const book of candidates) {
    const ext = (book.ext || {}) as Record<string, any>;
    const people = Array.isArray(book.people) ? book.people as any[] : [];
    const author = people.find((p: any) => p.role === "Author")?.name as string | undefined;

    let description: string | null = null;

    // 1. Try Google Books by ID if we have one
    const googleBooksId = ext.google_books_id as string | undefined;
    if (googleBooksId && GBOOKS_KEY) {
      description = await fetchDescriptionByGoogleBooksId(googleBooksId);
      await sleep(120); // stay well within API quota
    }

    // 2. Try Google Books search
    if (!description && GBOOKS_KEY) {
      description = await fetchDescriptionBySearch(book.title, author);
      await sleep(120);
    }

    // 3. Try OpenLibrary by key
    if (!description) {
      const olKey = ext.openlibrary_key as string | undefined;
      if (olKey) {
        description = await fetchDescriptionFromOpenLibrary(olKey);
        await sleep(200);
      }
    }

    // 4. Try OpenLibrary search by title
    if (!description) {
      try {
        const q = encodeURIComponent(book.title);
        const url = `https://openlibrary.org/search.json?title=${q}&limit=3&fields=key,title`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const docs: any[] = data.docs || [];
          const match = docs.find((d: any) =>
            (d.title || "").toLowerCase() === book.title.toLowerCase()
          ) || docs[0];
          if (match?.key) {
            description = await fetchDescriptionFromOpenLibrary(match.key);
          }
        }
        await sleep(300);
      } catch {
        // ignore
      }
    }

    if (description && description.length >= 20) {
      const clean = truncateDesc(description);
      if (DRY_RUN) {
        console.log(`[DRY] Would update "${book.title}": "${clean.slice(0, 80)}..."`);
      } else {
        await prisma.item.update({
          where: { id: book.id },
          data: { description: clean },
        });
      }
      updated++;
    } else {
      skipped++;
      if (failed % 50 === 0 && failed > 0) {
        console.log(`  ... ${failed} books without descriptions so far`);
      }
      failed++;
    }

    if ((updated + skipped) % 100 === 0) {
      console.log(`  Progress: ${updated + skipped}/${candidates.length} (${updated} updated, ${skipped} no description found)`);
    }
  }

  await prisma.$disconnect();
  console.log(`\nBook descriptions backfill: ${updated} of ${candidates.length} books updated${DRY_RUN ? " (DRY RUN — no changes written)" : ""}`);
  console.log(`  ${skipped} books had no description available from Google Books or OpenLibrary`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
