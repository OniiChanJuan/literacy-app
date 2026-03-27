/**
 * Backfill steam_app_id for game items by querying IGDB's external_games data.
 *
 * IGDB tracks Steam store IDs via the external_games endpoint. This script
 * goes through all game items that have an igdbId but no steamAppId, batches
 * them, and fetches their Steam IDs from IGDB.
 *
 * Run AFTER: npx prisma migrate dev --name add_steam_app_id
 *       OR:  npx prisma db push
 *
 * Run: npx tsx scripts/backfill-steam-ids.ts
 * Options:
 *   --dry-run     Print what would be updated without writing to DB
 *   --limit=N     Process only N games (default: all)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.find(a => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getIgdbToken(): Promise<string | null> {
  if (!IGDB_ID || !IGDB_SECRET) return null;
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`🎮 Backfill Steam App IDs from IGDB${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const token = await getIgdbToken();
  if (!token) {
    console.error("❌ Failed to get IGDB token. Check IGDB_CLIENT_ID and IGDB_CLIENT_SECRET.");
    process.exit(1);
  }
  console.log("✓ IGDB token acquired\n");

  // Find game items with igdbId but no steamAppId
  const games = await prisma.item.findMany({
    where: {
      type: "game",
      igdbId: { not: null },
      steamAppId: null,
    },
    select: { id: true, title: true, igdbId: true },
    orderBy: { id: "asc" },
  });

  const toProcess = LIMIT < Infinity ? games.slice(0, LIMIT) : games;
  console.log(`Found ${games.length} game items with IGDB ID but no Steam App ID`);
  console.log(`Processing ${toProcess.length}...\n`);

  const stats = { updated: 0, notFound: 0, errors: 0 };

  // Process in batches of 20 (IGDB API supports multiple IDs in one query)
  const BATCH = 20;
  for (let i = 0; i < toProcess.length; i += BATCH) {
    const batch = toProcess.slice(i, i + BATCH);
    const igdbIds = batch.map(g => g.igdbId!).join(",");

    try {
      const res = await fetch("https://api.igdb.com/v4/external_games", {
        method: "POST",
        headers: {
          "Client-ID": IGDB_ID,
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        // category 1 = Steam
        body: `fields game,uid; where game = (${igdbIds}) & category = 1; limit 500;`,
      });

      if (!res.ok) {
        console.log(`  ✗ Batch ${i / BATCH + 1}: IGDB error ${res.status}`);
        stats.errors += batch.length;
        await sleep(500);
        continue;
      }

      const externalGames: { game: number; uid: string }[] = await res.json();

      // Build a map from igdbId → steamAppId
      const steamMap = new Map<number, number>();
      for (const eg of externalGames) {
        const steamId = parseInt(eg.uid);
        if (!isNaN(steamId)) {
          steamMap.set(eg.game, steamId);
        }
      }

      // Update each game in the batch
      for (const game of batch) {
        const steamAppId = steamMap.get(game.igdbId!);
        if (steamAppId) {
          console.log(`  ✓ [${game.id}] "${game.title}" → Steam App ID: ${steamAppId}`);
          if (!DRY_RUN) {
            await prisma.item.update({
              where: { id: game.id },
              data: { steamAppId },
            });
          }
          stats.updated++;
        } else {
          stats.notFound++;
        }
      }

      await sleep(300); // IGDB rate limit: ~4 req/sec
    } catch (err: any) {
      console.log(`  ✗ Batch ${i / BATCH + 1}: ${err.message?.slice(0, 60)}`);
      stats.errors += batch.length;
      await sleep(1000);
    }

    if ((i / BATCH + 1) % 10 === 0) {
      console.log(`\n  --- Progress: ${Math.min(i + BATCH, toProcess.length)}/${toProcess.length} ---\n`);
    }
  }

  console.log("\n════════════════════════════════════════");
  console.log("✅ Steam ID backfill complete!");
  console.log(`  Updated:   ${stats.updated}`);
  console.log(`  Not found: ${stats.notFound} (no Steam release)`);
  console.log(`  Errors:    ${stats.errors}`);
  console.log("\nSteam imports will now use appid matching for previously-backfilled games.");

  await prisma.$disconnect();
}

main().catch(e => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
