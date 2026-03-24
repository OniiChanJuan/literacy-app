/**
 * Comprehensive deduplication script for books, manga, and music.
 * Run with: npx tsx scripts/deduplicate-items.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

// ── Title normalization ─────────────────────────────────────────────────

const MARKETING_NOISE = [
  /\s*:\s+the\s+(first|second|third|fourth|fifth|new|next|final|bestselling|worldwide|epic|thrilling|sensational|extraordinary|critically|stunning|brilliant|award|beloved|international|unforgettable|captivating|classic|definitive|landmark|groundbreaking|complete|incredible|remarkable|ultimate)\s.{20,}$/i,
  /\s*\((?:book|volume|vol\.?|#|part|series|the\s|a\s|an\s|no\.?\s)\s*\d*[^)]*\)/gi,
  /\s*\([^)]*(?:chronicles?|saga|trilogy|quartet|series|cycle|archive|sequence)\s*(?:#\d+|,?\s*(?:book|volume|vol\.?)\s*\d+)?[^)]*\)/gi,
  /\s*:\s*(?:a\s+)?(?:novel|memoir|thriller|romance|mystery|novella|short\s+story|epic\s+fantasy|graphic\s+novel)$/i,
  /\s*[\(\[]?(?:now\s+a\s+(?:major\s+)?(?:motion\s+picture|hit\s+tv|netflix|hbo|amazon|disney|hulu))[^\)\]]*[\)\]]?/gi,
  /\s*[\(\[]?(?:media|movie|film|tv)\s*tie[- ]?in(?:\s+edition)?[\)\]]?/gi,
  /\s*[\(\[]?(?:mass\s+market|trade)\s*(?:paperback|paper\s+back)[\)\]]?/gi,
  /\s*[\(\[]?(?:hardcover|illustrated|annotated|collector'?s|anniversary|revised|international|expanded|enhanced|special|deluxe|limited)\s*edition[\)\]]?/gi,
  /\s*[\(\[]?(?:reissue|reprint)[\)\]]?/gi,
];

const MUSIC_EDITION_PATTERNS = [
  /\s*[\(\[]?(?:deluxe|super\s+deluxe|expanded|platinum|gold|special|collector'?s|anniversary|limited|bonus\s+track|japanese)\s*(?:edition|version)?[\)\]]?$/i,
  /\s*[\(\[]?(?:remastered|remaster|remixed)[\)\]]?$/i,
  /\s*[\(\[]?(?:explicit|clean)[\)\]]?$/i,
  /\s*[\(\[]?(?:bonus\s+tracks?)[\)\]]?$/i,
];

function normalizeBookTitle(title: string): string {
  let t = title.trim();
  for (const pat of MARKETING_NOISE) {
    t = t.replace(pat, "");
  }
  return t.trim().replace(/\s+/g, " ");
}

function normalizeMusicTitle(title: string): string {
  let t = title.trim();
  for (const pat of MUSIC_EDITION_PATTERNS) {
    t = t.replace(pat, "");
  }
  return t.trim().replace(/\s+/g, " ");
}

function getFirstAuthor(people: any): string {
  if (!Array.isArray(people)) return "";
  const author = (people as { name: string; role: string }[]).find((p) =>
    /author|writer|creator/i.test(p.role)
  );
  return (author?.name || "").toLowerCase().trim();
}

function getFirstArtist(people: any): string {
  if (!Array.isArray(people)) return "";
  const artist = (people as { name: string; role: string }[]).find((p) =>
    /artist|band|performer|singer|musician|composer/i.test(p.role)
  );
  return (artist?.name || "").toLowerCase().trim();
}

// ── Scoring: which duplicate to keep ────────────────────────────────────

function itemQuality(item: any): number {
  let score = 0;
  // Shorter title (cleaner) = better
  score += Math.max(0, 100 - item.title.length);
  // Has cover
  if (item.cover?.startsWith("http")) score += 50;
  // Has description
  if (item.description?.length > 50) score += 30;
  // Has genres
  if (Array.isArray(item.genre) && item.genre.length > 0) score += 20;
  // Has vibes
  if (Array.isArray(item.vibes) && item.vibes.length > 0) score += 15;
  // Higher vote count = better
  score += Math.min(item.voteCount || 0, 100);
  // Higher popularity
  score += Math.min(item.popularityScore || 0, 50);
  return score;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Starting comprehensive deduplication...\n");

  const stats = {
    books: { groups: 0, merged: 0, borderline: [] as string[] },
    manga: { groups: 0, merged: 0, borderline: [] as string[] },
    music: { groups: 0, merged: 0, borderline: [] as string[] },
  };

  // ── PART 1: BOOKS ──────────────────────────────────────────────────
  console.log("═══ PART 1: Book Deduplication ═══\n");

  const books = await prisma.item.findMany({
    where: { type: "book", parentItemId: null },
    select: { id: true, title: true, year: true, cover: true, description: true, genre: true, vibes: true, people: true, voteCount: true, popularityScore: true },
  });

  console.log(`  Total books: ${books.length}`);

  // Group by normalized title + author
  const bookGroups = new Map<string, typeof books>();
  for (const book of books) {
    const normTitle = normalizeBookTitle(book.title).toLowerCase();
    const author = getFirstAuthor(book.people);
    const key = `${normTitle}||${author}`;
    if (!bookGroups.has(key)) bookGroups.set(key, []);
    bookGroups.get(key)!.push(book);
  }

  // Process groups with 2+ items
  let bookDupGroups = 0;
  let bookMerged = 0;

  for (const [key, group] of bookGroups) {
    if (group.length < 2) continue;
    bookDupGroups++;

    // Sort by quality — best first
    group.sort((a, b) => itemQuality(b) - itemQuality(a));
    const keeper = group[0];
    const dupes = group.slice(1);

    // Check if titles are actually similar enough (not just same author)
    const normKeeper = normalizeBookTitle(keeper.title).toLowerCase();
    const allMatch = dupes.every((d) => {
      const normD = normalizeBookTitle(d.title).toLowerCase();
      return normD === normKeeper || normD.includes(normKeeper) || normKeeper.includes(normD);
    });

    if (!allMatch) {
      stats.books.borderline.push(`"${keeper.title}" vs ${dupes.map((d) => `"${d.title}"`).join(", ")}`);
      continue;
    }

    console.log(`  ✓ Keep: "${keeper.title}" (id:${keeper.id})`);
    for (const dupe of dupes) {
      console.log(`    → Mark as edition: "${dupe.title}" (id:${dupe.id})`);
      await prisma.item.update({
        where: { id: dupe.id },
        data: { parentItemId: keeper.id, itemSubtype: "edition" },
      });
      // Remove from franchises
      await prisma.franchiseItem.deleteMany({ where: { itemId: dupe.id } });
      bookMerged++;
    }
  }

  stats.books.groups = bookDupGroups;
  stats.books.merged = bookMerged;

  // ── PART 2: MANGA ─────────────────────────────────────────────────
  console.log("\n═══ PART 2: Manga Deduplication ═══\n");

  const manga = await prisma.item.findMany({
    where: { type: "manga", parentItemId: null },
    select: { id: true, title: true, year: true, cover: true, description: true, genre: true, vibes: true, people: true, voteCount: true, popularityScore: true },
  });

  console.log(`  Total manga: ${manga.length}`);

  // Group by normalized title
  const mangaGroups = new Map<string, typeof manga>();
  for (const m of manga) {
    // Normalize: remove volume numbers, edition text
    let norm = m.title
      .replace(/\s*(?:vol\.?\s*\d+|volume\s*\d+|omnibus\s*\d*)/gi, "")
      .replace(/\s*(?:box\s+set|collector'?s\s+edition|deluxe\s+edition)/gi, "")
      .trim()
      .toLowerCase();
    if (!mangaGroups.has(norm)) mangaGroups.set(norm, []);
    mangaGroups.get(norm)!.push(m);
  }

  let mangaDupGroups = 0;
  let mangaMerged = 0;

  for (const [, group] of mangaGroups) {
    if (group.length < 2) continue;
    mangaDupGroups++;

    group.sort((a, b) => itemQuality(b) - itemQuality(a));
    const keeper = group[0];
    const dupes = group.slice(1);

    console.log(`  ✓ Keep: "${keeper.title}" (id:${keeper.id})`);
    for (const dupe of dupes) {
      console.log(`    → Mark as edition: "${dupe.title}" (id:${dupe.id})`);
      await prisma.item.update({
        where: { id: dupe.id },
        data: { parentItemId: keeper.id, itemSubtype: "edition" },
      });
      await prisma.franchiseItem.deleteMany({ where: { itemId: dupe.id } });
      mangaMerged++;
    }
  }

  stats.manga.groups = mangaDupGroups;
  stats.manga.merged = mangaMerged;

  // ── PART 3: MUSIC ─────────────────────────────────────────────────
  console.log("\n═══ PART 3: Music Deduplication ═══\n");

  const music = await prisma.item.findMany({
    where: { type: "music", parentItemId: null },
    select: { id: true, title: true, year: true, cover: true, description: true, genre: true, vibes: true, people: true, voteCount: true, popularityScore: true },
  });

  console.log(`  Total music: ${music.length}`);

  const musicGroups = new Map<string, typeof music>();
  for (const m of music) {
    const norm = normalizeMusicTitle(m.title).toLowerCase();
    const artist = getFirstArtist(m.people);
    const key = `${norm}||${artist}`;
    if (!musicGroups.has(key)) musicGroups.set(key, []);
    musicGroups.get(key)!.push(m);
  }

  let musicDupGroups = 0;
  let musicMerged = 0;

  for (const [, group] of musicGroups) {
    if (group.length < 2) continue;
    musicDupGroups++;

    group.sort((a, b) => itemQuality(b) - itemQuality(a));
    const keeper = group[0];
    const dupes = group.slice(1);

    // Check similarity
    const normKeeper = normalizeMusicTitle(keeper.title).toLowerCase();
    const allMatch = dupes.every((d) => {
      const normD = normalizeMusicTitle(d.title).toLowerCase();
      return normD === normKeeper;
    });

    if (!allMatch) {
      stats.music.borderline.push(`"${keeper.title}" vs ${dupes.map((d) => `"${d.title}"`).join(", ")}`);
      continue;
    }

    console.log(`  ✓ Keep: "${keeper.title}" (id:${keeper.id})`);
    for (const dupe of dupes) {
      console.log(`    → Mark as edition: "${dupe.title}" (id:${dupe.id})`);
      await prisma.item.update({
        where: { id: dupe.id },
        data: { parentItemId: keeper.id, itemSubtype: "edition" },
      });
      await prisma.franchiseItem.deleteMany({ where: { itemId: dupe.id } });
      musicMerged++;
    }
  }

  stats.music.groups = musicDupGroups;
  stats.music.merged = musicMerged;

  // ── PART 5: TITLE CLEANUP ─────────────────────────────────────────
  console.log("\n═══ PART 5: Title Display Cleanup ═══\n");

  // Clean up book titles that have marketing spam
  const booksToClean = await prisma.item.findMany({
    where: { type: "book", parentItemId: null },
    select: { id: true, title: true },
  });

  let titlesCleaned = 0;
  for (const book of booksToClean) {
    const clean = normalizeBookTitle(book.title);
    if (clean !== book.title && clean.length >= 3) {
      await prisma.item.update({
        where: { id: book.id },
        data: { title: clean },
      });
      titlesCleaned++;
      if (titlesCleaned <= 20) {
        console.log(`  ✓ "${book.title.slice(0, 60)}" → "${clean}"`);
      }
    }
  }
  console.log(`  Cleaned ${titlesCleaned} book titles`);

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n\n════════════════════════════════════════════════════════");
  console.log("📊 DEDUPLICATION SUMMARY");
  console.log("════════════════════════════════════════════════════════\n");

  console.log("BOOKS:");
  console.log(`  Duplicate groups found: ${stats.books.groups}`);
  console.log(`  Items merged/marked as editions: ${stats.books.merged}`);
  if (stats.books.borderline.length > 0) {
    console.log(`  Borderline cases (skipped): ${stats.books.borderline.length}`);
    stats.books.borderline.slice(0, 5).forEach((b) => console.log(`    ⚠ ${b}`));
  }

  console.log("\nMANGA:");
  console.log(`  Duplicate groups found: ${stats.manga.groups}`);
  console.log(`  Items merged/marked as editions: ${stats.manga.merged}`);
  if (stats.manga.borderline.length > 0) {
    console.log(`  Borderline cases: ${stats.manga.borderline.length}`);
    stats.manga.borderline.slice(0, 5).forEach((b) => console.log(`    ⚠ ${b}`));
  }

  console.log("\nMUSIC:");
  console.log(`  Duplicate groups found: ${stats.music.groups}`);
  console.log(`  Items merged/marked as editions: ${stats.music.merged}`);
  if (stats.music.borderline.length > 0) {
    console.log(`  Borderline cases: ${stats.music.borderline.length}`);
    stats.music.borderline.slice(0, 5).forEach((b) => console.log(`    ⚠ ${b}`));
  }

  console.log(`\n  Total book titles cleaned: ${titlesCleaned}`);
  console.log("════════════════════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Deduplication failed:", e);
  process.exit(1);
});
