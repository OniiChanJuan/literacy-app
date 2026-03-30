/**
 * populate-warhammer.ts
 *
 * Comprehensive Warhammer franchise setup:
 * 1. Creates parent "Warhammer" + child "Warhammer Fantasy / The Old World" franchises
 * 2. Sets Warhammer 40,000 (id 578) as child of parent, adds icon/description
 * 3. Links existing DB items to the correct franchise
 * 4. Fetches and adds missing 40K games from IGDB (specific + broad search)
 * 5. Fetches and adds missing Fantasy games from IGDB
 * 6. Fetches and adds 40K books from Google Books (specific + broad)
 * 7. Fetches and adds Fantasy books from Google Books
 * 8. Reports final counts
 *
 * Run: npx tsx scripts/populate-warhammer.ts
 * Flags:
 *   --dry-run        Print what would be done, no DB writes
 *   --games-only     Skip book fetching
 *   --books-only     Skip game fetching
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY_RUN = process.argv.includes("--dry-run");
const GAMES_ONLY = process.argv.includes("--games-only");
const BOOKS_ONLY = process.argv.includes("--books-only");

const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET!;
const GBOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY!;
const IGDB_BASE = "https://api.igdb.com/v4";
const IMG_BASE = "https://images.igdb.com/igdb/image/upload";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── IGDB ────────────────────────────────────────────────────────────────────

let _igdbToken: string | null = null;
async function getIgdbToken(): Promise<string> {
  if (_igdbToken) return _igdbToken;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  _igdbToken = data.access_token;
  return _igdbToken!;
}

const IGDB_FIELDS = [
  "id", "name", "cover.image_id", "first_release_date",
  "genres.name", "platforms.name", "summary",
  "involved_companies.company.name", "involved_companies.developer", "involved_companies.publisher",
  "total_rating", "total_rating_count",
  "aggregated_rating", "aggregated_rating_count",
  "external_games.category", "external_games.uid",
].join(",");

async function igdbQuery(body: string): Promise<any[]> {
  const token = await getIgdbToken();
  const res = await fetch(`${IGDB_BASE}/games`, {
    method: "POST",
    headers: {
      "Client-ID": IGDB_CLIENT_ID,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!res.ok) {
    console.error("  IGDB error:", res.status, await res.text().catch(() => ""));
    return [];
  }
  return res.json();
}

async function igdbSearchByTitle(title: string): Promise<any[]> {
  const safe = title.replace(/"/g, "");
  const results = await igdbQuery(
    `search "${safe}"; fields ${IGDB_FIELDS}; limit 10;`
  );
  await sleep(250);
  return results;
}

async function igdbSearchContains(pattern: string, limit = 50): Promise<any[]> {
  const safe = pattern.replace(/"/g, "");
  const results = await igdbQuery(
    `fields ${IGDB_FIELDS}; where name ~ *"${safe}"*; limit ${limit}; sort total_rating_count desc;`
  );
  await sleep(250);
  return results;
}

function mapIgdbGame(g: any) {
  const GENRE_MAP: Record<string, string> = {
    "role-playing (rpg)": "RPG",
    "hack and slash/beat 'em up": "Action",
    "shooter": "Action",
    "fighting": "Action",
    "adventure": "Adventure",
    "strategy": "Strategy",
    "real time strategy (rts)": "Strategy",
    "turn-based strategy (tbs)": "Strategy",
    "tactical": "Strategy",
    "simulator": "Simulation",
    "platform": "Platformer",
    "indie": "Indie",
    "puzzle": "Puzzle",
  };

  const genres = (g.genres || []).map((x: any) => GENRE_MAP[x.name.toLowerCase()] || x.name);
  const seen = new Set<string>();
  const uniqueGenres = genres.filter((v: string) => { if (seen.has(v)) return false; seen.add(v); return true; });

  const platMap = (name: string): string | null => {
    const n = name.toLowerCase();
    if (n.includes("pc") || n.includes("windows") || n.includes("mac") || n.includes("linux")) return "steam";
    if (n.includes("playstation")) return "ps";
    if (n.includes("xbox")) return "xbox";
    if (n.includes("nintendo switch")) return "switch";
    return null;
  };
  const platSeen = new Set<string>();
  const platforms = (g.platforms || [])
    .map((p: any) => platMap(p.name))
    .filter(Boolean)
    .filter((v: any) => { if (platSeen.has(v)) return false; platSeen.add(v); return true; });

  const year = g.first_release_date
    ? new Date(g.first_release_date * 1000).getFullYear() : 0;
  const cover = g.cover?.image_id
    ? `${IMG_BASE}/t_720p/${g.cover.image_id}.jpg` : "";

  const people: Array<{ role: string; name: string }> = [];
  if (g.involved_companies) {
    const dev = g.involved_companies.find((c: any) => c.developer);
    const pub = g.involved_companies.find((c: any) => c.publisher && !c.developer);
    if (dev) people.push({ role: "Developer", name: dev.company.name });
    if (pub) people.push({ role: "Publisher", name: pub.company.name });
  }

  const ext: Record<string, number> = {};
  if (g.total_rating) ext.igdb = Math.round(g.total_rating);
  if (g.total_rating_count) ext.igdb_count = g.total_rating_count;
  if (g.aggregated_rating) ext.igdb_critics = Math.round(g.aggregated_rating);
  if (g.aggregated_rating_count) ext.igdb_critics_count = g.aggregated_rating_count;

  const steamEntry = (g.external_games || []).find((e: any) => e.category === 1);
  const steamAppId = steamEntry?.uid ? parseInt(steamEntry.uid) : null;
  const voteCount = g.total_rating_count || 0;

  // Vibes
  const vibes: string[] = [];
  const gSet = new Set(uniqueGenres.map((s: string) => s.toLowerCase()));
  if (gSet.has("rpg") || gSet.has("adventure")) vibes.push("immersive");
  if (gSet.has("action")) vibes.push("intense");
  if (gSet.has("strategy")) vibes.push("cerebral");
  if ((g.total_rating || 0) >= 85) vibes.push("epic");
  vibes.push("dark"); // Warhammer is always dark

  return {
    title: g.name as string,
    type: "game" as const,
    genre: uniqueGenres,
    vibes: [...new Set(vibes)].slice(0, 3),
    year,
    cover,
    description: g.summary || "",
    people,
    awards: [],
    platforms,
    ext,
    totalEp: 0,
    igdbId: g.id as number,
    steamAppId,
    voteCount,
    popularityScore: voteCount,
  };
}

// ─── Google Books ────────────────────────────────────────────────────────────

async function gbooksSearch(query: string, maxResults = 40): Promise<any[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&key=${GBOOKS_KEY}&maxResults=${maxResults}&printType=books&langRestrict=en`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  await sleep(150);
  return data.items || [];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncateDesc(text: string, max = 1000): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastDot = cut.lastIndexOf(".");
  return lastDot > max * 0.7 ? cut.slice(0, lastDot + 1) : cut + "…";
}

function mapGBook(v: any): {
  title: string; year: number; cover: string; description: string;
  people: Array<{ role: string; name: string }>; ext: Record<string, number>;
  googleBooksId: string; publisher: string;
} | null {
  const info = v.volumeInfo || {};
  if (!info.title) return null;
  const year = info.publishedDate ? parseInt(info.publishedDate.split("-")[0]) : 0;
  const cover = (() => {
    const url = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "";
    return url.replace("&edge=curl", "").replace("zoom=1", "zoom=0").replace("http://", "https://");
  })();
  const description = info.description ? truncateDesc(stripHtml(info.description)) : "";
  const people: Array<{ role: string; name: string }> = [];
  (info.authors || []).forEach((a: string) => people.push({ role: "Author", name: a }));
  if (info.publisher) people.push({ role: "Publisher", name: info.publisher });
  const ext: Record<string, number> = {};
  if (info.averageRating) ext.google_books = info.averageRating;
  return {
    title: info.title,
    year,
    cover,
    description,
    people,
    ext,
    googleBooksId: v.id,
    publisher: info.publisher || "",
  };
}

// ─── Franchise classification ────────────────────────────────────────────────

function classify40KGame(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("40,000") || t.includes("40k") || t.includes(" 40 ") ||
    t.includes("dawn of war") || t.includes("darktide") || t.includes("space marine") ||
    t.includes("mechanicus") || t.includes("boltgun") || t.includes("necromunda") ||
    t.includes("battlefleet gothic") || t.includes("inquisitor") || t.includes("rogue trader") ||
    t.includes("gladius") || t.includes("horus heresy") || t.includes("chaos gate") ||
    t.includes("fire warrior") || t.includes("kill team");
}

function classifyFantasyGame(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("total war: warhammer") || t.includes("vermintide") ||
    t.includes("blood bowl") || t.includes("mordheim") || t.includes("chaosbane") ||
    t.includes("dark omen") || t.includes("mark of chaos") || t.includes("shadow of the horned rat") ||
    t.includes("age of sigmar") || t.includes("warcry") || t.includes("underworlds") ||
    (t.includes("warhammer") && !classify40KGame(title) &&
      (t.includes("fantasy") || t.includes("old world") || t.includes("sigmar") ||
       t.includes("gotrek") || t.includes("skaven") || t.includes("lizard") || t.includes("dwarf")));
}

function classifyWarhammer(title: string): "40k" | "fantasy" | "unknown" {
  if (classify40KGame(title)) return "40k";
  if (classifyFantasyGame(title)) return "fantasy";
  return "unknown";
}

const WH40K_BOOK_KEYWORDS = [
  "40,000", "40k", "space marine", "horus heresy", "imperium",
  "chaos space marine", "inquisitor", "astartes", "adeptus", "necron",
  "eldar", "tyranid", "siege of terra", "eisenhorn", "gaunt",
  "ciaphas cain", "night lords", "ultramarines", "primarch", "ork", "tau",
  "black library 40k", "warp", "dark eldar", "xenos", "malleus", "hereticus",
  "first and only", "know no fear", "soul hunter", "space wolf", "brothers of the snake",
];

const WHFANTASY_BOOK_KEYWORDS = [
  "old world", "age of sigmar", "gotrek", "felix", "skaven", "lizardmen",
  "sigmar", "chaos warriors", "empire of man", "warhammer fantasy",
  "mordheim", "blood bowl", "trollslayer", "skavenslayer", "daemonslayer",
  "dragonslayer", "beastslayer", "vampireslayer", "orcs", "dark elves",
  "bretonnia", "lustria", "nagash", "malign portents",
];

function classifyBook(title: string, desc: string, publisher: string): "40k" | "fantasy" | null {
  const text = (title + " " + desc + " " + publisher).toLowerCase();
  const isBlackLibrary = publisher.toLowerCase().includes("black library") ||
    publisher.toLowerCase().includes("games workshop");

  let score40k = WH40K_BOOK_KEYWORDS.filter((kw) => text.includes(kw)).length;
  let scoreFantasy = WHFANTASY_BOOK_KEYWORDS.filter((kw) => text.includes(kw)).length;

  // Black Library publishes both; publisher alone = weak signal
  if (isBlackLibrary && score40k === 0 && scoreFantasy === 0) {
    // Check title-level keywords
    const t = title.toLowerCase();
    if (t.includes("40") || t.includes("space") || t.includes("heresy") ||
        t.includes("imperium") || t.includes("primarch") || t.includes("astartes")) {
      score40k += 2;
    } else if (t.includes("fantasy") || t.includes("gotrek") || t.includes("skaven") ||
               t.includes("sigmar") || t.includes("old world")) {
      scoreFantasy += 2;
    }
  }

  if (score40k === 0 && scoreFantasy === 0) return null;
  if (score40k >= scoreFantasy) return "40k";
  return "fantasy";
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function linkItem(prisma: PrismaClient, franchiseId: number, itemId: number, addedBy = "manual") {
  if (DRY_RUN) return;
  try {
    await (prisma as any).franchiseItem.upsert({
      where: { franchiseId_itemId: { franchiseId, itemId } },
      create: { franchiseId, itemId, addedBy },
      update: {},
    });
  } catch (e: any) {
    // If composite key name differs, try create with catch
    try {
      await (prisma as any).franchiseItem.create({
        data: { franchiseId, itemId, addedBy },
      });
    } catch { /* already linked */ }
  }
}

