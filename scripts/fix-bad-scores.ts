/**
 * Fix two categories of bad score data:
 *
 * 1. Podcasts where ext.spotify_popularity > 100 (backfill stored total_episodes, not 0-100 index)
 *    → Remove the spotify_popularity key from ext and clear from ExternalScore table
 *
 * 2. Games where ext.ign exists (legacy key from pre-migration IGDB scores)
 *    → Rename ign → igdb, scaling the stored 0-10 value to 0-100 (igdb uses 0-100 scale)
 *    → Also update ExternalScore rows accordingly
 *
 * Run: npx tsx scripts/fix-bad-scores.ts
 * Options:
 *   --dry-run    Preview changes without writing
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`🔧 Bad score fix${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  // ── Fix 1: Podcast spotify_popularity > 100 ──────────────────────────
  const podcasts = await prisma.item.findMany({
    where: { type: "podcast" },
    select: { id: true, title: true, ext: true },
  });

  let podcastFixed = 0;
  for (const pod of podcasts) {
    const ext = (pod.ext || {}) as Record<string, number>;
    if (ext.spotify_popularity === undefined || ext.spotify_popularity <= 100) continue;

    console.log(`[podcast] ${pod.title}: spotify_popularity=${ext.spotify_popularity} (WRONG — removing)`);
    if (!DRY_RUN) {
      const { spotify_popularity: _, ...cleanExt } = ext;
      await prisma.item.update({
        where: { id: pod.id },
        data: { ext: cleanExt },
      });
      // Also remove from ExternalScore table
      await prisma.externalScore.deleteMany({
        where: { itemId: pod.id, source: "spotify_popularity" },
      });
    }
    podcastFixed++;
  }
  console.log(`\nPodcasts fixed: ${podcastFixed}\n`);

  // ── Fix 2: Games with legacy ign key → rename to igdb ────────────────
  // The old populate scripts stored IGDB scores under "ign" key using 0-10 scale.
  // The correct key is "igdb" with 0-100 scale.
  // Only rename if there's no existing igdb key (don't overwrite a real igdb score).
  const games = await prisma.item.findMany({
    where: { type: "game" },
    select: { id: true, title: true, ext: true, voteCount: true },
  });

  let gameFixed = 0;
  for (const game of games) {
    const ext = (game.ext || {}) as Record<string, number>;
    if (ext.ign === undefined) continue;
    if (ext.igdb !== undefined) {
      // Already has a real igdb score — just remove the stale ign key
      console.log(`[game] ${game.title}: has both ign=${ext.ign} and igdb=${ext.igdb} → removing stale ign`);
      if (!DRY_RUN) {
        const { ign: _, ...cleanExt } = ext;
        await prisma.item.update({ where: { id: game.id }, data: { ext: cleanExt } });
      }
    } else {
      // Convert ign (0-10 scale) → igdb (0-100 scale)
      const igdbScore = Math.round(ext.ign * 10);
      console.log(`[game] ${game.title}: ign=${ext.ign} → igdb=${igdbScore}`);
      if (!DRY_RUN) {
        const { ign: _, ...baseExt } = ext;
        await prisma.item.update({
          where: { id: game.id },
          data: { ext: { ...baseExt, igdb: igdbScore } },
        });
        // Update ExternalScore rows: change source from ign to igdb
        await prisma.externalScore.updateMany({
          where: { itemId: game.id, source: "ign" },
          data: { source: "igdb", score: igdbScore, maxScore: 100 },
        });
      }
    }
    gameFixed++;
  }
  console.log(`\nGames fixed: ${gameFixed}\n`);

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`Done.${DRY_RUN ? " (no changes written)" : ""}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
