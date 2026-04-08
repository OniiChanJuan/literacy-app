/**
 * fix-book-covers.ts
 *
 * For every book/manga missing a cover OR using an OpenLibrary URL
 * (which chains through archive.org redirects), fetch a direct cover
 * from Google Books API and update the DB.
 *
 * Priority order:
 *   1. Items the user specifically reported as broken
 *   2. All books with vote_count >= 50 that use OpenLibrary covers
 *   3. All books/manga with null/empty covers
 *
 * Run: npx dotenv-cli -e .env -- npx tsx scripts/fix-book-covers.ts
 * Dry run: npx dotenv-cli -e .env -- npx tsx scripts/fix-book-covers.ts --dry-run
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY_RUN = process.argv.includes("--dry-run");
const CHECK_BROKEN = process.argv.includes("--check-broken");
const GB_KEY = process.env.GOOGLE_BOOKS_API_KEY!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Hosts whose images browsers (Chrome ORB) silently block even though
// HEAD requests return 200. The prior fix scripts didn't catch these.
const ORB_BROKEN_HOSTS = [
  "images-na.ssl-images-amazon.com",
  "m.media-amazon.com",
];

/**
 * HEAD-test a URL and follow redirects manually so we can detect when a
 * covers.openlibrary.org URL chains into archive.org/view_archive.php
 * (which is also browser-ORB-blocked).
 */
async function headCheck(url: string, depth = 0): Promise<{ ok: boolean; broken: boolean; reason?: string; finalUrl?: string }> {
  if (depth > 5) return { ok: false, broken: true, reason: "too many redirects" };
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "Literacy-CoverCheck/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (loc) {
        const next = loc.startsWith("http") ? loc : new URL(loc, url).toString();
        return headCheck(next, depth + 1);
      }
    }
    if (res.status !== 200) return { ok: false, broken: true, reason: `HTTP ${res.status}`, finalUrl: url };
    const ct = res.headers.get("content-type") || "";
    if (!/^image\//i.test(ct)) return { ok: false, broken: true, reason: `content-type ${ct}`, finalUrl: url };
    const cl = parseInt(res.headers.get("content-length") || "0");
    if (cl > 0 && cl < 1000) return { ok: false, broken: true, reason: `content-length ${cl}`, finalUrl: url };
    if (/archive\.org\/.*view_archive\.php/.test(url)) {
      return { ok: false, broken: true, reason: "redirected to archive.org view_archive (browser-ORB)", finalUrl: url };
    }
    return { ok: true, broken: false, finalUrl: url };
  } catch (e: any) {
    return { ok: false, broken: true, reason: e?.message || "network error" };
  }
}