async function upsertGame(prisma: PrismaClient, data: ReturnType<typeof mapIgdbGame>) {
  // Check by igdbId first
  const existing = await (prisma as any).item.findFirst({
    where: { igdbId: data.igdbId },
    select: { id: true },
  });
  if (existing) return { id: existing.id, wasNew: false };

  // Check by title + year
  const byTitle = await (prisma as any).item.findFirst({
    where: { title: data.title, year: data.year, type: "game" },
    select: { id: true },
  });
  if (byTitle) {
    // Update igdbId if missing
    await (prisma as any).item.update({
      where: { id: byTitle.id },
      data: { igdbId: data.igdbId },
    });
    return { id: byTitle.id, wasNew: false };
  }

  if (!data.cover) return null; // Skip games with no cover
  if (DRY_RUN) {
    console.log(`  [DRY] Would add game: "${data.title}" (${data.year})`);
    return { id: -1, wasNew: true };
  }

  const item = await (prisma as any).item.create({
    data: {
      title: data.title,
      type: data.type,
      genre: data.genre,
      vibes: data.vibes,
      year: data.year,
      cover: data.cover,
      description: data.description,
      people: data.people,
      awards: [],
      platforms: data.platforms,
      ext: data.ext,
      totalEp: 0,
      igdbId: data.igdbId,
      steamAppId: data.steamAppId,
      voteCount: data.voteCount,
      popularityScore: data.voteCount,
      isUpcoming: data.year > 2025,
    },
  });
  return { id: item.id, wasNew: true };
}

