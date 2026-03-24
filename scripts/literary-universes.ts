/**
 * Literary Universe & Franchise Detection Script
 *
 * Layer 1: Wikidata P1434 (fictional universe) + P179 (series) detection
 * Layer 2: Same-author series detection via Google Books
 * Layer 3: Seed known literary universes with missing books from Google Books API
 *
 * Run with: npx tsx scripts/literary-universes.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

const GBOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const GBOOKS_BASE = "https://www.googleapis.com/books/v1";

// ── Utilities ────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim();
}

function coverUrl(imageLinks?: { thumbnail?: string; smallThumbnail?: string }): string {
  const url = imageLinks?.thumbnail || imageLinks?.smallThumbnail || "";
  if (!url) return "";
  return url.replace("&edge=curl", "").replace("zoom=1", "zoom=0").replace("http://", "https://");
}

function deriveVibes(genres: string[], description: string): string[] {
  const vibes: string[] = [];
  const g = new Set(genres.map((s) => s.toLowerCase()));
  const d = description.toLowerCase();
  if (g.has("science fiction") || g.has("sci-fi")) vibes.push("mind-bending");
  if (g.has("fantasy")) vibes.push("epic");
  if (g.has("horror") || g.has("thriller")) vibes.push("dark");
  if (g.has("romance")) vibes.push("emotional");
  if (g.has("mystery")) vibes.push("atmospheric");
  if (d.includes("heartbreak") || d.includes("loss") || d.includes("grief")) vibes.push("heartbreaking");
  if (d.includes("beautiful") || d.includes("lyrical")) vibes.push("immersive");
  return vibes.length > 0 ? vibes.slice(0, 3) : ["thought-provoking"];
}

// ── Google Books helpers ─────────────────────────────────────────────────

interface GVolume {
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
    averageRating?: number;
  };
  saleInfo?: { isEbook?: boolean };
}

async function searchGBooks(query: string): Promise<GVolume[]> {
  const url = `${GBOOKS_BASE}/volumes?q=${encodeURIComponent(query)}&key=${GBOOKS_KEY}&maxResults=10&printType=books&langRestrict=en`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  Google Books search failed for "${query}": ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.items || [];
}

async function findOrCreateBook(
  title: string,
  author: string,
  yearHint?: number,
): Promise<{ id: number; title: string; created: boolean } | null> {
  // Check if already in DB
  const existing = await prisma.item.findFirst({
    where: {
      type: "book",
      title: { contains: title.split(":")[0].trim(), mode: "insensitive" },
      parentItemId: null,
    },
    select: { id: true, title: true },
  });

  if (existing) {
    // Verify it's actually the right book (not just a substring match)
    const normExisting = existing.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normTarget = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normExisting.includes(normTarget) || normTarget.includes(normExisting)) {
      return { id: existing.id, title: existing.title, created: false };
    }
  }

  // Also try exact title match
  const exact = await prisma.item.findFirst({
    where: {
      type: "book",
      title: { equals: title, mode: "insensitive" },
      parentItemId: null,
    },
    select: { id: true, title: true },
  });
  if (exact) return { id: exact.id, title: exact.title, created: false };

  // Search Google Books
  const query = `"${title}" inauthor:${author}`;
  await sleep(300); // Rate limit
  const volumes = await searchGBooks(query);

  // Find best match
  const best = volumes.find((v) => {
    const vTitle = v.volumeInfo.title.toLowerCase();
    const targetTitle = title.toLowerCase();
    return (
      vTitle === targetTitle ||
      vTitle.startsWith(targetTitle) ||
      targetTitle.startsWith(vTitle) ||
      vTitle.includes(targetTitle)
    );
  });

  if (!best) {
    // Try broader search
    await sleep(300);
    const broader = await searchGBooks(`${title} ${author}`);
    const broadBest = broader.find((v) => {
      const vTitle = v.volumeInfo.title.toLowerCase();
      const targetTitle = title.toLowerCase();
      return (
        vTitle === targetTitle ||
        vTitle.startsWith(targetTitle) ||
        targetTitle.startsWith(vTitle)
      );
    });

    if (!broadBest) {
      console.warn(`  ✗ Could not find "${title}" by ${author} on Google Books`);
      return null;
    }

    return await createBookFromVolume(broadBest);
  }

  return await createBookFromVolume(best);
}

async function createBookFromVolume(v: GVolume): Promise<{ id: number; title: string; created: boolean }> {
  const info = v.volumeInfo;

  // Check again by googleBooksId
  const byGbId = await prisma.item.findFirst({
    where: { googleBooksId: v.id },
    select: { id: true, title: true },
  });
  if (byGbId) return { id: byGbId.id, title: byGbId.title, created: false };

  const year = info.publishedDate ? parseInt(info.publishedDate.split("-")[0]) : 0;
  const cover = coverUrl(info.imageLinks);
  const genres = (info.categories || []).flatMap((c) => c.split(/\s*\/\s*/)).slice(0, 4);
  const description = stripHtml(info.description || "");
  const vibes = deriveVibes(genres, description);
  const people: { role: string; name: string }[] = [];
  if (info.authors) {
    for (const a of info.authors) people.push({ role: "Author", name: a });
  }
  if (info.publisher) people.push({ role: "Publisher", name: info.publisher });

  const platforms = ["kindle", "library"];
  if (v.saleInfo?.isEbook) platforms.unshift("audible");

  const ext: Record<string, number> = {};
  if (info.averageRating) ext.goodreads = info.averageRating;

  const fullTitle = info.title + (info.subtitle ? `: ${info.subtitle}` : "");

  const item = await prisma.item.create({
    data: {
      title: fullTitle,
      type: "book",
      genre: genres,
      vibes,
      year,
      cover,
      description,
      people,
      awards: [],
      platforms,
      ext,
      totalEp: info.pageCount || 0,
      googleBooksId: v.id,
      popularityScore: 0,
      voteCount: 0,
      lastSyncedAt: new Date(),
    },
  });

  console.log(`  ✓ Created: "${fullTitle}" (${year}) → id:${item.id}`);
  return { id: item.id, title: fullTitle, created: true };
}

