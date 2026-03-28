/**
 * Sync Steam review data for all game items that have a steam_app_id.
 *
 * Steam has a public endpoint (no API key needed):
 * https://store.steampowered.com/appreviews/{appid}?json=1&language=all&purchase_type=all&num_per_page=0
 *
 * Stores:
 *  - ExternalScore row: source='steam', score=pct, maxScore=100, label='Very Positive'
 *  - ext JSON key: steam → pct (number, for backward compat with card display)
 *  - Also stores steam_label → text label in ext JSON
 *
 * Run: npx tsx scripts/sync-steam-reviews.ts
 * Options:
 *   --limit=N         Process only N games (default: all)
 *   --skip-existing   Skip games that already have a Steam score
 *   --dry-run         Print what would be fetched without writing
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SKIP_EXISTING = args.includes("--skip-existing");
const limitArg = args.find(a => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface SteamReviewSummary {
  score: number;      // percentage 0-100
  label: string;      // "Overwhelmingly Positive", "Very Positive", etc.
  totalReviews: number;
}

async function fetchSteamReviews(appId: number, retries = 3): Promise<SteamReviewSummary | null> {
  const url = `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; catalog-sync/1.0)" },
      });
      if (res.status === 429) {
        console.warn(`    Rate limited, waiting 30s...`);
        await sleep(30_000);
        continue;
      }
      if (!res.ok) return null;

      const data = await res.json();
      const qs = data?.query_summary;
      if (!qs) return null;

      const pos = qs.total_positive ?? 0;
      const neg = qs.total_negative ?? 0;
      const total = pos + neg;
      if (total < 10) return null; // Too few reviews to be meaningful

      const score = Math.round((pos / total) * 100);
      const label: string = qs.review_score_desc ?? "";
      return { score, label, totalReviews: total };
    } catch (err: any) {
      if (attempt < retries - 1) {
        console.warn(`    Fetch error (attempt ${attempt + 1}): ${err.message?.slice(0, 60)}, waiting 30s...`);
        await sleep(30_000);
      }
    }
  }
  return null;
}

async function main() {
  console.log(`🎮 Steam Reviews Sync${DRY_RUN ? " (DRY RUN)" : ""}${SKIP_EXISTING ? " (skip-existing)" : ""}...\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Get all games with a steam_app_id
  const where: any = { type: "game", steamAppId: { not: null } };
  if (SKIP_EXISTING) {
    // Exclude games that already have a steam ExternalScore
    const withScore = await prisma.externalScore.findMany({
      where: { source: "steam" },
      select: { itemId: true },
    });
    const existingIds = withScore.map(s => s.itemId);
    if (existingIds.length > 0) where.id = { notIn: existingIds };
  }

  const allGames = await prisma.item.findMany({
    where,
    select: { id: true, title: true, steamAppId: true, ext: true },
    orderBy: { voteCount: "desc" },
  });

  const games = LIMIT < Infinity ? allGames.slice(0, LIMIT) : allGames;
  console.log(`Found ${allGames.length} games with steam_app_id${LIMIT < Infinity ? ` (processing ${games.length})` : ""}\n`);

  const stats = { updated: 0, noData: 0, tooFewReviews: 0, errors: 0 };
  const labelCounts: Record<string, number> = {};
  let consecutiveErrors = 0;

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    process.stdout.write(`  Steam sync: ${i + 1}/${games.length} — "${game.title.slice(0, 40)}"... `);

    if (DRY_RUN) {
      console.log(`[DRY RUN] appid=${game.steamAppId}`);
      continue;
    }

    const result = await fetchSteamReviews(game.steamAppId!);

    if (!result) {
      if (result === null) {
        // Either no data or too few reviews
        console.log(`✗ no data / <10 reviews`);
        stats.tooFewReviews++;
      } else {
        console.log(`✗ error`);
        stats.errors++;
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          console.log(`\n⛔ 3 consecutive errors — stopping. Processed ${i}/${games.length}`);
          break;
        }
        await sleep(2000);
        continue;
      }
    } else {
      console.log(`✓ ${result.score}% "${result.label}" (${result.totalReviews.toLocaleString()} reviews)`);
      consecutiveErrors = 0;

      // Update ExternalScore table
      await prisma.externalScore.upsert({
        where: { itemId_source: { itemId: game.id, source: "steam" } },
        update: {
          score: result.score,
          maxScore: 100,
          scoreType: "community",
          label: result.label,
          updatedAt: new Date(),
        },
        create: {
          itemId: game.id,
          source: "steam",
          score: result.score,
          maxScore: 100,
          scoreType: "community",
          label: result.label,
        },
      });

      // Update ext JSON (keep steam = pct for backward compat, add steam_label)
      const currentExt = (game.ext as Record<string, any>) || {};
      await prisma.item.update({
        where: { id: game.id },
        data: {
          ext: {
            ...currentExt,
            steam: result.score,
            steam_label: result.label,
          } as any,
        },
      });

      stats.updated++;
      labelCounts[result.label] = (labelCounts[result.label] || 0) + 1;
    }

    // Rate limit: 1 second between requests
    await sleep(1000);
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`✅ Steam reviews sync complete!`);
  console.log(`   Updated:         ${stats.updated}`);
  console.log(`   No data / <10:   ${stats.tooFewReviews}`);
  console.log(`   Errors:          ${stats.errors}`);

  if (Object.keys(labelCounts).length > 0) {
    console.log(`\n   Distribution:`);
    Object.entries(labelCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([label, count]) => console.log(`     ${label}: ${count}`));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