async function upsertBook(
  prisma: PrismaClient,
  mapped: NonNullable<ReturnType<typeof mapGBook>>
) {
  // Check by googleBooksId
  const byGbId = await (prisma as any).item.findFirst({
    where: { googleBooksId: mapped.googleBooksId },
    select: { id: true },
  });
  if (byGbId) return { id: byGbId.id, wasNew: false };

  // Check by title + year
  const byTitle = await (prisma as any).item.findFirst({
    where: { title: mapped.title, year: mapped.year, type: "book" },
    select: { id: true },
  });
  if (byTitle) {
    await (prisma as any).item.update({
      where: { id: byTitle.id },
      data: { googleBooksId: mapped.googleBooksId },
    });
    return { id: byTitle.id, wasNew: false };
  }

  if (!mapped.cover) return null; // Skip books with no cover
  if (DRY_RUN) {
    console.log(`  [DRY] Would add book: "${mapped.title}" (${mapped.year})`);
    return { id: -1, wasNew: true };
  }

  const item = await (prisma as any).item.create({
    data: {
      title: mapped.title,
      type: "book",
      genre: ["Science Fiction"],
      vibes: ["dark", "epic"],
      year: mapped.year,
      cover: mapped.cover,
      description: mapped.description,
      people: mapped.people,
      awards: [],
      platforms: ["kindle", "bookshop", "google_books", "library"],
      ext: mapped.ext,
      totalEp: 0,
      googleBooksId: mapped.googleBooksId,
      voteCount: 0,
      popularityScore: 0,
    },
  });
  return { id: item.id, wasNew: true };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const stats = {
    gamesAdded40k: 0, gamesLinked40k: 0,
    gamesAddedFantasy: 0, gamesLinkedFantasy: 0,
    booksAdded40k: 0, booksLinked40k: 0,
    booksAddedFantasy: 0, booksLinkedFantasy: 0,
    skipped: 0,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1: Franchise hierarchy
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n=== STEP 1: Franchise hierarchy ===");

  // Parent: Warhammer universe
  let parentWH = await (prisma as any).franchise.findFirst({ where: { name: "Warhammer" } });
  if (!parentWH) {
    if (!DRY_RUN) {
      parentWH = await (prisma as any).franchise.create({
        data: {
          name: "Warhammer",
          icon: "⚔️",
          description: "The Warhammer universe — a vast tabletop, video game, and fiction franchise from Games Workshop spanning the grimdark far future (Warhammer 40,000) and the dark fantasy Old World (Warhammer Fantasy / Age of Sigmar).",
          confidenceTier: 1,
          autoGenerated: false,
        },
      });
      console.log(`  Created parent franchise: Warhammer (id ${parentWH.id})`);
    } else {
      console.log("  [DRY] Would create parent franchise: Warhammer");
      parentWH = { id: -1 };
    }
  } else {
    console.log(`  Parent franchise already exists: Warhammer (id ${parentWH.id})`);
  }

  // Child: Warhammer Fantasy / The Old World
  let fantasyFranchise = await (prisma as any).franchise.findFirst({
    where: { name: { contains: "Warhammer Fantasy" } },
  });
  if (!fantasyFranchise) {
    if (!DRY_RUN) {
      fantasyFranchise = await (prisma as any).franchise.create({
        data: {
          name: "Warhammer Fantasy / The Old World",
          icon: "🐉",
          description: "Dark fantasy world of the Old World and Age of Sigmar. Home of Gotrek & Felix, the Empire, Skaven, and more — spanning tabletop, video games, and Black Library fiction.",
          parentFranchiseId: parentWH.id,
          confidenceTier: 1,
          autoGenerated: false,
        },
      });
      console.log(`  Created franchise: Warhammer Fantasy / The Old World (id ${fantasyFranchise.id})`);
    } else {
      console.log("  [DRY] Would create franchise: Warhammer Fantasy / The Old World");
      fantasyFranchise = { id: -2 };
    }
  } else {
    console.log(`  Fantasy franchise already exists (id ${fantasyFranchise.id})`);
  }

  // Update Warhammer 40,000 (id 578) with parent + description + icon
  const wh40k = await (prisma as any).franchise.findUnique({ where: { id: 578 } });
  if (wh40k) {
    if (!DRY_RUN) {
      await (prisma as any).franchise.update({
        where: { id: 578 },
        data: {
          icon: "☠️",
          description: "In the grim darkness of the far future, there is only war. The Warhammer 40,000 universe spans hundreds of video games, thousands of novels, and one of the most expansive science-fiction settings ever created.",
          parentFranchiseId: parentWH.id,
          confidenceTier: 1,
          autoGenerated: false,
        },
      });
    }
    console.log(`  Updated Warhammer 40,000 (id 578) with parent + description`);
  } else {
    console.log("  !! Warhammer 40,000 franchise (id 578) NOT FOUND");
  }

  const franchise40kId = 578;
  const franchiseFantasyId = fantasyFranchise.id;

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: Link existing items
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n=== STEP 2: Linking existing items ===");

  const existingLinks: Array<{ itemId: number; franchiseId: number; label: string }> = [
    // 40K
    { itemId: 11765, franchiseId: franchise40kId, label: "Warhammer 40,000: Dawn of War" },
    { itemId: 9556,  franchiseId: franchise40kId, label: "Warhammer Survivors" },
    // Already linked but make sure:
    { itemId: 2386,  franchiseId: franchise40kId, label: "Lorehammer podcast" },
    // Fantasy
    { itemId: 11999, franchiseId: franchiseFantasyId, label: "Warhammer: Vermintide 2" },
    { itemId: 9492,  franchiseId: franchiseFantasyId, label: "Warhammer: Chaosbane" },
    { itemId: 8591,  franchiseId: franchiseFantasyId, label: "Warhammer: Dark Omen" },
  ];

  // Remove Lorehammer from Fantasy if it was wrongly linked (it's in 40K)
  // And remove Fantasy games from 40K if they were wrongly linked
  for (const link of existingLinks) {
    const wrongFranchiseId = link.franchiseId === franchise40kId ? franchiseFantasyId : franchise40kId;
    if (!DRY_RUN) {
      try {
        await (prisma as any).franchiseItem.deleteMany({
          where: { itemId: link.itemId, franchiseId: wrongFranchiseId },
        });
      } catch { /* ok */ }
      await linkItem(prisma as any, link.franchiseId, link.itemId, "manual");
    }
    console.log(`  Linked: "${link.label}" → ${link.franchiseId === franchise40kId ? "40K" : "Fantasy"}`);
  }

  if (BOOKS_ONLY) {
    console.log("\n  (skipping game steps — --books-only)");
  } else {
    // ────────────────────────────────────────────────────────────────────────
    // STEP 3: Add 40K games from IGDB
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n=== STEP 3: Fetching 40K games from IGDB ===");

    const specific40kTitles = [
      "Warhammer 40,000: Space Marine",
      "Warhammer 40,000: Space Marine 2",
      "Warhammer 40,000: Darktide",
      "Warhammer 40,000: Mechanicus",
      "Warhammer 40,000: Boltgun",
      "Battlefleet Gothic: Armada",
      "Battlefleet Gothic: Armada 2",
      "Necromunda: Hired Gun",
      "Necromunda: Underhive Wars",
      "Warhammer 40,000: Gladius - Relics of War",
      "Warhammer 40,000: Inquisitor - Martyr",
      "Warhammer 40,000: Rogue Trader",
      "Warhammer 40,000: Chaos Gate - Daemonhunters",
      "Warhammer 40,000: Battlesector",
      "Warhammer 40,000: Dawn of War II",
      "Warhammer 40,000: Dawn of War III",
      "Warhammer 40,000: Eternal Crusade",
      "Warhammer 40,000: Fire Warrior",
      "Warhammer 40,000: Kill Team",
    ];

    const seen40kIgdbIds = new Set<number>();

    for (const title of specific40kTitles) {
      const results = await igdbSearchByTitle(title);
      // Find best match: exact or starts-with title
      const best = results.find((g: any) =>
        g.name.toLowerCase() === title.toLowerCase()
      ) || results.find((g: any) =>
        g.name.toLowerCase().includes(title.toLowerCase().replace("warhammer 40,000: ", "").slice(0, 10))
      ) || results[0];

      if (!best) { console.log(`  NOT FOUND: ${title}`); continue; }
      if (seen40kIgdbIds.has(best.id)) continue;
      seen40kIgdbIds.add(best.id);

      const mapped = mapIgdbGame(best);
      const result = await upsertGame(prisma as any, mapped);
      if (!result) { stats.skipped++; continue; }

      await linkItem(prisma as any, franchise40kId, result.id, "manual");
      if (result.wasNew) {
        stats.gamesAdded40k++;
        console.log(`  ADDED: "${mapped.title}" (${mapped.year}) id=${result.id}`);
      } else {
        stats.gamesLinked40k++;
        console.log(`  LINKED (existing): "${mapped.title}" (${mapped.year}) id=${result.id}`);
      }
    }

    // Broad IGDB search for "Warhammer 40" and "Warhammer 40,000"
    console.log("\n  Broad IGDB search: 'Warhammer 40'...");
    const broadResults = await igdbSearchContains("Warhammer 40", 50);
    for (const g of broadResults) {
      if (seen40kIgdbIds.has(g.id)) continue;
      if (!classify40KGame(g.name)) continue;
      seen40kIgdbIds.add(g.id);

      const mapped = mapIgdbGame(g);
      const result = await upsertGame(prisma as any, mapped);
      if (!result) { stats.skipped++; continue; }

      await linkItem(prisma as any, franchise40kId, result.id, "auto_pattern");
      if (result.wasNew) {
        stats.gamesAdded40k++;
        console.log(`  ADDED (broad): "${mapped.title}" (${mapped.year})`);
      } else {
        stats.gamesLinked40k++;
        console.log(`  LINKED (broad, existing): "${mapped.title}" (${mapped.year})`);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 4: Add Fantasy games from IGDB
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n=== STEP 4: Fetching Fantasy games from IGDB ===");

    const specificFantasyTitles = [
      "Total War: Warhammer",
      "Total War: Warhammer II",
      "Total War: Warhammer III",
      "Warhammer: End Times - Vermintide",
      "Mordheim: City of the Damned",
      "Blood Bowl",
      "Blood Bowl 2",
      "Blood Bowl 3",
      "Warhammer: Mark of Chaos",
      "Warhammer: Shadow of the Horned Rat",
      "Warhammer: Dark Omen",
      "Warhammer Age of Sigmar: Storm Ground",
      "Warhammer Age of Sigmar: Realms of Ruin",
      "Warhammer Underworlds: Online",
      "Warcry: Red Harvest",
    ];

    const seenFantasyIgdbIds = new Set<number>();

    for (const title of specificFantasyTitles) {
      const results = await igdbSearchByTitle(title);
      const best = results.find((g: any) =>
        g.name.toLowerCase() === title.toLowerCase()
      ) || results.find((g: any) =>
        g.name.toLowerCase().includes(
          title.toLowerCase().replace("total war: ", "").replace("warhammer: ", "").slice(0, 12)
        )
      ) || results[0];

      if (!best) { console.log(`  NOT FOUND: ${title}`); continue; }
      if (seenFantasyIgdbIds.has(best.id)) continue;
      seenFantasyIgdbIds.add(best.id);

      const mapped = mapIgdbGame(best);
      const result = await upsertGame(prisma as any, mapped);
      if (!result) { stats.skipped++; continue; }

      await linkItem(prisma as any, franchiseFantasyId, result.id, "manual");
      if (result.wasNew) {
        stats.gamesAddedFantasy++;
        console.log(`  ADDED: "${mapped.title}" (${mapped.year}) id=${result.id}`);
      } else {
        stats.gamesLinkedFantasy++;
        console.log(`  LINKED (existing): "${mapped.title}" (${mapped.year}) id=${result.id}`);
      }
    }
  } // end !BOOKS_ONLY

  if (GAMES_ONLY) {
    console.log("\n  (skipping book steps — --games-only)");
  } else {
    // ────────────────────────────────────────────────────────────────────────
    // STEP 5 & 5B: Add 40K books from Google Books
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n=== STEP 5: Fetching 40K books from Google Books ===");

    const specific40kBooks = [
      // Horus Heresy
      { title: "Horus Rising", author: "Dan Abnett" },
      { title: "False Gods", author: "Graham McNeill" },
      { title: "Galaxy in Flames", author: "Ben Counter" },
      { title: "The Flight of the Eisenstein", author: "James Swallow" },
      { title: "Fulgrim", author: "Graham McNeill" },
      { title: "A Thousand Sons", author: "Graham McNeill" },
      { title: "The First Heretic", author: "Aaron Dembski-Bowden" },
      { title: "Know No Fear", author: "Dan Abnett" },
      { title: "Betrayer", author: "Aaron Dembski-Bowden" },
      { title: "The Master of Mankind", author: "Aaron Dembski-Bowden" },
      // Eisenhorn
      { title: "Eisenhorn: Xenos", author: "Dan Abnett" },
      { title: "Eisenhorn: Malleus", author: "Dan Abnett" },
      { title: "Eisenhorn: Hereticus", author: "Dan Abnett" },
      // Gaunt's Ghosts
      { title: "Gaunt's Ghosts: First and Only", author: "Dan Abnett" },
      { title: "Gaunt's Ghosts: Ghostmaker", author: "Dan Abnett" },
      { title: "Gaunt's Ghosts: Necropolis", author: "Dan Abnett" },
      { title: "Gaunt's Ghosts: Honour Guard", author: "Dan Abnett" },
      { title: "The Guns of Tanith", author: "Dan Abnett" },
      { title: "Straight Silver", author: "Dan Abnett" },
      { title: "Sabbat Martyr", author: "Dan Abnett" },
      // Ciaphas Cain
      { title: "Ciaphas Cain: For the Emperor", author: "Sandy Mitchell" },
      { title: "Ciaphas Cain: Caves of Ice", author: "Sandy Mitchell" },
      { title: "Ciaphas Cain: The Traitor's Hand", author: "Sandy Mitchell" },
      // Night Lords
      { title: "Night Lords: Soul Hunter", author: "Aaron Dembski-Bowden" },
      { title: "Night Lords: Blood Reaver", author: "Aaron Dembski-Bowden" },
      { title: "Night Lords: Void Stalker", author: "Aaron Dembski-Bowden" },
      // Others
      { title: "Space Wolf", author: "William King" },
      { title: "Fifteen Hours", author: "Mitchel Scanlon" },
      { title: "Brothers of the Snake", author: "Dan Abnett" },
    ];

    const seenGbookIds = new Set<string>();
    const seenBookTitleYear = new Set<string>();

    const addBook = async (v: any, franchise: "40k" | "fantasy") => {
      const mapped = mapGBook(v);
      if (!mapped) return;
      if (seenGbookIds.has(mapped.googleBooksId)) return;
      if (seenBookTitleYear.has(`${mapped.title.toLowerCase()}-${mapped.year}`)) return;
      seenGbookIds.add(mapped.googleBooksId);
      seenBookTitleYear.add(`${mapped.title.toLowerCase()}-${mapped.year}`);

      if (!mapped.cover) { stats.skipped++; return; }

      const result = await upsertBook(prisma as any, mapped);
      if (!result) { stats.skipped++; return; }

      const fid = franchise === "40k" ? franchise40kId : franchiseFantasyId;
      await linkItem(prisma as any, fid, result.id, "manual");

      if (result.wasNew) {
        if (franchise === "40k") { stats.booksAdded40k++; }
        else { stats.booksAddedFantasy++; }
        console.log(`  ADDED (${franchise}): "${mapped.title}" (${mapped.year})`);
      } else {
        if (franchise === "40k") { stats.booksLinked40k++; }
        else { stats.booksLinkedFantasy++; }
        console.log(`  LINKED (${franchise}, existing): "${mapped.title}" (${mapped.year})`);
      }
    };

    // Search for each specific 40K book
    for (const book of specific40kBooks) {
      const query = `intitle:${book.title} inauthor:${book.author} Black Library`;
      const results = await gbooksSearch(query, 5);
      const best = results.find((v: any) => {
        const t = (v.volumeInfo?.title || "").toLowerCase();
        return t.includes(book.title.toLowerCase().split(":").pop()!.trim().slice(0, 10));
      }) || results[0];
      if (best) await addBook(best, "40k");
      else console.log(`  NOT FOUND: ${book.title}`);
      await sleep(120);
    }

    // Broad searches for 40K books
    console.log("\n  Broad book search: 'Warhammer 40,000 Black Library'...");
    const broadBookQueries40k = [
      "Warhammer 40000 Black Library",
      "Horus Heresy Warhammer",
      "Gaunt Ghosts Warhammer",
      "Ciaphas Cain Warhammer",
      "Space Marine Battles Warhammer",
      "Siege of Terra Warhammer",
      "Primarchs Warhammer 40000",
    ];

    for (const q of broadBookQueries40k) {
      const results = await gbooksSearch(q, 40);
      for (const v of results) {
        const mapped = mapGBook(v);
        if (!mapped) continue;
        const classification = classifyBook(mapped.title, mapped.description, mapped.publisher);
        if (classification === "40k") await addBook(v, "40k");
        else if (classification === "fantasy") {
          // Catch any fantasy books that appear in broad 40K searches
          await addBook(v, "fantasy");
        }
      }
      await sleep(200);
    }

    // ────────────────────────────────────────────────────────────────────────
    // STEP 6: Add Fantasy books from Google Books
    // ────────────────────────────────────────────────────────────────────────
    console.log("\n=== STEP 6: Fetching Fantasy books from Google Books ===");

    const specificFantasyBooks = [
      { title: "Trollslayer", author: "William King" },
      { title: "Skavenslayer", author: "William King" },
      { title: "Daemonslayer", author: "William King" },
      { title: "Dragonslayer", author: "William King" },
      { title: "Beastslayer", author: "William King" },
      { title: "Vampireslayer", author: "William King" },
      { title: "Giantslayer", author: "William King" },
      { title: "Orcslayer", author: "Nathan Long" },
      { title: "Manslayer", author: "Nathan Long" },
      { title: "Elfslayer", author: "Nathan Long" },
      { title: "Shamanslayer", author: "Nathan Long" },
      { title: "Zombieslayer", author: "Nathan Long" },
    ];

    for (const book of specificFantasyBooks) {
      const query = `intitle:${book.title} inauthor:${book.author} Warhammer`;
      const results = await gbooksSearch(query, 5);
      const best = results.find((v: any) => {
        const t = (v.volumeInfo?.title || "").toLowerCase();
        return t.includes(book.title.toLowerCase().slice(0, 8));
      }) || results[0];
      if (best) await addBook(best, "fantasy");
      else console.log(`  NOT FOUND: ${book.title}`);
      await sleep(120);
    }

    // Broad Fantasy book searches
    console.log("\n  Broad book search: 'Warhammer Fantasy Black Library'...");
    const broadBookQueriesFantasy = [
      "Warhammer Fantasy Black Library",
      "Gotrek Felix Warhammer",
      "Age of Sigmar Black Library",
      "Warhammer Chronicles Black Library",
      "Warhammer Old World novel",
    ];

    for (const q of broadBookQueriesFantasy) {
      const results = await gbooksSearch(q, 40);
      for (const v of results) {
        const mapped = mapGBook(v);
        if (!mapped) continue;
        const classification = classifyBook(mapped.title, mapped.description, mapped.publisher);
        if (classification === "fantasy") await addBook(v, "fantasy");
        else if (classification === "40k") await addBook(v, "40k");
      }
      await sleep(200);
    }
  } // end !GAMES_ONLY

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 7: Final count verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n=== STEP 7: Verification ===");

  const count40k = await (prisma as any).franchiseItem.count({ where: { franchiseId: franchise40kId } });
  const countFantasy = await (prisma as any).franchiseItem.count({ where: { franchiseId: franchiseFantasyId } });
  const countParent = await (prisma as any).franchise.count({ where: { parentFranchiseId: parentWH.id } });

  const items40k = await (prisma as any).franchiseItem.findMany({
    where: { franchiseId: franchise40kId },
    include: { item: { select: { title: true, type: true, year: true } } },
  });
  const itemsFantasy = await (prisma as any).franchiseItem.findMany({
    where: { franchiseId: franchiseFantasyId },
    include: { item: { select: { title: true, type: true, year: true } } },
  });

  const byType40k = items40k.reduce((acc: any, fi: any) => {
    const t = fi.item?.type || "unknown";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const byTypeFantasy = itemsFantasy.reduce((acc: any, fi: any) => {
    const t = fi.item?.type || "unknown";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  console.log(`\nWarhammer 40,000 (id ${franchise40kId}): ${count40k} total items`);
  Object.entries(byType40k).forEach(([t, n]) => console.log(`  ${t}: ${n}`));

  console.log(`\nWarhammer Fantasy (id ${franchiseFantasyId}): ${countFantasy} total items`);
  Object.entries(byTypeFantasy).forEach(([t, n]) => console.log(`  ${t}: ${n}`));

  console.log(`\nParent "Warhammer" franchise has ${countParent} child franchise(s)`);

  console.log("\n=== SUMMARY ===");
  console.log(`  Games added (40K): ${stats.gamesAdded40k}`);
  console.log(`  Games linked (40K, already existed): ${stats.gamesLinked40k}`);
  console.log(`  Games added (Fantasy): ${stats.gamesAddedFantasy}`);
  console.log(`  Games linked (Fantasy, already existed): ${stats.gamesLinkedFantasy}`);
  console.log(`  Books added (40K): ${stats.booksAdded40k}`);
  console.log(`  Books linked (40K, already existed): ${stats.booksLinked40k}`);
  console.log(`  Books added (Fantasy): ${stats.booksAddedFantasy}`);
  console.log(`  Books linked (Fantasy, already existed): ${stats.booksLinkedFantasy}`);
  console.log(`  Skipped (no cover/data): ${stats.skipped}`);
  if (DRY_RUN) console.log("\n  ** DRY RUN — no changes written **");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