// ── Franchise helpers ────────────────────────────────────────────────────

async function findOrCreateFranchise(
  name: string,
  parentId?: number,
  wikidataId?: string,
): Promise<number> {
  // Check if exists
  const existing = await prisma.franchise.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const franchise = await prisma.franchise.create({
    data: {
      name,
      autoGenerated: false,
      confidenceTier: 1,
      parentFranchiseId: parentId || null,
      wikidataId: wikidataId || null,
    },
  });
  console.log(`  Created franchise: "${name}" (id:${franchise.id}${parentId ? `, parent:${parentId}` : ""})`);
  return franchise.id;
}

async function linkItemToFranchise(itemId: number, franchiseId: number): Promise<boolean> {
  // Check if already linked
  const existing = await prisma.franchiseItem.findUnique({
    where: { franchiseId_itemId: { franchiseId, itemId } },
  });
  if (existing) return false;

  await prisma.franchiseItem.create({
    data: { franchiseId, itemId, addedBy: "literary-universes-script" },
  });
  return true;
}

// Find items already in DB by title keywords (any type)
async function findItemsByTitle(title: string, type?: string): Promise<{ id: number; title: string; type: string }[]> {
  const where: any = {
    title: { contains: title, mode: "insensitive" },
    parentItemId: null,
  };
  if (type) where.type = type;

  const results = await prisma.item.findMany({
    where,
    select: { id: true, title: true, type: true },
  });

  // Filter: search term must be a significant part of the title (>40% of title length)
  // or the title must start with the search term, to avoid "IT" matching everything
  return results.filter((r) => {
    const t = r.title.toLowerCase();
    const s = title.toLowerCase();
    return (
      t === s ||
      t.startsWith(s + " ") || t.startsWith(s + ":") || t.startsWith(s + " -") ||
      s.length / t.length > 0.4
    );
  });
}

// ── Stats tracking ───────────────────────────────────────────────────────

const stats = {
  franchisesCreated: 0,
  itemsLinked: 0,
  booksAdded: 0,
  duplicatesCleaned: 0,
  wikidataMatches: 0,
};

// ══════════════════════════════════════════════════════════════════════════
// PHASE 0: CLEANUP
// ══════════════════════════════════════════════════════════════════════════

