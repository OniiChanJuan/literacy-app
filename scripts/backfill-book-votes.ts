/**
 * Backfill voteCount for book items from Google Books API.
 *
 * Books currently have voteCount=0 because seed-catalog.ts didn't store
 * Google Books ratingsCount. This causes books to fail the quality floor
 * in meetsQualityFloor() and not appear in catalog browse.
 *
 * This script:
 * 1. Finds all book items with voteCount=0
 * 2. Searches Google Books by title + author
 * 3. Stores ratingsCount → voteCount
 * 4. Also updates google_books score if missing/wrong
 * 5. For books still at 0 after fetch: sets voteCount=1 so they appear in catalog
 *
 * Run: npx tsx scripts/backfill-book-votes.ts
 * Options:
 *   --limit=100    Process only N books (default: all)
 *   --dry-run      Print what would be updated without changing DB
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const GBOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;
const DRY_RUN = args.includes("--dry-run");

async function fetchBookData(title: string, author?: string): Promise<{ ratingsCount: number; averageRating?: number } | null> {
  const query = author ? `${title} ${author}` : title;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3&key=${GBOOKS_KEY}&langRestrict=en`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.items || [];

    // Find best match by title similarity
    const match = items.find((v: any) => {
      const t = (v.volumeInfo?.title || "").toLowerCase();
      return t === title.toLowerCase() || t.includes(title.toLowerCase().slice(0, 15));
    }) || items[0];

    if (!match) return null;
    const info = match.volumeInfo;
    return {
      ratingsCount: info.ratingsCount || 0,
      averageRating: info.averageRating,
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log(`📚 Backfilling book voteCount from Google Books${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const books = await prisma.item.findMany({
    where: { type: "book" },
    select: { id: true, title: true, people: true, voteCount: true, ext: true },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${books.length} total book items`);
  const needsBackfill = books.filter((b) => (b.voteCount || 0) === 0);
  console.log(`${needsBackfill.length} books with voteCount=0 need backfill\n`);

  const toProcess = LIMIT < Infinity ? needsBackfill.slice(0, LIMIT) : needsBackfill;

  const stats = { updated: 0, noData: 0, fallback: 0 };

  for (let i = 0; i < toProcess.length; i++) {
    const book = toProcess[i];
    const people = (book.people as any[]) || [];
    const author = people.find((p: any) => p.role === "Author")?.name;

    const data = await fetchBookData(book.title, author);
    await sleep(200); // Google Books rate limit

    if (data && data.ratingsCount > 0) {
      if (!DRY_RUN) {
        const ext = (book.ext as Record<string, number>) || {};
        const updateData: any = { voteCount: data.ratingsCount };

        // Also update google_books score if missing
        if (data.averageRating && !ext.google_books && !ext.goodreads) {
          updateData.ext = { ...ext, google_books: data.averageRating };
        }

        await prisma.item.update({ where: { id: book.id }, data: updateData });
      }
      console.log(`  ✓ [${i + 1}/${toProcess.length}] "${book.title}" → ${data.ratingsCount} ratings${data.averageRating ? ` (${data.averageRating}/5)` : ""}`);
      stats.updated++;
    } else {
      // Set voteCount=1 as minimum so books appear in catalog
      if (!DRY_RUN) {
        await prisma.item.update({ where: { id: book.id }, data: { voteCount: 1 } });
      }
      console.log(`  ○ [${i + 1}/${toProcess.length}] "${book.title}" → no data, set voteCount=1`);
      stats.fallback++;
    }

    if (i % 50 === 49) {
      console.log(`\n  --- Progress: ${i + 1}/${toProcess.length} ---\n`);
    }
  }

  console.log("\n════════════════════════════════════════");
  console.log("✅ Backfill complete!");
  console.log(`  Updated with real data: ${stats.updated}`);
  console.log(`  Set to minimum (1):     ${stats.fallback}`);
  console.log(`  Skipped (already set):  ${books.length - needsBackfill.length}`);
  console.log("\nNow run: npx tsx scripts/migrate-score-keys.ts (if not done yet)");
  console.log("Then verify: books should appear when browsing the catalog");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
