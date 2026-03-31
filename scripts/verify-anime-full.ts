/**
 * Full verification of isAnime() after all fixes.
 * Mirrors the logic in src/lib/anime.ts exactly.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

const WESTERN_ANIMATION_DIRECTORS = new Set([
  "john lasseter","pete docter","lee unkrich","brad bird","andrew stanton","dan scanlon",
  "domee shi","enrico casarosa","kelly marie tran","roger allers","rob minkoff",
  "ron clements","john musker","jennifer lee","chris buck","byron howard","rich moore",
  "don hall","carlos lópez estrada","andrew adamson","vicky jenson","kelly asbury",
  "cody cameron","mark dindal","eric darnell","tim johnson",
  "genndy tartakovsky","pendleton ward","rebecca sugar","alex hirsch",
  "justin roiland","dan harmon","michael dante dimartino","bryan konietzko","christian linke",
]);

const WESTERN_TITLE_PATTERNS = [
  /\btoy story\b/i,/\bthe lion king\b/i,/\bfinding (nemo|dory)\b/i,/\bfrozen( ii| 2)?\b/i,
  /\bshrek\b/i,/\bthe incredibles\b/i,/\binside out( 2)?\b/i,/\bmoana( 2)?\b/i,
  /\bratatouille\b/i,/\bwall-?e\b/i,/\bzootopia\b/i,/\bcoco\b/i,/^soul(\s+\(\d{4}\))?$/i,
  /\bluca\b/i,/\bturning red\b/i,/\bencanto\b/i,/\bbluey\b/i,
  /\bavatar: the last airbender\b/i,/\bthe legend of korra\b/i,/\bgravity falls\b/i,
  /\brick and morty\b/i,/\barcane\b/i,/\binvincible\b/i,
  /\bbatman: the animated series\b/i,/\bteen titans go\b/i,/\bregular show\b/i,
  /\bprimal\b/i,/\bsteven universe\b/i,/\badventure time\b/i,/\bpuss in boots\b/i,
  /\bklaus\b/i,/\bspider-man: (into|across) the spider-verse\b/i,
  /\bstar wars[: ].*(resistance|rebels|clone wars)\b/i,
];

function isAnime(item: any): boolean {
  if (item.type !== "tv" && item.type !== "movie") return false;
  const ext = item.ext as Record<string, any> | null;
  const passesCheck = (item.genre?.includes("Anime") ?? false) || (ext?.mal != null);
  if (!passesCheck) return false;
  if (item.people?.length > 0) {
    const keyRoles = item.people.filter((p: any) => ["Director","Creator","Directors","Creators"].includes(p.role));
    if (keyRoles.some((p: any) => WESTERN_ANIMATION_DIRECTORS.has(p.name.toLowerCase()))) return false;
  }
  if (item.title && WESTERN_TITLE_PATTERNS.some((p) => p.test(item.title))) return false;
  return true;
}

const CHECKS: { title: string; shouldBeAnime: boolean }[] = [
  // Must show ANIME badge
  { title: "Attack on Titan", shouldBeAnime: true },
  { title: "Death Note", shouldBeAnime: true },
  { title: "Fullmetal Alchemist: Brotherhood", shouldBeAnime: true },
  { title: "Spirited Away", shouldBeAnime: true },
  { title: "Dragon Ball Z", shouldBeAnime: true },
  { title: "Naruto", shouldBeAnime: true },
  { title: "One Piece", shouldBeAnime: true },
  { title: "Cowboy Bebop", shouldBeAnime: true },
  { title: "Chainsaw Man", shouldBeAnime: true },
  { title: "My Neighbor Totoro", shouldBeAnime: true },
  { title: "Bleach", shouldBeAnime: true },
  { title: "Soul Land 2", shouldBeAnime: true },
  // Must NOT show ANIME badge
  { title: "The Lion King", shouldBeAnime: false },
  { title: "Toy Story", shouldBeAnime: false },
  { title: "Finding Nemo", shouldBeAnime: false },
  { title: "Frozen", shouldBeAnime: false },
  { title: "Shrek", shouldBeAnime: false },
  { title: "The Incredibles", shouldBeAnime: false },
  { title: "Coco", shouldBeAnime: false },
  { title: "Moana", shouldBeAnime: false },
  { title: "Soul", shouldBeAnime: false },  // Pixar Soul
  { title: "Spider-Man: Into the Spider-Verse", shouldBeAnime: false },
  { title: "Avatar: The Last Airbender", shouldBeAnime: false },
  { title: "Gravity Falls", shouldBeAnime: false },
  { title: "Rick and Morty", shouldBeAnime: false },
  { title: "Bluey", shouldBeAnime: false },
  { title: "Primal", shouldBeAnime: false },
  { title: "Arcane", shouldBeAnime: false },
  { title: "Batman: The Animated Series", shouldBeAnime: false },
  { title: "The Dark Knight", shouldBeAnime: false },
];

async function main() {
  let passed = 0; let failed = 0;
  for (const check of CHECKS) {
    const item = await prisma.item.findFirst({
      where: {
        ...(check.title === "Soul"
          ? { title: { equals: "Soul", mode: "insensitive" as const } }
          : { title: { contains: check.title, mode: "insensitive" as const } }),
        type: { in: ["tv","movie"] }, parentItemId: null,
      },
      select: { id: true, title: true, type: true, genre: true, malId: true, ext: true, people: true },
      orderBy: { voteCount: "desc" },
    });
    if (!item) { console.log(`  [NOT FOUND] ${check.title}`); continue; }
    const anime = isAnime(item);
    const ext = item.ext as any;
    const ok = anime === check.shouldBeAnime;
    if (ok) passed++; else failed++;
    const icon = ok ? "✓" : "✗ WRONG";
    const expect = check.shouldBeAnime ? "ANIME" : "NOT  ";
    const why = anime
      ? ext?.mal != null ? `ext.mal=${ext.mal}` : `Anime genre`
      : anime === false && (item.genre as string[])?.includes("Anime") ? "vetoed by title/director" : "no signal";
    console.log(`  ${icon} [${expect}] [${item.id}] ${item.title} (${item.type}) | malId=${item.malId} extMal=${ext?.mal ?? "null"} | ${why}`);
  }

  const total = await prisma.item.count({ where: { type: { in: ["tv","movie"] }, genre: { has: "Anime" }, parentItemId: null } });
  const extMalTotal = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count FROM items WHERE type IN ('tv','movie') AND (ext->>'mal') IS NOT NULL AND parent_item_id IS NULL
  `;
  console.log(`\n  Passed: ${passed}/${passed + failed}`);
  console.log(`  Total Anime genre items: ${total}`);
  console.log(`  Total ext.mal items: ${extMalTotal[0].count}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
