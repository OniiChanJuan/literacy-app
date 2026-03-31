import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // 1. Witcher 3
  const w3: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, type, steam_app_id, igdb_id, ext FROM items WHERE title ILIKE '%witcher 3%' LIMIT 5
  `);
  console.log('=== WITCHER 3 ===');
  for (const r of w3) console.log(JSON.stringify({ id: r.id, title: r.title, steam_app_id: r.steam_app_id, igdb_id: r.igdb_id, ext: r.ext }));

  const w3Scores: any[] = await prisma.$queryRawUnsafe(`
    SELECT * FROM external_scores WHERE item_id = ${w3[0]?.id || 0}
  `);
  console.log('Witcher 3 ExternalScores:', JSON.stringify(w3Scores));

  // 2. Games with steam scores in ext or ExternalScore table
  const withSteamExt: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, steam_app_id, ext->'steam' as steam_val FROM items
    WHERE type='game' AND ext ? 'steam'
    LIMIT 20
  `);
  console.log('\n=== GAMES WITH steam IN ext JSON ===');
  console.log(`Count: ${withSteamExt.length}`);
  withSteamExt.forEach((r: any) => console.log(`  [${r.id}] ${r.title} steam_app_id=${r.steam_app_id} steam=${JSON.stringify(r.steam_val)}`));

  const withSteamScore: any[] = await prisma.$queryRawUnsafe(`
    SELECT i.id, i.title, i.steam_app_id, es.score, es.label FROM external_scores es
    JOIN items i ON i.id = es.item_id
    WHERE es.source = 'steam' AND i.type = 'game'
    LIMIT 20
  `);
  console.log('\n=== GAMES WITH steam IN ExternalScore table ===');
  console.log(`Count: ${withSteamScore.length}`);
  withSteamScore.forEach((r: any) => console.log(`  [${r.id}] ${r.title} score=${r.score} label=${r.label}`));

  // 3. Steam appid stats
  const [withAppId]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='game' AND steam_app_id IS NOT NULL`);
  const [withAppIdNoScore]: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as n FROM items i WHERE type='game' AND steam_app_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM external_scores es WHERE es.item_id = i.id AND es.source='steam')
  `);
  const [noAppId]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='game' AND steam_app_id IS NULL`);
  const [totalGames]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='game'`);
  console.log(`\n=== STEAM APPID STATS ===`);
  console.log(`Total games: ${totalGames.n}`);
  console.log(`With steam_app_id: ${withAppId.n}`);
  console.log(`With steam_app_id but NO Steam score: ${withAppIdNoScore.n}`);
  console.log(`Without steam_app_id: ${noAppId.n}`);

  // 4. Sample games with steam_app_id
  const sample: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, steam_app_id, igdb_id FROM items WHERE type='game' AND steam_app_id IS NOT NULL
    ORDER BY vote_count DESC LIMIT 10
  `);
  console.log('\nSample games with steam_app_id:');
  sample.forEach((r: any) => console.log(`  [${r.id}] ${r.title} steam=${r.steam_app_id} igdb=${r.igdb_id}`));

  await prisma.$disconnect();
}
main().catch(console.error);
