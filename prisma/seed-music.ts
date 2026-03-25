/**
 * Seed/update music items from Spotify API.
 * Updates existing items that lack scores, and adds new ones.
 * Run: npx tsx prisma/seed-music.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DB_URL = "postgresql://postgres:Baylorlawsucks2021@db.shlyuoeabdaifketvaeo.supabase.co:5432/postgres";
const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
let token = "";
let expiry = 0;

async function getToken(): Promise<string> {
  if (token && Date.now() < expiry) return token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const d = await res.json();
  token = d.access_token;
  expiry = Date.now() + (d.expires_in - 60) * 1000;
  return token;
}

let requestCount = 0;

async function sf(path: string, retries = 0): Promise<any> {
  const t = await getToken();
  requestCount++;
  // Throttle: every 5 requests, wait 500ms
  if (requestCount % 5 === 0) await sleep(500);

  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${t}` } });
  if (res.status === 429) {
    if (retries >= 3) { console.log("  Too many retries, skipping"); return null; }
    const wait = Math.min(parseInt(res.headers.get("Retry-After") || "5"), 10);
    console.log(`  Rate limited, waiting ${wait}s...`);
    await sleep(wait * 1000);
    return sf(path, retries + 1);
  }
  if (!res.ok) return null;
  return res.json();
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const GENRE_MAP: Record<string, string> = {
  "art rock": "Alternative", "alternative rock": "Alternative", "indie rock": "Indie",
  "indie pop": "Indie", "hip hop": "Hip-Hop", "rap": "Hip-Hop", "pop": "Pop",
  "r&b": "R&B", "soul": "Soul", "jazz": "Jazz", "classical": "Classical",
  "electronic": "Electronic", "edm": "Electronic", "rock": "Rock", "metal": "Metal",
  "punk": "Punk", "country": "Country", "folk": "Folk", "latin": "Latin",
  "k-pop": "K-Pop", "blues": "Blues", "funk": "Funk", "ambient": "Ambient",
};

function mapGenres(sg: string[]): string[] {
  const g = new Set<string>();
  for (const s of sg) {
    const low = s.toLowerCase();
    if (GENRE_MAP[low]) g.add(GENRE_MAP[low]);
    else for (const [k, v] of Object.entries(GENRE_MAP)) { if (low.includes(k)) { g.add(v); break; } }
  }
  return [...g].slice(0, 4);
}

function vibes(genres: string[]): string[] {
  const v: string[] = [];
  const g = new Set(genres.map(s => s.toLowerCase()));
  if (g.has("electronic") || g.has("ambient")) v.push("Atmospheric", "Immersive");
  if (g.has("metal") || g.has("punk")) v.push("Intense", "Dark");
  if (g.has("r&b") || g.has("soul")) v.push("Emotional", "Stylish");
  if (g.has("hip-hop")) v.push("Intense", "Stylish");
  if (g.has("jazz")) v.push("Atmospheric", "Stylish");
  if (g.has("classical")) v.push("Immersive", "Epic");
  if (g.has("indie") || g.has("folk")) v.push("Melancholic", "Heartfelt");
  if (g.has("pop")) v.push("Uplifting", "Fast-Paced");
  if (g.has("rock")) v.push("Intense", "Epic");
  if (g.has("latin") || g.has("k-pop")) v.push("Fast-Paced", "Uplifting");
  if (v.length === 0) v.push("Immersive");
  return [...new Set(v)].slice(0, 3);
}

const ARTISTS = [
  "Kendrick Lamar", "Radiohead", "Beyoncé", "Frank Ocean", "Taylor Swift",
  "Tyler, the Creator", "Kanye West", "Daft Punk", "Pink Floyd", "Nirvana",
  "The Beatles", "David Bowie", "Fleetwood Mac", "Amy Winehouse", "Arctic Monkeys",
  "Tame Impala", "SZA", "Bad Bunny", "BTS", "Adele",
  "The Weeknd", "Billie Eilish", "Travis Scott", "Drake", "Lana Del Rey",
  "Mac Miller", "Childish Gambino", "Anderson .Paak", "Gorillaz", "Outkast",
  "Arcade Fire", "LCD Soundsystem", "Bon Iver", "Sufjan Stevens", "The National",
  "Fleet Foxes", "Beach House", "Vampire Weekend", "Phoebe Bridgers", "Japanese Breakfast",
  "Run the Jewels", "Danny Brown", "Denzel Curry", "Pusha T",
  "A Tribe Called Quest", "Wu-Tang Clan", "Nas", "Jay-Z",
  "Metallica", "Tool", "Rage Against the Machine", "System of a Down",
  "Led Zeppelin", "The Rolling Stones", "Queen", "AC/DC",
  "Stevie Wonder", "Prince", "Michael Jackson", "Marvin Gaye", "Aretha Franklin",
  "Miles Davis", "John Coltrane", "Nina Simone",
  "Doja Cat", "Olivia Rodrigo", "Harry Styles", "Post Malone", "Dua Lipa",
  "Bruno Mars", "Ed Sheeran", "Ariana Grande", "The Strokes", "Red Hot Chili Peppers",
  "Foo Fighters", "Green Day", "Blink-182", "Paramore", "My Chemical Romance",
  "Lorde", "Hozier", "Mitski", "Charli XCX", "Rosalía",
  "Rihanna", "Lady Gaga", "Katy Perry", "Justin Bieber", "Eminem",
  "Lizzo", "Megan Thee Stallion", "Cardi B", "21 Savage", "Future",
  "J. Cole", "Kid Cudi", "Chance the Rapper", "Vince Staples", "Isaiah Rashad",
  "Bjork", "FKA Twigs", "Grimes", "St. Vincent", "Weyes Blood",
  "King Gizzard & The Lizard Wizard", "Black Midi", "Fontaines D.C.", "IDLES", "Turnstile",
];

// Track spotifyIds we've already processed to avoid duplicates
const processed = new Set<string>();

async function processArtist(artistName: string): Promise<number> {
  let added = 0;
  try {
    const search = await sf(`/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`);
    if (!search?.artists?.items?.length) return 0;

    const artist = search.artists.items[0];
    const artistGenres: string[] = artist.genres || [];
    const albums = await sf(`/artists/${artist.id}/albums?include_groups=album&limit=4&market=US`);
    if (!albums?.items?.length) return 0;

    for (const alb of albums.items) {
      if (processed.has(alb.id)) continue;
      processed.add(alb.id);

      // Use artist popularity as a proxy (saves an API call per album)
      const pop = artist.popularity || 50;

      const year = alb.release_date ? parseInt(alb.release_date.substring(0, 4)) : 0;
      const cover = alb.images?.[0]?.url || "";
      if (!cover) continue;

      const genres = mapGenres(artistGenres);
      const v = vibes(genres);
      const desc = `${alb.name} is an album by ${artist.name}, released in ${year}. Features ${alb.total_tracks || 0} tracks.`;

      // Check if exists by spotifyId
      const bySpotify = await prisma.item.findFirst({ where: { spotifyId: alb.id } });
      if (bySpotify) continue;

      // Check if exists by title (case insensitive)
      const byTitle = await prisma.item.findFirst({
        where: { title: { equals: alb.name, mode: "insensitive" }, type: "music" },
      });

      if (byTitle) {
        // Update existing item with proper data
        await prisma.item.update({
          where: { id: byTitle.id },
          data: {
            spotifyId: alb.id,
            ext: { spotify_popularity: pop },
            popularityScore: pop,
            voteCount: pop,
            genre: genres.length > 0 ? genres : byTitle.genre,
            vibes: v.length > 0 ? v : byTitle.vibes,
            cover: cover || byTitle.cover,
            description: desc.length > byTitle.description.length ? desc : byTitle.description,
            people: [{ role: "Artist", name: artist.name }],
            lastSyncedAt: new Date(),
          },
        });
        added++;
      } else {
        // Create new
        await prisma.item.create({
          data: {
            title: alb.name, type: "music", genre: genres.length > 0 ? genres : ["Pop"],
            vibes: v, year, cover, description: desc,
            people: [{ role: "Artist", name: artist.name }],
            awards: [], platforms: ["spotify", "apple-music"],
            ext: { spotify_popularity: pop }, totalEp: alb.total_tracks || 0,
            spotifyId: alb.id, popularityScore: pop, voteCount: pop,
            lastSyncedAt: new Date(),
          },
        });
        added++;
      }

      await sleep(60);
    }
  } catch (err: any) {
    console.log(`  Error for ${artistName}: ${err.message?.slice(0, 60)}`);
  }
  return added;
}

async function main() {
  console.log("🎵 Seeding music from Spotify...\n");
  let totalAdded = 0;

  for (const artist of ARTISTS) {
    const n = await processArtist(artist);
    if (n > 0) {
      totalAdded += n;
      process.stdout.write(`  ${artist}: +${n} (total: ${totalAdded})\n`);
    }
  }

  const count = await prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int as c FROM items WHERE type='music'`;
  const withScores = await prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int as c FROM items WHERE type='music' AND ext::text != '{}' AND ext::text != 'null'`;

  console.log(`\n✅ Done! ${totalAdded} items added/updated`);
  console.log(`Total music: ${count[0].c}, with scores: ${withScores[0].c}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
