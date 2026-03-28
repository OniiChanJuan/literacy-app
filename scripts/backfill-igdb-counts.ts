/**
 * Backfill igdb_count and igdb_critics_count into ext JSON for all games
 * that have igdb/igdb_critics scores but no stored vote counts.
 *
 * These counts are needed for the score threshold system:
 *   - igdb_count >= 20  → show IGDB community score
 *   - igdb_critics_count >= 5 → show IGDB critics score
 *
 * Games below threshold will have scores hidden in the UI until count is stored.
 *
 * Run: npx tsx scripts/backfill-igdb-counts.ts
 * Options:
 *   --dry-run    Print what would change without writing
 *   --limit=N    Process only N games
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  return (await res.json()).access_token;
}

async function main() {
  console.log(`🎮 IGDB vote count backfill${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const token = await getToken();
  console.log("✓ IGDB token acquired\n");

  // Find all games with igdb score but no igdb_count stored
  const allGames = await prisma.item.findMany({
    where: {
      type: "game",
      igdbId: { not: null },
      // Only games that have igdb or igdb_critics score but missing count
    },
    select: { id: true, title: true, igdbId: true, ext: true },
    orderBy: { voteCount: "desc" },
  });

  // Filter to those missing count fields
  const games = allGames
    .filter((g) => {
      const ext = (g.ext || {}) as Record<string, any>;
      return (ext.igdb !== undefined && ext.igdb_count === undefined) ||
             (ext.igdb_critics !== undefined && ext.igdb_critics_count === undefined);
    })
    .slice(0, LIMIT < Infinity ? LIMIT : undefined);

  console.log(`Found ${allGames.length} IGDB games, ${games.length} need count backfill\n`);

  const BATCH = 10;
  const stats = { updated: 0, noData: 0, errors: 0 };

  for (let i = 0; i < games.length; i += BATCH) {
    const batch = games.slice(i, i + BATCH);
    const igdbIds = batch.map((g) => g.igdbId!).join(",");

    try {
      const res = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": process.env.IGDB_CLIENT_ID!,
          Authorization: `Bearer ${token}`,
        },
        body: `fields id,total_rating_count,aggregated_rating_count; where id = (${igdbIds}); limit 500;`,
      });

      if (!res.ok) {
        console.log(`  ✗ Batch error: ${res.status}`);
        stats.errors += batch.length;
        await sleep(1000);
        continue;
      }

      const records: { id: number; total_rating_count?: number; aggregated_rating_count?: number }[] =
        await res.json();

      const countMap = new Map(records.map((r) => [r.id, r]));

      for (const game of batch) {
        const data = countMap.get(game.igdbId!);
        if (!data) {
          stats.noData++;
          continue;
        }

        const ext = (game.ext || {}) as Record<string, any>;
        const newExt = { ...ext };
        let changed = false;

        if (ext.igdb !== undefined && ext.igdb_count === undefined && data.total_rating_count !== undefined) {
          newExt.igdb_count = data.total_rating_count;
          changed = true;
        }
        if (ext.igdb_critics !== undefined && ext.igdb_critics_count === undefined && data.aggregated_rating_count !== undefined) {
          newExt.igdb_critics_count = data.aggregated_rating_count;
          changed = true;
        }

        if (changed) {
          console.log(
            `  ✓ [${game.id}] "${game.title.slice(0, 40)}" — igdb_count: ${newExt.igdb_count ?? "—"}, critics_count: ${newExt.igdb_critics_count ?? "—"}`
          );
          if (!DRY_RUN) {
            await prisma.item.update({ where: { id: game.id }, data: { ext: newExt as any } });
          }
          stats.updated++;
        }
      }

      await sleep(300); // IGDB rate limit ~4 req/sec
    } catch (err: any) {
      console.log(`  ✗ Batch error: ${err.message?.slice(0, 60)}`);
      stats.errors += batch.length;
      await sleep(1000);
    }

    if ((i / BATCH + 1) % 20 === 0) {
      console.log(`\n  --- Progress: ${Math.min(i + BATCH, games.length)}/${games.length} | Updated: ${stats.updated} ---\n`);
    }
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`✅ Complete! Updated: ${stats.updated} | No data: ${stats.noData} | Errors: ${stats.errors}`);
  await prisma.$disconnect();
}

main().catch(console.error);
