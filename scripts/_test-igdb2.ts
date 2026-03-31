import 'dotenv/config';

async function getToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  return (await res.json()).access_token;
}

async function igdb(endpoint: string, body: string, token: string) {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID!, 'Authorization': `Bearer ${token}` },
    body,
  });
  return res.json();
}

async function main() {
  const token = await getToken();

  // Try Portal (igdb=71) — any external games at all
  console.log('Portal (71) any external_games:');
  console.log(JSON.stringify(await igdb('external_games', 'fields game,uid,category,name; where game = 71; limit 10;', token)));

  // Try fetching the game record with websites/external IDs
  console.log('\nPortal (71) game record with websites:');
  console.log(JSON.stringify(await igdb('games', 'fields name,websites.url,websites.category; where id=71; limit 1;', token)));

  // Try Elden Ring any external games
  console.log('\nElden Ring (119133) any external_games:');
  console.log(JSON.stringify(await igdb('external_games', 'fields game,uid,category,name; where game = 119133; limit 10;', token)));
  
  // Check what category=1 means by querying some external games
  console.log('\nSample external_games where category=1 (should be Steam):');
  console.log(JSON.stringify(await igdb('external_games', 'fields game,uid,category,name; where category = 1; limit 5;', token)));
}
main().catch(console.error);
