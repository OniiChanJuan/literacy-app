/**
 * Link anime seasons under a parent item so browse rows show one card per show.
 *
 * The catalog API already filters `parent_item_id IS NULL`, so once this script
 * sets parent_item_id on season/sequel entries they vanish from Explore/For You
 * rows while their detail pages remain accessible, and franchises still work.
 *
 * Strategy:
 * 1. Load all anime TV items (genre has "Anime") + manga with Anime genre
 * 2. Normalize titles: lowercase, strip diacritics, strip season/part suffixes
 * 3. Group by (normalizedBaseTitle, type)
 * 4. For each group with 2+ items:
 *    - Pick "main" item: prefer most votes, then has tmdb_id, then oldest year
 *    - Set parent_item_id = main.id on all non-main items
 * 5. Handle cross-API title variants (Shippuden vs Shippūden) as true duplicates
 *
 * Run: npx tsx scripts/link-anime-seasons.ts
 * Options:
 *   --dry-run    Print what would change without writing to DB
 *   --manga      Also process manga type (default: tv only)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const INCLUDE_MANGA = args.includes("--manga");

/** Strip diacritics: ū→u, ō→o, etc. */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalize a title to a base form for grouping.
 * "Attack on Titan Season 3 Part 2" → "attack on titan"
 * "JUJUTSU KAISEN" → "jujutsu kaisen"
 * "Naruto Shippūden" → "naruto shippuden"
 */
function normalizeTitle(title: string): string {
  return stripDiacritics(title.toLowerCase())
    // Strip trailing season/part/cour markers
    .replace(/[:\s]+(season\s*\d+\s*(part\s*\d+)?(\s*cour\s*\d+)?)$/i, "")
    .replace(/[:\s]+part\s*\d+$/i, "")
    .replace(/[:\s]+cour\s*\d+$/i, "")
    .replace(/[:\s]+(final\s+season|final\s+chapters?|the\s+final\s+chapters?).*$/i, "")
    .replace(/[:\s]+\d+(st|nd|rd|th)\s+season.*$/i, "")
    .replace(/[:\s]+(oad|ova|special|movie)s?$/i, "")
    // Strip "(2024)" year suffix
    .replace(/\s*\(\d{4}\)\s*$/, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/** Season/sequel/movie suffix detected — this is a child entry, not the main show */
function hasSeasonSuffix(title: string): boolean {
  return /(\s+|:)(season\s*\d+|part\s*\d+|cour\s*\d+|\d+(st|nd|rd|th)\s+season|final\s+season|the\s+final|oad|ova\b|movie\b|film\b)/i.test(title)
    || /\s+(arc|ova|specials?|movies?)\s*$/i.test(title);
}

/** Pick the best "main" entry from a group */
function pickMain(items: any[]): any {
  return items.slice().sort((a, b) => {
    // Prefer item without season suffix (is the base show)
    const aHas = hasSeasonSuffix(a.title) ? 1 : 0;
    const bHas = hasSeasonSuffix(b.title) ? 1 : 0;
    if (aHas !== bHas) return aHas - bHas;
    // Prefer most votes
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    // Prefer has tmdb_id
    const aTmdb = a.tmdbId ? 0 : 1;
    const bTmdb = b.tmdbId ? 0 : 1;
    if (aTmdb !== bTmdb) return aTmdb - bTmdb;
    // Prefer older (Season 1)
    return (a.year || 9999) - (b.year || 9999);
  })[0];
}

async function main() {
  console.log(`🗾 Anime Season Linker${DRY_RUN ? " (DRY RUN — no writes)" : ""}\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const types = INCLUDE_MANGA ? ["tv", "manga"] : ["tv"];

  let totalLinked = 0;
  let totalGroups = 0;

  for (const mediaType of types) {
    console.log(`\n═══ Processing type: ${mediaType} ═══`);

    const items = await prisma.item.findMany({
      where: {
        type: mediaType,
        parentItemId: null, // Only process items not already linked
        // Include: items tagged Anime genre, OR items that have a MAL ID (cross-referenced anime from TMDB)
        OR: [
          { genre: { has: "Anime" } },
          { malId: { not: null } },
        ],
      },
      select: {
        id: true,
        title: true,
        type: true,
        year: true,
        voteCount: true,
        tmdbId: true,
        malId: true,
        cover: true,
      },
    });

    console.log(`Found ${items.length} unlinked anime ${mediaType} items\n`);

    // Group by normalized base title
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const base = normalizeTitle(item.title);
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push(item);
    }

    // Only process groups with 2+ items
    const multiGroups = [...groups.entries()].filter(([, g]) => g.length >= 2);
    console.log(`Found ${multiGroups.length} multi-entry groups\n`);

    for (const [baseTitle, group] of multiGroups) {
      const main = pickMain(group);
      const children = group.filter((i) => i.id !== main.id);

      console.log(`  "${baseTitle}" → ${group.length} entries`);
      console.log(`    MAIN [${main.id}] "${main.title}" (${main.year}, votes=${main.voteCount})`);

      for (const child of children) {
        console.log(`    CHILD [${child.id}] "${child.title}" (${child.year}, votes=${child.voteCount})`);
        if (!DRY_RUN) {
          await prisma.item.update({
            where: { id: child.id },
            data: { parentItemId: main.id },
          });
        }
        totalLinked++;
      }

      totalGroups++;
    }
  }

  // ── Handle cross-API title variants (diacritics) ──────────────────────────
  // e.g. "Naruto Shippuden" (MAL) vs "Naruto Shippūden" (TMDB) — same show
  console.log(`\n═══ Checking cross-API title variants (diacritics) ═══`);

  const tvAnime = await prisma.item.findMany({
    where: { type: "tv", genre: { has: "Anime" } },
    select: { id: true, title: true, year: true, voteCount: true, tmdbId: true, malId: true, parentItemId: true },
  });

  // Build a map of normalized-title → items
  const byNorm = new Map<string, typeof tvAnime>();
  for (const item of tvAnime) {
    const norm = normalizeTitle(item.title);
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm)!.push(item);
  }

  let variantFixed = 0;
  for (const [norm, group] of byNorm) {
    if (group.length < 2) continue;
    // Check if any pair has different raw titles but same norm (diacritic variants)
    const uniqueTitles = new Set(group.map((i) => i.title.toLowerCase()));
    if (uniqueTitles.size <= 1) continue; // Same title, handled above

    // These are diacritic/capitalization variants of the same show
    // Some might already be linked (parent_item_id set) — skip those
    const unlinked = group.filter((i) => i.parentItemId === null);
    if (unlinked.length < 2) continue;

    const main = pickMain(unlinked);
    const children = unlinked.filter((i) => i.id !== main.id);

    console.log(`  Variant pair — normalized: "${norm}"`);
    console.log(`    MAIN [${main.id}] "${main.title}" (votes=${main.voteCount})`);
    for (const child of children) {
      console.log(`    VARIANT→CHILD [${child.id}] "${child.title}" (votes=${child.voteCount})`);
      if (!DRY_RUN) {
        await prisma.item.update({
          where: { id: child.id },
          data: { parentItemId: main.id },
        });
      }
      variantFixed++;
      totalLinked++;
    }
  }

  console.log(`\n  Variant pairs fixed: ${variantFixed}`);

  console.log(`\n${"═".repeat(50)}`);
  console.log(`✅ Done!`);
  console.log(`   Groups processed: ${totalGroups}`);
  console.log(`   Season entries linked (parent_item_id set): ${totalLinked}`);
  if (DRY_RUN) {
    console.log(`\n   (DRY RUN — run without --dry-run to apply changes)`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