async function cleanup() {
  console.log("\n═══ PHASE 0: Cleanup ═══\n");

  // 1. Duplicate "Way of Kings"
  const wayOfKings = await prisma.item.findMany({
    where: { type: "book", title: { contains: "Way of Kings", mode: "insensitive" }, parentItemId: null },
    select: { id: true, title: true, voteCount: true, popularityScore: true, cover: true, description: true },
  });
  if (wayOfKings.length > 1) {
    // Keep the one with more data
    wayOfKings.sort((a, b) => {
      let sa = (a.voteCount || 0) + (a.description?.length || 0);
      let sb = (b.voteCount || 0) + (b.description?.length || 0);
      return sb - sa;
    });
    const keeper = wayOfKings[0];
    for (const dup of wayOfKings.slice(1)) {
      console.log(`  Dedup: "${dup.title}" (id:${dup.id}) → edition of "${keeper.title}" (id:${keeper.id})`);
      await prisma.item.update({
        where: { id: dup.id },
        data: { parentItemId: keeper.id, itemSubtype: "edition" },
      });
      await prisma.franchiseItem.deleteMany({ where: { itemId: dup.id } });
      stats.duplicatesCleaned++;
    }
  }

  // 2. Duplicate Harry Potter franchise
  const hpFranchises = await prisma.franchise.findMany({
    where: { name: { contains: "Harry Potter", mode: "insensitive" } },
    include: { items: { include: { item: { select: { id: true, title: true, type: true } } } } },
  });
  if (hpFranchises.length > 1) {
    // Keep the one with more items
    hpFranchises.sort((a, b) => b.items.length - a.items.length);
    const keepFranchise = hpFranchises[0];
    for (const dupFranchise of hpFranchises.slice(1)) {
      console.log(`  Merge franchise: "${dupFranchise.name}" (id:${dupFranchise.id}, ${dupFranchise.items.length} items) into "${keepFranchise.name}" (id:${keepFranchise.id})`);
      // Move items to keeper
      for (const fi of dupFranchise.items) {
        await linkItemToFranchise(fi.item.id, keepFranchise.id);
      }
      // Delete the duplicate franchise
      await prisma.franchiseItem.deleteMany({ where: { franchiseId: dupFranchise.id } });
      await prisma.franchise.delete({ where: { id: dupFranchise.id } });
      stats.duplicatesCleaned++;
    }
  }

  // 3. Ghost in the Shell duplicate manga
  const gits = await prisma.item.findMany({
    where: { type: "manga", title: { contains: "Ghost in the Shell", mode: "insensitive" }, parentItemId: null },
    select: { id: true, title: true, voteCount: true, description: true },
  });
  if (gits.length > 1) {
    gits.sort((a, b) => {
      let sa = (a.voteCount || 0) + (a.description?.length || 0);
      let sb = (b.voteCount || 0) + (b.description?.length || 0);
      return sb - sa;
    });
    const keeper = gits[0];
    for (const dup of gits.slice(1)) {
      console.log(`  Dedup: "${dup.title}" (id:${dup.id}) → edition of "${keeper.title}" (id:${keeper.id})`);
      await prisma.item.update({
        where: { id: dup.id },
        data: { parentItemId: keeper.id, itemSubtype: "edition" },
      });
      await prisma.franchiseItem.deleteMany({ where: { itemId: dup.id } });
      stats.duplicatesCleaned++;
    }
  }

  // 4. Clean up junk franchises
  const junkFranchiseNames = [
    "Bestsellers",
    "The Harvard Classics Shelf of Fiction, Volume",
    "The Hunt",
    "Walt Disney Animation Studios feature film",
  ];
  for (const name of junkFranchiseNames) {
    const junk = await prisma.franchise.findFirst({
      where: { name: { contains: name, mode: "insensitive" } },
    });
    if (junk) {
      await prisma.franchiseItem.deleteMany({ where: { franchiseId: junk.id } });
      await prisma.franchise.delete({ where: { id: junk.id } });
      console.log(`  Removed junk franchise: "${name}"`);
      stats.duplicatesCleaned++;
    }
  }

  console.log(`  Cleanup done: ${stats.duplicatesCleaned} issues fixed`);
}

// ══════════════════════════════════════════════════════════════════════════
// LAYER 1: WIKIDATA P1434 + P179
// ══════════════════════════════════════════════════════════════════════════

