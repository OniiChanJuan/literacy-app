import 'dotenv/config';
async function getToken() {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  return (await res.json()).access_token;
}
async function igdb(body: string, token: string) {
  const res = await fetch('https://api.igdb.com/v4/external_games', {
    method: 'POST',
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID!, 'Authorization': `Bearer ${token}` },
    body,
  });
  return res.json();
}
async function main() {
  const token = await getToken();
  // Portal with ALL categories
  console.log('Portal (71) external_games with categories:');
  const d = await igdb('fields game,uid,category; where game = 71; limit 20;', token);
  console.log(JSON.stringify(d, null, 2));

  // Also check websites approach for Portal
  console.log('\nPortal via websites:');
  const res2 = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID!, 'Authorization': `Bearer ${token}` },
    body: 'fields name,websites.url,websites.category; where id=(71,233,11156,119133); limit 10;',
  });
  const d2 = await res2.json();
  // Extract Steam URLs
  for (const game of d2) {
    const steamSite = (game.websites || []).find((w: any) => w.url?.includes('store.steampowered.com'));
    if (steamSite) {
      const match = steamSite.url.match(/\/app\/(\d+)/);
      console.log(`  ${game.name}: Steam AppID = ${match?.[1] || 'not found'} (url: ${steamSite.url})`);
    } else {
      console.log(`  ${game.name}: no Steam website`);
    }
  }
}
main().catch(console.error);
