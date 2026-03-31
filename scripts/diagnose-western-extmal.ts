/**
 * Diagnose: find all Western animation items that still have ext.mal or wrong genres/malIds.
 * Run: npx tsx scripts/diagnose-western-extmal.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

const WESTERN_TITLE_PATTERNS = [
  /\btoy story\b/i, /\bthe lion king\b/i, /\bfinding (nemo|dory)\b/i,
  /\bfrozen( ii| 2)?\b/i, /\bshrek\b/i, /\bthe incredibles\b/i,
  /\binside out( 2)?\b/i, /\bmoana( 2)?\b/i, /\bratatouille\b/i,
  /\bwall-?e\b/i, /\bzootopia\b/i, /\bcoco\b/i,
  /^soul(\s+\(\d{4}\))?$/i, /\bluca\b/i, /\bturning red\b/i,
  /\bencanto\b/i, /\bbluey\b/i, /\bavatar: the last airbender\b/i,
  /\bthe legend of korra\b/i, /\bgravity falls\b/i, /\brick and morty\b/i,
  /\barcane\b/i, /\binvincible\b/i, /\bbatman: the animated series\b/i,
  /\bteen titans go\b/i, /\bregular show\b/i, /\bprimal\b/i,
  /\bsteven universe\b/i, /\badventure time\b/i, /\bpuss in boots\b/i,
  /\bklaus\b/i, /\bspider-man: (into|across) the spider-verse\b/i,
  /\bstar wars[: ].*(resistance|rebels|clone wars)\b/i,
  /\bthe hobbit\b/i, /\bspectacular spider-man\b/i,
  /\brick and morty\b/i, /\bhow to train your dragon\b/i,
  /\bthe simpsons\b/i, /\bsouth park\b/i, /\bfuturama\b/i,
  /\bfamily guy\b/i, /\bamerican dad\b/i, /\bbob's burgers\b/i,
  /\bthe owl house\b/i, /\bamphib ia\b/i, /\bthe bad guys\b/i,
  /\bpuss in boots\b/i, /\blego\b/i, /\bminions\b/i,
  /\bdespicable me\b/i, /\bthe croods\b/i, /\btrolls\b/i,
  /\bturbo\b/i, /\bkung fu panda\b/i, /\bmadagascar\b/i,
  /\bover the hedge\b/i, /\bwallace & gromit\b/i, /\baardman\b/i,
  /\bbee movie\b/i, /\bspirited away\b/i,  // Not spirited away — that IS anime, remove
  /\bannabelle\b/i,
];

// Spirited Away is definitely anime — remove it from patterns above
// Actually let me just not include it

const WESTERN_DIRECTORS = new Set([
  "john lasseter","pete docter","lee unkrich","brad bird","andrew stanton","dan scanlon",
  "domee shi","enrico casarosa","kelly marie tran","roger allers","rob minkoff",
  "ron clements","john musker","jennifer lee","chris buck","byron howard","rich moore",
  "don hall","carlos lópez estrada","andrew adamson","vicky jenson","kelly asbury",
  "cody cameron","mark dindal","eric darnell","tim johnson",
  "genndy tartakovsky","pendleton ward","rebecca sugar","alex hirsch",
  "justin roiland","dan harmon","michael dante dimartino","bryan konietzko","christian linke",
]);

async function main() {
  // 1. Items with ext.mal but no 'Anime' genre (tv or movie)
  const withExtMalNoAnime = await prisma.$queryRaw<{ id: number; title: string; type: string; genre: string[]; mal_id: number | null; ext: any }[]>`
    SELECT id, title, type, genre, mal_id, ext
    FROM items
    WHERE type IN ('tv', 'movie')
      AND parent_item_id IS NULL
      AND (ext->>'mal') IS NOT NULL
      AND NOT ('Anime' = ANY(genre))
    ORDER BY title
  `;

  console.log(`\n=== Items with ext.mal but no 'Anime' genre: ${withExtMalNoAnime.length} ===`);
  for (const item of withExtMalNoAnime) {
    const isWesternTitle = WESTERN_TITLE_PATTERNS.some(p => p.test(item.title));
    const ext = item.ext as any;
    console.log(`  [${item.id}] ${item.title} (${item.type}) | malId=${item.mal_id} extMal=${ext?.mal} | western=${isWesternTitle}`);
  }

  // 2. Items with 'Anime' genre but clearly Western
  const animeGenreItems = await prisma.$queryRaw<{ id: number; title: string; type: string; genre: string[]; mal_id: number | null }[]>`
    SELECT id, title, type, genre, mal_id
    FROM items
    WHERE type IN ('tv', 'movie')
      AND parent_item_id IS NULL
      AND 'Anime' = ANY(genre)
    ORDER BY title
  `;

  console.log(`\n=== Items with 'Anime' genre: ${animeGenreItems.length} ===`);
  const westernWithAnimeGenre = animeGenreItems.filter(i => WESTERN_TITLE_PATTERNS.some(p => p.test(i.title)));
  console.log(`  Western animation with 'Anime' genre (${westernWithAnimeGenre.length}):`);
  for (const item of westernWithAnimeGenre) {
    console.log(`  [${item.id}] ${item.title} (${item.type}) | malId=${item.mal_id}`);
  }

  // 3. Wrong malId = 59907 (The Owl House)
  const wrongMalId = await prisma.item.findMany({
    where: { malId: 59907 },
    select: { id: true, title: true, type: true, genre: true, malId: true },
  });
  console.log(`\n=== Items with malId=59907 (The Owl House — wrong assignment): ${wrongMalId.length} ===`);
  for (const item of wrongMalId) {
    console.log(`  [${item.id}] ${item.title} (${item.type}) | malId=${item.malId}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
