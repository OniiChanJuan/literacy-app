/**
 * Anime franchise linking and TMDB/Jikan duplicate detection.
 *
 * Problems this script solves:
 * 1. Attack on Titan and similar long-running anime have 7+ separate DB entries
 *    (one from TMDB, multiple from Jikan for each season/cour).
 *    → Link all seasons into the same franchise.
 *
 * 2. TMDB and Jikan both imported the same anime Season 1 as separate items.
 *    → Detect these pairs, merge the TMDB score onto the Jikan entry,
 *      and report TMDB duplicates for manual review before deletion.
 *
 * Run: npx tsx scripts/deduplicate-anime.ts
 * Options:
 *   --dry-run         Report findings without making changes
 *   --link-only       Only link franchises, skip duplicate detection
 *   --detect-only     Only detect duplicates, skip franchise linking
 *
 * IMPORTANT: This script REPORTS duplicate TMDB entries but does NOT delete them.
 * Review the output carefully, then delete manually or run with --delete flag
 * after verifying the report.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LINK_ONLY = args.includes("--link-only");
const DETECT_ONLY = args.includes("--detect-only");

/** Extract a "base title" by stripping season/part/final markers */
function extractBaseTitle(title: string): string {
  return title
    .replace(/:\s*(season\s*\d+|part\s*\d+|the\s+final\s+\w+|final\s+season.*|arc.*)/gi, "")
    .replace(/\s*(season\s*\d+|part\s*\d+|\(\d{4}\))\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if two items are likely the same franchise (shared base title) */
function sameBaseTitle(a: string, b: string): boolean {
  const ba = extractBaseTitle(a).toLowerCase();
  const bb = extractBaseTitle(b).toLowerCase();
  if (ba === bb) return true;
  // One starts with the other (e.g., "Attack on Titan" ← "Attack on Titan Season 2")
  if (ba.length >= 8 && bb.startsWith(ba)) return true;
  if (bb.length >= 8 && ba.startsWith(bb)) return true;
  return false;
}

async function main() {
  console.log(`🗾 Anime Franchise Linking + Duplicate Detection${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Load all anime (TV with Anime genre)
  const anime = await prisma.item.findMany({
    where: { type: "tv", genre: { has: "Anime" } },
    select: { id: true, title: true, year: true, ext: true, franchiseItems: { select: { franchiseId: true } } },
    orderBy: { year: "asc" },
  });

  console.log(`Found ${anime.length} anime items\n`);

  // ── Step 1: Franchise linking ─────────────────────────────────────────
  if (!DETECT_ONLY) {
    console.log("═══ Step 1: Link seasons into franchises ═══\n");

    // Group anime by base title
    const groups = new Map<string, typeof anime>();
    for (const a of anime) {
      const base = extractBaseTitle(a.title).toLowerCase();
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push(a);
    }

    // Filter groups with 2+ items (multi-season series)
    const multiSeason = [...groups.entries()].filter(([, items]) => items.length >= 2);
    console.log(`Found ${multiSeason.length} multi-season anime franchises\n`);

    const stats = { created: 0, linked: 0, skipped: 0 };

    for (const [baseTitle, items] of multiSeason) {
      // Sort by year for display
      items.sort((a, b) => (a.year || 9999) - (b.year || 9999));

      // Check if any item is already in a franchise
      const existingFranchiseIds = items
        .flatMap((i) => i.franchiseItems.map((fi) => fi.franchiseId))
        .filter(Boolean);

      let franchiseId: number;

      if (existingFranchiseIds.length > 0) {
        // Use the first existing franchise
        franchiseId = existingFranchiseIds[0];
        console.log(`  📁 Using existing franchise ${franchiseId} for "${items[0].title}" (${items.length} entries)`);
        stats.skipped++;
      } else {
        // Create a new franchise
        const franchiseName = items.reduce((shortest, item) =>
          item.title.length < shortest.length ? item.title : shortest,
          items[0].title
        );

        if (!DRY_RUN) {
          const franchise = await prisma.franchise.create({
            data: {
              name: franchiseName,
              description: `All entries in the ${franchiseName} anime franchise`,
            },
          });
          franchiseId = franchise.id;
        } else {
          franchiseId = -1;
        }

        console.log(`  ✨ Created franchise "${franchiseName}" (${items.length} entries):`);
        items.forEach((i) => console.log(`    - [${i.id}] "${i.title}" (${i.year})`));
        stats.created++;
      }

      // Link all items to the franchise
      if (!DRY_RUN && franchiseId > 0) {
        for (const item of items) {
          const alreadyLinked = item.franchiseItems.some((fi) => fi.franchiseId === franchiseId);
          if (!alreadyLinked) {
            try {
              await prisma.franchiseItem.create({
                data: { franchiseId, itemId: item.id },
              });
              stats.linked++;
            } catch { /* already exists */ }
          }
        }
      }
    }

    console.log(`\n  Franchise linking summary:`);
    console.log(`    Created:  ${stats.created} new franchises`);
    console.log(`    Linked:   ${stats.linked} items`);
    console.log(`    Reused:   ${stats.skipped} existing franchises\n`);
  }

  // ── Step 2: Detect TMDB/Jikan duplicate pairs ─────────────────────────
  if (!LINK_ONLY) {
    console.log("═══ Step 2: Detect TMDB ↔ Jikan duplicate pairs ═══\n");

    // Heuristic: items with the same base title but different score sources
    // TMDB items typically have ext.tmdb; Jikan items have ext.mal
    const duplicatePairs: { tmdb: typeof anime[0]; jikan: typeof anime[0] }[] = [];

    for (let i = 0; i < anime.length; i++) {
      const a = anime[i];
      const aExt = (a.ext as Record<string, number>) || {};
      const aIsTmdb = aExt.tmdb !== undefined && aExt.mal === undefined;
      if (!aIsTmdb) continue;

      for (let j = 0; j < anime.length; j++) {
        if (i === j) continue;
        const b = anime[j];
        const bExt = (b.ext as Record<string, number>) || {};
        const bIsJikan = bExt.mal !== undefined;
        if (!bIsJikan) continue;

        // Same base title + year within 1 year
        if (sameBaseTitle(a.title, b.title) && Math.abs((a.year || 0) - (b.year || 0)) <= 1) {
          duplicatePairs.push({ tmdb: a, jikan: b });
        }
      }
    }

    console.log(`Found ${duplicatePairs.length} potential TMDB↔Jikan duplicate pairs:\n`);

    for (const { tmdb, jikan } of duplicatePairs) {
      const tmdbExt = (tmdb.ext as Record<string, number>) || {};
      const jikanExt = (jikan.ext as Record<string, number>) || {};

      console.log(`  DUPLICATE PAIR:`);
      console.log(`    TMDB:  [${tmdb.id}] "${tmdb.title}" (${tmdb.year}) — scores: ${JSON.stringify(tmdbExt)}`);
      console.log(`    Jikan: [${jikan.id}] "${jikan.title}" (${jikan.year}) — scores: ${JSON.stringify(jikanExt)}`);

      if (!DRY_RUN) {
        // Merge TMDB score onto Jikan entry
        if (tmdbExt.tmdb !== undefined && jikanExt.tmdb === undefined) {
          await prisma.item.update({
            where: { id: jikan.id },
            data: { ext: { ...jikanExt, tmdb: tmdbExt.tmdb } as any },
          });
          // Also upsert ExternalScore
          await prisma.externalScore.upsert({
            where: { itemId_source: { itemId: jikan.id, source: "tmdb" } },
            update: { score: tmdbExt.tmdb, maxScore: 10, scoreType: "community", label: "TMDB" },
            create: { itemId: jikan.id, source: "tmdb", score: tmdbExt.tmdb, maxScore: 10, scoreType: "community", label: "TMDB" },
          });
          console.log(`    → Merged TMDB ${tmdbExt.tmdb} score onto Jikan entry [${jikan.id}]`);
        }
        console.log(`    → TMDB entry [${tmdb.id}] flagged for deletion (review before running DELETE)`);
      }
      console.log();
    }

    if (duplicatePairs.length > 0 && !DRY_RUN) {
      console.log("⚠️  TMDB duplicate entries have been flagged above.");
      console.log("   Their scores have been merged into the Jikan entries.");
      console.log("   To delete the TMDB duplicates, run this SQL after reviewing:");
      const ids = duplicatePairs.map((p) => p.tmdb.id).join(", ");
      console.log(`   DELETE FROM items WHERE id IN (${ids});`);
      console.log("   (Verify these IDs are correct before running)\n");
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Deduplication failed:", e);
  process.exit(1);
});
