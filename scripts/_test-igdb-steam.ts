import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Show first 10 games with igdb_id
  const games: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, igdb_id, steam_app_id FROM items
    WHERE type='game' AND igdb_id IS NOT NULL
    ORDER BY vote_count DESC LIMIT 10
  `);
  console.log('Top games with IGDB ID:');
  games.forEach((g: any) => console.log(`  [${g.id}] "${g.title}" igdb=${g.igdb_id} steam=${g.steam_app_id}`));

  // Test IGDB external_games for a known game — Elden Ring IGDB ID: 119133
  const token = await getToken();
  console.log('\nTesting IGDB external_games for Elden Ring (igdb_id=119133):');
  const res = await fetch('https://api.igdb.com/v4/external_games', {
    method: 'POST',
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID!, 'Authorization': `Bearer ${token}` },
    body: 'fields game,uid,category; where game = 119133 & category = 1; limit 5;',
  });
  const data = await res.json();
  console.log(JSON.stringify(data));

  // Also test with first 5 games from DB
  const igdbIds = games.slice(0, 5).map((g: any) => g.igdb_id).join(',');
  console.log(`\nTesting with first 5 IGDB IDs: ${igdbIds}`);
  const res2 = await fetch('https://api.igdb.com/v4/external_games', {
    method: 'POST',
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID!, 'Authorization': `Bearer ${token}` },
    body: `fields game,uid,category; where game = (${igdbIds}) & category = 1; limit 50;`,
  });
  const data2 = await res2.json();
  console.log(JSON.stringify(data2));

  await prisma.$disconnect();
}

async function getToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  const d = await res.json();
  return d.access_token;
}

main().catch(console.error);
