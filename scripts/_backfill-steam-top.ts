/**
 * Backfill steam_app_id for top games by vote_count (most likely to be on Steam).
 * Uses IGDB websites field (more reliable than external_games for Steam IDs).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  return (await res.json()).access_token;
}

async function main() {
  console.log(`🎮 Steam ID backfill via IGDB websites${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const token = await getToken();
  console.log('✓ IGDB token acquired\n');

  const allGames = await prisma.item.findMany({
    where: { type: 'game', igdbId: { not: null }, steamAppId: null },
    select: { id: true, title: true, igdbId: true },
    orderBy: { voteCount: 'desc' },
  });

  const games = LIMIT < Infinity ? allGames.slice(0, LIMIT) : allGames;
  console.log(`Found ${allGames.length} games with IGDB ID but no Steam App ID`);
  console.log(`Processing ${games.length}...\n`);

  const BATCH = 10;
  const stats = { updated: 0, notFound: 0, errors: 0 };

  for (let i = 0; i < games.length; i += BATCH) {
    const batch = games.slice(i, i + BATCH);
    const igdbIds = batch.map(g => g.igdbId!).join(',');

    try {
      // Use games endpoint with websites.url — most reliable way to get Steam AppIDs
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': process.env.IGDB_CLIENT_ID!,
          'Authorization': `Bearer ${token}`,
        },
        body: `fields id,websites.url; where id = (${igdbIds}); limit 500;`,
      });

      if (!res.ok) {
        console.log(`  ✗ Batch error: ${res.status}`);
        stats.errors += batch.length;
        await sleep(1000);
        continue;
      }

      const gameRecords: { id: number; websites?: { url: string }[] }[] = await res.json();
      const steamMap = new Map<number, number>();
      for (const gr of gameRecords) {
        const steamSite = (gr.websites || []).find((w: any) => w.url?.includes('store.steampowered.com/app/'));
        if (steamSite) {
          const match = steamSite.url.match(/\/app\/(\d+)/);
          if (match) steamMap.set(gr.id, parseInt(match[1]));
        }
      }

      for (const game of batch) {
        const steamAppId = steamMap.get(game.igdbId!);
        if (steamAppId) {
          console.log(`  ✓ [${game.id}] "${game.title.slice(0, 45)}" → ${steamAppId}`);
          if (!DRY_RUN) {
            await prisma.item.update({ where: { id: game.id }, data: { steamAppId } });
          }
          stats.updated++;
        } else {
          stats.notFound++;
        }
      }

      await sleep(300); // IGDB: ~4 req/sec
    } catch (err: any) {
      console.log(`  ✗ Batch error: ${err.message?.slice(0, 60)}`);
      stats.errors += batch.length;
      await sleep(1000);
    }

    if ((i / BATCH + 1) % 20 === 0) {
      console.log(`\n  --- Progress: ${Math.min(i + BATCH, games.length)}/${games.length} | Updated: ${stats.updated} ---\n`);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Complete! Updated: ${stats.updated} | Not on Steam: ${stats.notFound} | Errors: ${stats.errors}`);
  await prisma.$disconnect();
}
main().catch(console.error);