function isOrbBrokenHost(url: string): boolean {
  return ORB_BROKEN_HOSTS.some((h) => url.includes(h));
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Literacy-App/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Build a clean HTTPS thumbnail URL from a Google Books volume ID */
function gbCoverUrl(volumeId: string): string {
  return `https://books.google.com/books/content?id=${volumeId}&printsec=frontcover&img=1&zoom=1`;
}

/** Search Google Books by title + optional author, return best cover URL */
async function searchGoogleBooksCover(
  title: string,
  author: string | null
): Promise<string | null> {
  try {
    let query = `intitle:${title.replace(/[^\w\s]/g, " ").trim()}`;
    if (author) query += `+inauthor:${author.split(" ").slice(-1)[0]}`; // last name only

    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
      query
    )}&key=${GB_KEY}&maxResults=5&langRestrict=en`;

    const data = await fetchJson(url);
    const items: any[] = data.items || [];

    for (const item of items) {
      const info = item.volumeInfo || {};
      const links = info.imageLinks || {};

      // Skip items whose title doesn't roughly match (avoid false positives)
      const itemTitle: string = (info.title || "").toLowerCase();
      const searchTitle = title.toLowerCase();
      const firstWord = searchTitle.split(/\s+/)[0];
      if (firstWord.length > 3 && !itemTitle.includes(firstWord)) continue;

      const rawUrl: string | undefined =
        links.large ||
        links.medium ||
        links.thumbnail ||
        links.smallThumbnail;

      if (rawUrl) {
        // Convert to HTTPS and clean up redundant params
        return rawUrl
          .replace("http://", "https://")
          .replace(/&edge=[^&]*/g, "")
          .replace(/&source=[^&]*/g, "");
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Search OpenLibrary by title, return cover URL using -L (large) size */
async function searchOpenLibraryCover(
  title: string,
  author: string | null
): Promise<string | null> {
  try {
    let url = `https://openlibrary.org/search.json?title=${encodeURIComponent(
      title
    )}&limit=3`;
    if (author) url += `&author=${encodeURIComponent(author)}`;

    const data = await fetchJson(url);
    const docs: any[] = data.docs || [];

    for (const doc of docs) {
      if (doc.cover_i) {
        return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  console.log(`=== fix-book-covers.ts ${DRY_RUN ? "[DRY RUN]" : ""}${CHECK_BROKEN ? " [CHECK-BROKEN]" : ""} ===\n`);

  // ── 1. Collect items to fix ─────────────────────────────────────────────────

  // Priority items the user specifically reported as missing covers
  const PRIORITY_IDS = [16750, 16759, 16952, 16996]; // Animal Farm, Hunger Games, Huck Finn, Novels collection

  // Popular books with OpenLibrary covers (vote_count >= 50)
  const popularOpenlibrary: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, type, cover, people
    FROM items
    WHERE type IN ('book','manga') AND parent_item_id IS NULL
      AND cover LIKE 'https://covers.openlibrary.org/%'
      AND vote_count >= 50
    ORDER BY vote_count DESC NULLS LAST
  `);

  // Books/manga with null or empty or non-http covers
  const missingCovers: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, type, cover, people
    FROM items
    WHERE type IN ('book','manga') AND parent_item_id IS NULL
      AND (cover IS NULL OR cover = '' OR cover NOT LIKE 'http%')
    ORDER BY vote_count DESC NULLS LAST
  `);

  // --check-broken mode: also include books on browser-broken hosts and
  // any popular book whose URL fails HEAD/ORB checks. This is the missing
  // category prior runs never touched — covers that exist in the DB and
  // resolve from Node, but Chrome silently drops in the browser.
  let brokenBooks: any[] = [];
  if (CHECK_BROKEN) {
    const orbHostClause = ORB_BROKEN_HOSTS.map((h) => `cover LIKE '%${h}%'`).join(" OR ");
    const orbHosted: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, title, type, cover, people
      FROM items
      WHERE type IN ('book','manga') AND parent_item_id IS NULL
        AND (${orbHostClause})
      ORDER BY vote_count DESC NULLS LAST
    `);
    console.log(`  [check-broken] ${orbHosted.length} books on ORB-broken hosts (auto-replace)`);

    // HEAD-test all popular books and add ones that fail
    const popular: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, title, type, cover, people
      FROM items
      WHERE type IN ('book','manga') AND parent_item_id IS NULL
        AND cover IS NOT NULL AND cover LIKE 'http%'
        AND vote_count >= 50
      ORDER BY vote_count DESC NULLS LAST
      LIMIT 500
    `);
    console.log(`  [check-broken] HEAD-testing ${popular.length} popular books...`);
    let brokenCount = 0;
    for (const item of popular) {
      if (isOrbBrokenHost(item.cover)) continue; // already in orbHosted
      const r = await headCheck(item.cover);
      if (r.broken) {
        brokenBooks.push(item);
        brokenCount++;
        console.log(`    BROKEN [${item.id}] "${item.title.substring(0, 50)}" — ${r.reason}`);
      }
      await sleep(20);
    }
    console.log(`  [check-broken] ${brokenCount} popular books fail HEAD/ORB checks`);
    brokenBooks = [...orbHosted, ...brokenBooks];
  }

  // Merge: priority IDs first, then popular OpenLibrary, then missing — deduplicate
  const seen = new Set<number>();
  const queue: any[] = [];

  for (const id of PRIORITY_IDS) {
    const item = popularOpenlibrary.find((i) => i.id === id) ||
      missingCovers.find((i) => i.id === id) ||
      (await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, title, type, cover, people FROM items WHERE id = $1`,
        id
      ))[0];
    if (item && !seen.has(item.id)) { seen.add(item.id); queue.push(item); }
  }

  for (const item of [...brokenBooks, ...popularOpenlibrary, ...missingCovers]) {
    if (!seen.has(item.id)) { seen.add(item.id); queue.push(item); }
  }

  console.log(`Processing ${queue.length} items (${popularOpenlibrary.length} popular OpenLibrary + ${missingCovers.length} missing)\n`);

  // ── 2. Fetch covers ─────────────────────────────────────────────────────────
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of queue) {
    // Extract author from people array
    const people: any[] = Array.isArray(item.people) ? item.people : [];
    const authorEntry = people.find(
      (p) =>
        p.role?.toLowerCase().includes("author") ||
        p.role?.toLowerCase().includes("writer")
    );
    const author = authorEntry?.name || null;

    // Try Google Books first, then OpenLibrary
    let coverUrl = await searchGoogleBooksCover(item.title, author);
    await sleep(100); // brief delay for GB API

    if (!coverUrl) {
      coverUrl = await searchOpenLibraryCover(item.title, author);
      await sleep(300); // OL is more aggressive on rate limits
    }

    if (!coverUrl) {
      console.log(`  SKIP [${item.id}] "${item.title}" — no cover found`);
      skipped++;
      continue;
    }

    // Skip if it's the same URL (or same domain) as what we already have
    const current: string = item.cover || "";
    if (coverUrl === current) {
      skipped++;
      continue;
    }

    const source = coverUrl.includes("books.google.com") ? "Google Books" : "OpenLibrary";
    console.log(`  ✓ [${item.id}] "${item.title.substring(0, 50)}" → ${source}`);
    console.log(`      ${coverUrl.substring(0, 80)}`);

    // Safeguard: never overwrite an existing non-empty cover with null/empty.
    if (!coverUrl || coverUrl.length === 0) {
      console.log(`    ❌ safeguard tripped — refusing to write empty cover for [${item.id}]`);
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.$executeRawUnsafe(
        `UPDATE items SET cover = $1 WHERE id = $2`,
        coverUrl,
        item.id
      );
    }
    updated++;

    await sleep(50);
  }

  console.log(`\n════════════════════════════════════`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no change / not found): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`════════════════════════════════════\n`);

  // ── 3. Final counts ─────────────────────────────────────────────────────────
  const counts: any[] = await prisma.$queryRawUnsafe(`
    SELECT type,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE cover IS NULL OR cover = '' OR cover NOT LIKE 'http%')::int as missing,
      COUNT(*) FILTER (WHERE cover LIKE 'https://covers.openlibrary.org/%')::int as openlibrary,
      COUNT(*) FILTER (WHERE cover LIKE 'https://books.google.com/%')::int as google_books
    FROM items
    WHERE type IN ('book','manga') AND parent_item_id IS NULL
    GROUP BY type
  `);
  console.log("Final cover distribution:");
  for (const r of counts) {
    console.log(`  ${r.type.padEnd(8)} total=${r.total}  missing=${r.missing}  openlibrary=${r.openlibrary}  google_books=${r.google_books}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