async function wikidataLayer() {
  console.log("\n═══ LAYER 1: Wikidata Fictional Universe Detection ═══\n");

  // Get all items with wikidataId
  const itemsWithWikidata = await prisma.item.findMany({
    where: { wikidataId: { not: null }, parentItemId: null },
    select: { id: true, title: true, type: true, wikidataId: true },
  });

  console.log(`  Items with wikidataId: ${itemsWithWikidata.length}`);

  // Batch query: get P1434 (fictional universe) for all items
  const batchSize = 50;
  const universeMap = new Map<string, { universeName: string; universeQid: string; items: typeof itemsWithWikidata }>();

  for (let i = 0; i < itemsWithWikidata.length; i += batchSize) {
    const batch = itemsWithWikidata.slice(i, i + batchSize);
    const qids = batch.map((item) => item.wikidataId!).join(" wd:");

    const sparql = `
      SELECT ?item ?universeLabel ?universe WHERE {
        VALUES ?item { wd:${qids} }
        ?item wdt:P1434 ?universe .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `;

    try {
      await sleep(1000); // Rate limit Wikidata
      const res = await fetch(
        `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
        { headers: { "User-Agent": "LiteracyApp/1.0 (literacy-universe-detection)" } },
      );

      if (!res.ok) {
        console.warn(`  Wikidata query failed: ${res.status}`);
        continue;
      }

      const data = await res.json();
      for (const result of data.results?.bindings || []) {
        const qid = result.item.value.split("/").pop();
        const universeQid = result.universe.value.split("/").pop();
        const universeName = result.universeLabel.value;

        const item = batch.find((b) => b.wikidataId === qid);
        if (!item) continue;

        if (!universeMap.has(universeQid)) {
          universeMap.set(universeQid, { universeName, universeQid, items: [] });
        }
        universeMap.get(universeQid)!.items.push(item);
      }
    } catch (e: any) {
      console.warn(`  Wikidata batch error: ${e.message}`);
    }
  }

  // Create franchises for universes with 2+ items
  for (const [universeQid, { universeName, items }] of universeMap) {
    if (items.length < 2) continue;
    console.log(`  Universe: "${universeName}" (${universeQid}) — ${items.length} items`);

    const franchiseId = await findOrCreateFranchise(universeName, undefined, universeQid);

    for (const item of items) {
      const linked = await linkItemToFranchise(item.id, franchiseId);
      if (linked) {
        console.log(`    + ${item.type}: "${item.title}"`);
        stats.itemsLinked++;
      }
    }
    stats.wikidataMatches++;
  }

  // Also query P179 (part of series) for books
  console.log("\n  Checking P179 (series membership)...");
  const books = itemsWithWikidata.filter((i) => i.type === "book");
  if (books.length > 0) {
    const qids = books.map((b) => b.wikidataId!).join(" wd:");
    const sparql = `
      SELECT ?item ?seriesLabel ?series WHERE {
        VALUES ?item { wd:${qids} }
        ?item wdt:P179 ?series .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `;

    try {
      await sleep(1000);
      const res = await fetch(
        `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
        { headers: { "User-Agent": "LiteracyApp/1.0" } },
      );
      if (res.ok) {
        const data = await res.json();
        for (const result of data.results?.bindings || []) {
          const qid = result.item.value.split("/").pop();
          const seriesName = result.seriesLabel.value;
          const book = books.find((b) => b.wikidataId === qid);
          if (book) {
            console.log(`    "${book.title}" is part of series: "${seriesName}"`);
          }
        }
      }
    } catch (e: any) {
      console.warn(`  P179 query error: ${e.message}`);
    }
  }

  console.log(`  Wikidata layer done: ${stats.wikidataMatches} universes found`);
}

// ══════════════════════════════════════════════════════════════════════════
// LAYER 3: SEED KNOWN LITERARY UNIVERSES
// ══════════════════════════════════════════════════════════════════════════

interface UniverseDefinition {
  name: string;
  subFranchises: {
    name: string;
    books: { title: string; author: string }[];
    otherMedia?: { title: string; type?: string }[];
  }[];
  standaloneBooks?: { title: string; author: string }[];
  crossMediaSearch?: string[]; // Titles to search in existing DB (any type)
}

const KNOWN_UNIVERSES: UniverseDefinition[] = [
  {
    name: "The Cosmere",
    subFranchises: [
      {
        name: "The Stormlight Archive",
        books: [
          { title: "The Way of Kings", author: "Brandon Sanderson" },
          { title: "Words of Radiance", author: "Brandon Sanderson" },
          { title: "Oathbringer", author: "Brandon Sanderson" },
          { title: "Rhythm of War", author: "Brandon Sanderson" },
          { title: "Wind and Truth", author: "Brandon Sanderson" },
        ],
      },
      {
        name: "Mistborn",
        books: [
          { title: "The Final Empire", author: "Brandon Sanderson" },
          { title: "The Well of Ascension", author: "Brandon Sanderson" },
          { title: "The Hero of Ages", author: "Brandon Sanderson" },
          { title: "The Alloy of Law", author: "Brandon Sanderson" },
          { title: "Shadows of Self", author: "Brandon Sanderson" },
          { title: "The Bands of Mourning", author: "Brandon Sanderson" },
          { title: "The Lost Metal", author: "Brandon Sanderson" },
        ],
      },
    ],
    standaloneBooks: [
      { title: "Warbreaker", author: "Brandon Sanderson" },
      { title: "Elantris", author: "Brandon Sanderson" },
      { title: "Tress of the Emerald Sea", author: "Brandon Sanderson" },
      { title: "Yumi and the Nightmare Painter", author: "Brandon Sanderson" },
      { title: "The Sunlit Man", author: "Brandon Sanderson" },
    ],
  },
  {
    name: "Stephen King Universe",
    subFranchises: [
      {
        name: "The Dark Tower",
        books: [
          { title: "The Gunslinger", author: "Stephen King" },
          { title: "The Drawing of the Three", author: "Stephen King" },
          { title: "The Waste Lands", author: "Stephen King" },
          { title: "Wizard and Glass", author: "Stephen King" },
          { title: "Wolves of the Calla", author: "Stephen King" },
          { title: "Song of Susannah", author: "Stephen King" },
          { title: "The Dark Tower", author: "Stephen King" },
        ],
        otherMedia: [
          { title: "The Dark Tower", type: "movie" },
        ],
      },
    ],
    standaloneBooks: [
      { title: "IT", author: "Stephen King" },
      { title: "The Stand", author: "Stephen King" },
      { title: "Salem's Lot", author: "Stephen King" },
      { title: "The Shining", author: "Stephen King" },
      { title: "Insomnia", author: "Stephen King" },
      { title: "11/22/63", author: "Stephen King" },
      { title: "The Mist", author: "Stephen King" },
    ],
    crossMediaSearch: ["The Shining", "Salem's Lot"],
  },
  {
    name: "Riordanverse",
    subFranchises: [
      {
        name: "Percy Jackson",
        books: [
          { title: "The Lightning Thief", author: "Rick Riordan" },
          { title: "The Sea of Monsters", author: "Rick Riordan" },
          { title: "The Titan's Curse", author: "Rick Riordan" },
          { title: "The Battle of the Labyrinth", author: "Rick Riordan" },
          { title: "The Last Olympian", author: "Rick Riordan" },
        ],
        otherMedia: [
          { title: "Percy Jackson", type: "tv" },
        ],
      },
      {
        name: "Heroes of Olympus",
        books: [
          { title: "The Lost Hero", author: "Rick Riordan" },
          { title: "The Son of Neptune", author: "Rick Riordan" },
          { title: "The Mark of Athena", author: "Rick Riordan" },
          { title: "The House of Hades", author: "Rick Riordan" },
          { title: "The Blood of Olympus", author: "Rick Riordan" },
        ],
      },
      {
        name: "The Kane Chronicles",
        books: [
          { title: "The Red Pyramid", author: "Rick Riordan" },
          { title: "The Throne of Fire", author: "Rick Riordan" },
          { title: "The Serpent's Shadow", author: "Rick Riordan" },
        ],
      },
      {
        name: "Magnus Chase",
        books: [
          { title: "The Sword of Summer", author: "Rick Riordan" },
          { title: "The Hammer of Thor", author: "Rick Riordan" },
          { title: "The Ship of the Dead", author: "Rick Riordan" },
        ],
      },
      {
        name: "Trials of Apollo",
        books: [
          { title: "The Hidden Oracle", author: "Rick Riordan" },
          { title: "The Dark Prophecy", author: "Rick Riordan" },
          { title: "The Burning Maze", author: "Rick Riordan" },
          { title: "The Tyrant's Tomb", author: "Rick Riordan" },
          { title: "The Tower of Nero", author: "Rick Riordan" },
        ],
      },
    ],
  },
  {
    name: "Discworld",
    subFranchises: [
      {
        name: "Discworld: City Watch",
        books: [
          { title: "Guards! Guards!", author: "Terry Pratchett" },
          { title: "Men at Arms", author: "Terry Pratchett" },
          { title: "Feet of Clay", author: "Terry Pratchett" },
          { title: "Jingo", author: "Terry Pratchett" },
          { title: "The Fifth Elephant", author: "Terry Pratchett" },
          { title: "Night Watch", author: "Terry Pratchett" },
          { title: "Thud!", author: "Terry Pratchett" },
          { title: "Snuff", author: "Terry Pratchett" },
        ],
      },
      {
        name: "Discworld: Witches",
        books: [
          { title: "Equal Rites", author: "Terry Pratchett" },
          { title: "Wyrd Sisters", author: "Terry Pratchett" },
          { title: "Witches Abroad", author: "Terry Pratchett" },
          { title: "Lords and Ladies", author: "Terry Pratchett" },
          { title: "Maskerade", author: "Terry Pratchett" },
          { title: "Carpe Jugulum", author: "Terry Pratchett" },
        ],
      },
      {
        name: "Discworld: Death",
        books: [
          { title: "Mort", author: "Terry Pratchett" },
          { title: "Reaper Man", author: "Terry Pratchett" },
          { title: "Soul Music", author: "Terry Pratchett" },
          { title: "Hogfather", author: "Terry Pratchett" },
          { title: "Thief of Time", author: "Terry Pratchett" },
        ],
      },
      {
        name: "Discworld: Rincewind",
        books: [
          { title: "The Colour of Magic", author: "Terry Pratchett" },
          { title: "The Light Fantastic", author: "Terry Pratchett" },
          { title: "Sourcery", author: "Terry Pratchett" },
          { title: "Eric", author: "Terry Pratchett" },
          { title: "Interesting Times", author: "Terry Pratchett" },
          { title: "The Last Continent", author: "Terry Pratchett" },
        ],
      },
      {
        name: "Discworld: Tiffany Aching",
        books: [
          { title: "The Wee Free Men", author: "Terry Pratchett" },
          { title: "A Hat Full of Sky", author: "Terry Pratchett" },
          { title: "Wintersmith", author: "Terry Pratchett" },
          { title: "I Shall Wear Midnight", author: "Terry Pratchett" },
          { title: "The Shepherd's Crown", author: "Terry Pratchett" },
        ],
      },
      {
        name: "Discworld: Moist von Lipwig",
        books: [
          { title: "Going Postal", author: "Terry Pratchett" },
          { title: "Making Money", author: "Terry Pratchett" },
          { title: "Raising Steam", author: "Terry Pratchett" },
        ],
      },
    ],
    standaloneBooks: [
      { title: "Small Gods", author: "Terry Pratchett" },
      { title: "Pyramids", author: "Terry Pratchett" },
      { title: "Moving Pictures", author: "Terry Pratchett" },
      { title: "Monstrous Regiment", author: "Terry Pratchett" },
      { title: "The Truth", author: "Terry Pratchett" },
      { title: "The Amazing Maurice and His Educated Rodents", author: "Terry Pratchett" },
    ],
  },
  {
    name: "Nasuverse",
    subFranchises: [
      {
        name: "Fate/stay night",
        books: [],
        otherMedia: [
          { title: "Fate/stay night" },
          { title: "Fate/stay night: Unlimited Blade Works" },
          { title: "Fate/stay night: Heaven's Feel" },
        ],
      },
      {
        name: "Fate/Zero",
        books: [],
        otherMedia: [{ title: "Fate/Zero" }],
      },
      {
        name: "Fate/Grand Order",
        books: [],
        otherMedia: [{ title: "Fate/Grand Order" }],
      },
      {
        name: "Kara no Kyoukai",
        books: [],
        otherMedia: [{ title: "Kara no Kyoukai" }, { title: "Garden of Sinners" }],
      },
      {
        name: "Tsukihime",
        books: [],
        otherMedia: [{ title: "Tsukihime" }],
      },
    ],
  },
  {
    name: "Middle-earth",
    subFranchises: [],
    standaloneBooks: [
      { title: "The Silmarillion", author: "J.R.R. Tolkien" },
      { title: "Unfinished Tales", author: "J.R.R. Tolkien" },
      { title: "The Children of Hurin", author: "J.R.R. Tolkien" },
      { title: "Beren and Luthien", author: "J.R.R. Tolkien" },
      { title: "The Fall of Gondolin", author: "J.R.R. Tolkien" },
    ],
    crossMediaSearch: [
      "Lord of the Rings", "Hobbit", "Rings of Power",
      "Fellowship of the Ring", "Two Towers", "Return of the King",
    ],
  },
  {
    name: "Halo",
    subFranchises: [],
    standaloneBooks: [
      { title: "Halo: The Fall of Reach", author: "Eric Nylund" },
      { title: "Halo: The Flood", author: "William C. Dietz" },
      { title: "Halo: First Strike", author: "Eric Nylund" },
      { title: "Halo: Ghosts of Onyx", author: "Eric Nylund" },
      { title: "Halo: Contact Harvest", author: "Joseph Staten" },
    ],
    crossMediaSearch: ["Halo"],
  },
  {
    name: "The Witcher",
    subFranchises: [],
    standaloneBooks: [
      { title: "The Last Wish", author: "Andrzej Sapkowski" },
      { title: "Sword of Destiny", author: "Andrzej Sapkowski" },
      { title: "Blood of Elves", author: "Andrzej Sapkowski" },
      { title: "Time of Contempt", author: "Andrzej Sapkowski" },
      { title: "Baptism of Fire", author: "Andrzej Sapkowski" },
      { title: "The Tower of the Swallow", author: "Andrzej Sapkowski" },
      { title: "The Lady of the Lake", author: "Andrzej Sapkowski" },
      { title: "Season of Storms", author: "Andrzej Sapkowski" },
    ],
    crossMediaSearch: ["Witcher"],
  },
  {
    name: "Dragon Age",
    subFranchises: [],
    standaloneBooks: [
      { title: "Dragon Age: The Stolen Throne", author: "David Gaider" },
      { title: "Dragon Age: The Calling", author: "David Gaider" },
      { title: "Dragon Age: Asunder", author: "David Gaider" },
      { title: "Dragon Age: The Masked Empire", author: "Patrick Weekes" },
    ],
    crossMediaSearch: ["Dragon Age"],
  },
  {
    name: "Mass Effect",
    subFranchises: [],
    standaloneBooks: [
      { title: "Mass Effect: Revelation", author: "Drew Karpyshyn" },
      { title: "Mass Effect: Ascension", author: "Drew Karpyshyn" },
      { title: "Mass Effect: Retribution", author: "Drew Karpyshyn" },
    ],
    crossMediaSearch: ["Mass Effect"],
  },
  {
    name: "Dune",
    subFranchises: [],
    standaloneBooks: [
      { title: "Dune", author: "Frank Herbert" },
      { title: "Dune Messiah", author: "Frank Herbert" },
      { title: "Children of Dune", author: "Frank Herbert" },
      { title: "God Emperor of Dune", author: "Frank Herbert" },
      { title: "Heretics of Dune", author: "Frank Herbert" },
      { title: "Chapterhouse: Dune", author: "Frank Herbert" },
    ],
    crossMediaSearch: ["Dune"],
  },
  {
    name: "Warhammer 40,000",
    subFranchises: [],
    standaloneBooks: [],
    crossMediaSearch: ["Warhammer", "Dawn of War", "Space Marine", "Darktide", "Mechanicus", "Boltgun"],
  },
];

async function seedKnownUniverses() {
  console.log("\n═══ LAYER 3: Seed Known Literary Universes ═══\n");

  for (const universe of KNOWN_UNIVERSES) {
    console.log(`\n── ${universe.name} ──`);

    // Create parent franchise
    const parentId = await findOrCreateFranchise(universe.name);

    // Process sub-franchises
    for (const sub of universe.subFranchises) {
      console.log(`\n  Sub-franchise: ${sub.name}`);
      const subId = await findOrCreateFranchise(sub.name, parentId);

      // Add books
      for (const book of sub.books) {
        const result = await findOrCreateBook(book.title, book.author);
        if (result) {
          const linked = await linkItemToFranchise(result.id, subId);
          // Also link to parent
          await linkItemToFranchise(result.id, parentId);
          if (result.created) stats.booksAdded++;
          if (linked) stats.itemsLinked++;
          console.log(`    ${result.created ? "+" : "="} "${result.title}" (id:${result.id})`);
        }
      }

      // Search for other media (movies, TV, games, anime, manga)
      if (sub.otherMedia) {
        for (const media of sub.otherMedia) {
          const items = await findItemsByTitle(media.title, media.type);
          for (const item of items) {
            const linked = await linkItemToFranchise(item.id, subId);
            await linkItemToFranchise(item.id, parentId);
            if (linked) {
              stats.itemsLinked++;
              console.log(`    + ${item.type}: "${item.title}" (id:${item.id})`);
            }
          }
        }
      }
    }

    // Add standalone books to parent franchise directly
    if (universe.standaloneBooks) {
      for (const book of universe.standaloneBooks) {
        const result = await findOrCreateBook(book.title, book.author);
        if (result) {
          const linked = await linkItemToFranchise(result.id, parentId);
          if (result.created) stats.booksAdded++;
          if (linked) stats.itemsLinked++;
          console.log(`    ${result.created ? "+" : "="} "${result.title}" (id:${result.id})`);
        }
      }
    }

    // Search DB for cross-media items
    if (universe.crossMediaSearch) {
      for (const searchTerm of universe.crossMediaSearch) {
        const items = await findItemsByTitle(searchTerm);
        for (const item of items) {
          const linked = await linkItemToFranchise(item.id, parentId);
          if (linked) {
            stats.itemsLinked++;
            console.log(`    + ${item.type}: "${item.title}" (id:${item.id})`);
          }
        }
      }
    }

    stats.franchisesCreated++;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// LAYER 2: SAME-AUTHOR SERIES DETECTION
// ══════════════════════════════════════════════════════════════════════════

async function sameAuthorDetection() {
  console.log("\n\n═══ LAYER 2: Same-Author Series Detection ═══\n");

  // Get all books grouped by author
  const allBooks = await prisma.item.findMany({
    where: { type: "book", parentItemId: null },
    select: { id: true, title: true, people: true, year: true },
  });

  const byAuthor = new Map<string, typeof allBooks>();
  for (const book of allBooks) {
    if (!Array.isArray(book.people)) continue;
    const author = (book.people as { name: string; role: string }[]).find(
      (p) => /author/i.test(p.role),
    );
    if (!author) continue;
    const name = author.name.toLowerCase().trim();
    if (!name) continue;
    if (!byAuthor.has(name)) byAuthor.set(name, []);
    byAuthor.get(name)!.push(book);
  }

  // Only look at authors with 2+ books
  let seriesFound = 0;
  for (const [author, books] of byAuthor) {
    if (books.length < 2) continue;

    // Check if these books are already in a franchise together
    const franchiseIds = new Set<number>();
    for (const book of books) {
      const fis = await prisma.franchiseItem.findMany({
        where: { itemId: book.id },
        select: { franchiseId: true },
      });
      for (const fi of fis) franchiseIds.add(fi.franchiseId);
    }

    // If all books are already in the same franchise, skip
    if (franchiseIds.size === 1) continue;

    // If no franchise, log it — these might be a series we missed
    if (franchiseIds.size === 0) {
      console.log(`  Unlinked author: ${author} — ${books.length} books:`);
      for (const b of books) {
        console.log(`    - "${b.title}" (${b.year})`);
      }
      seriesFound++;
    }
  }

  console.log(`  Found ${seriesFound} potential unlinked author groups`);
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("📚 Literary Universe Detection & Franchise Creation\n");
  console.log("=".repeat(60));

  await cleanup();
  await wikidataLayer();
  await seedKnownUniverses();
  await sameAuthorDetection();

  // Final report
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 FINAL REPORT");
  console.log("=".repeat(60));
  console.log(`  Franchises created/updated: ${stats.franchisesCreated}`);
  console.log(`  Items linked to franchises: ${stats.itemsLinked}`);
  console.log(`  Books added from Google Books: ${stats.booksAdded}`);
  console.log(`  Duplicates/junk cleaned: ${stats.duplicatesCleaned}`);
  console.log(`  Wikidata universe matches: ${stats.wikidataMatches}`);
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
