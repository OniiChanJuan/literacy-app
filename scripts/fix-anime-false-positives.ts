/**
 * Fix false positive anime tags and missing anime tags.
 *
 * FALSE POSITIVES: Items that got 'Anime' genre from the backfill but are
 * clearly Western animation (Pixar, Disney, etc.) that happen to be in MAL.
 *
 * MISSING: Items that are anime but have no malId (e.g. Spirited Away imported
 * from TMDB without MAL cross-reference) — add 'Anime' manually.
 *
 * Run: npx tsx scripts/fix-anime-false-positives.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

// ── REMOVE 'Anime' from these Western animated items ───────────────────────
// These are in MAL but are NOT Japanese anime — they passed the backfill filter
// because their TMDB genres include mature terms like "Adventure"
const FALSE_POSITIVE_PATTERNS = [
  "Toy Story",
  "Annabelle's Wish",
  "Once Upon a Studio",
  "Klaus",
  "Puss in Boots",
  "Coco",            // Pixar
  "Moana",           // Disney
  "Encanto",         // Disney
  "Turning Red",     // Pixar
  "Soul",            // Pixar
  "Onward",          // Pixar
  "Luca",            // Pixar
];

// ── ADD 'Anime' to these known anime items that have no malId ──────────────
// These are well-known anime missing 'Anime' genre (TMDB-sourced, not cross-referenced)
const KNOWN_ANIME_TITLES = [
  "Spirited Away",
  "My Neighbor Totoro",
  "Princess Mononoke",
  "Nausicaä of the Valley of the Wind",
  "Castle in the Sky",
  "Howl's Moving Castle",
  "Porco Rosso",
  "The Wind Rises",
  "Kiki's Delivery Service",
  "Akira",
  "Ghost in the Shell",         // original 1995 film
  "Grave of the Fireflies",
  "Paprika",
  "Millennium Actress",
  "Tokyo Godfathers",
];

async function main() {
  console.log("=== Fixing anime false positives and missing tags ===\n");

  let removed = 0;
  let added = 0;

  // ── Remove false positives ──────────────────────────────────────────────
  console.log("── Removing 'Anime' from Western animation ──");
  for (const pattern of FALSE_POSITIVE_PATTERNS) {
    const items = await prisma.item.findMany({
      where: {
        title: { contains: pattern, mode: "insensitive" },
        genre: { has: "Anime" },
        type: { in: ["tv", "movie"] },
        parentItemId: null,
      },
      select: { id: true, title: true, genre: true },
    });
    for (const item of items) {
      const newGenre = item.genre.filter((g) => g !== "Anime");
      await prisma.item.update({ where: { id: item.id }, data: { genre: newGenre } });
      console.log(`  REMOVED 'Anime' from [${item.id}] ${item.title}`);
      removed++;
    }
  }

  // ── Add 'Anime' to known anime missing the tag ──────────────────────────
  console.log("\n── Adding 'Anime' to known anime (no malId cross-reference) ──");
  for (const title of KNOWN_ANIME_TITLES) {
    const items = await prisma.item.findMany({
      where: {
        title: { contains: title, mode: "insensitive" },
        NOT: { genre: { has: "Anime" } },
        type: { in: ["tv", "movie"] },
        parentItemId: null,
      },
      select: { id: true, title: true, genre: true, malId: true },
    });
    for (const item of items) {
      // Only add if title closely matches (avoid substring false matches)
      const t = item.title.toLowerCase();
      const s = title.toLowerCase();
      const isMatch = t === s || t.startsWith(s) || s.startsWith(t.split(":")[0].trim());
      if (!isMatch) continue;

      await prisma.item.update({
        where: { id: item.id },
        data: { genre: [...item.genre, "Anime"] },
      });
      console.log(`  ADDED 'Anime' to [${item.id}] ${item.title} (malId=${item.malId})`);
      added++;
    }
  }

  console.log(`\n=== Done: removed ${removed} false positives, added ${added} missing ===`);

  // Final spot checks
  console.log("\n── Final spot checks ──");
  const finalChecks = [
    "Attack on Titan", "Death Note", "Fullmetal Alchemist",
    "One Piece", "Spirited Away", "Toy Story", "The Dark Knight", "Bluey",
  ];
  for (const t of finalChecks) {
    const item = await prisma.item.findFirst({
      where: { title: { contains: t, mode: "insensitive" }, parentItemId: null, type: { in: ["tv","movie"] } },
      select: { title: true, genre: true, malId: true, type: true },
      orderBy: { voteCount: "desc" },
    });
    if (item) {
      const anime = item.genre.includes("Anime") || (item.malId != null && item.genre.includes("Animation"));
      console.log(`  ${anime ? "✓ ANIME  " : "  NOT    "} ${item.title} (${item.type})`);
    }
  }

  const total = await prisma.item.count({ where: { type: { in: ["tv","movie"] }, genre: { has: "Anime" } } });
  console.log(`\nTotal items with 'Anime' genre: ${total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
