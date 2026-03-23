/**
 * Supplemental Spotify seed — fixes the limit issue from the main seed.
 * Run with: npx tsx scripts/seed-spotify-fix.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SPOTIFY_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return res.json();
}

let spotifyToken = "";
async function getToken(): Promise<string> {
  if (spotifyToken) return spotifyToken;
  const data = await fetchJson("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${SPOTIFY_ID}:${SPOTIFY_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  spotifyToken = data.access_token;
  return spotifyToken;
}

async function searchAlbums(query: string, total: number, genreTags: string[]): Promise<any[]> {
  const token = await getToken();
  const items: any[] = [];
  for (let offset = 0; offset < total; offset += 20) {
    const limit = Math.min(20, total - offset);
    try {
      const data = await fetchJson(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      for (const a of data.albums?.items || []) {
        if (!a.name || !a.images?.[0]?.url) continue;
        items.push({
          title: a.name,
          type: "music",
          genre: genreTags,
          vibes: [],
          year: parseInt((a.release_date || "0").slice(0, 4)) || 0,
          cover: a.images[0].url,
          description: `${a.name} by ${(a.artists || []).map((ar: any) => ar.name).join(", ")}. ${a.total_tracks || 0} tracks.`,
          people: (a.artists || []).map((ar: any) => ({ role: "Artist", name: ar.name })).slice(0, 3),
          awards: [],
          platforms: ["spotify", "apple_music"],
          ext: {},
          totalEp: a.total_tracks || 0,
        });
      }
      await sleep(100);
    } catch (e: any) {
      console.warn(`  Failed: ${e.message}`);
    }
  }
  return items;
}

async function searchPodcasts(query: string, total: number): Promise<any[]> {
  const token = await getToken();
  const items: any[] = [];
  for (let offset = 0; offset < total; offset += 20) {
    const limit = Math.min(20, total - offset);
    try {
      const data = await fetchJson(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=show&limit=${limit}&offset=${offset}&market=US`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      for (const s of data.shows?.items || []) {
        if (!s.name || !s.images?.[0]?.url) continue;
        const desc = (s.description || "").toLowerCase();
        const genres: string[] = [];
        if (desc.includes("true crime") || desc.includes("crime")) genres.push("True Crime");
        if (desc.includes("comedy") || desc.includes("humor")) genres.push("Comedy");
        if (desc.includes("news") || desc.includes("politics")) genres.push("News");
        if (desc.includes("tech") || desc.includes("science")) genres.push("Technology");
        if (desc.includes("business") || desc.includes("finance")) genres.push("Business");
        if (desc.includes("history")) genres.push("History");
        if (genres.length === 0) genres.push("General");

        items.push({
          title: s.name,
          type: "podcast",
          genre: genres.slice(0, 3),
          vibes: [],
          year: 0,
          cover: s.images[0].url,
          description: (s.description || "").slice(0, 500),
          people: [{ role: "Host", name: s.publisher || "Unknown" }],
          awards: [],
          platforms: ["spotify", "apple_pod"],
          ext: {},
          totalEp: s.total_episodes || 0,
        });
      }
      await sleep(100);
    } catch (e: any) {
      console.warn(`  Failed: ${e.message}`);
    }
  }
  return items;
}

async function main() {
  console.log("🎵 Supplemental Spotify seed...\n");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.item.findMany({
    where: { type: { in: ["music", "podcast"] } },
    select: { title: true, type: true },
  });
  const existingSet = new Set(existing.map((e) => `${e.title}|||${e.type}`));
  console.log(`${existingSet.size} music/podcast items already in DB\n`);

  const all: any[] = [];

  // Albums that failed before (limit > 20)
  const queries: [string, string[], number][] = [
    ["greatest albums of all time", ["Rock", "Pop"], 20],
    ["best hip hop albums ever", ["Hip-Hop"], 20],
    ["best rock albums classic", ["Rock"], 20],
    ["best pop albums", ["Pop"], 15],
    ["best country albums", ["Country"], 10],
    ["best latin albums", ["Latin"], 10],
    ["best k-pop albums", ["K-Pop"], 10],
  ];

  for (const [query, genres, limit] of queries) {
    console.log(`  Albums: "${query}" (${limit})...`);
    all.push(...await searchAlbums(query, limit, genres));
  }

  // Podcasts
  const podQueries = ["popular podcasts", "best podcasts 2024", "top true crime podcasts"];
  for (const q of podQueries) {
    console.log(`  Podcasts: "${q}" (20)...`);
    all.push(...await searchPodcasts(q, 20));
  }

  console.log(`\n📦 Total fetched: ${all.length}`);

  // Dedup
  const toInsert = all.filter((item) => {
    const key = `${item.title}|||${item.type}`;
    if (existingSet.has(key)) return false;
    existingSet.add(key);
    return true;
  });

  console.log(`🔍 New items: ${toInsert.length}`);

  if (toInsert.length > 0) {
    await prisma.item.createMany({
      data: toInsert.map((item) => ({
        title: item.title,
        type: item.type,
        genre: item.genre,
        vibes: item.vibes,
        year: item.year,
        cover: item.cover,
        description: item.description,
        people: item.people,
        awards: item.awards,
        platforms: item.platforms,
        ext: item.ext,
        totalEp: item.totalEp,
        isUpcoming: false,
      })),
      skipDuplicates: true,
    });
  }

  const musicCount = await prisma.item.count({ where: { type: "music" } });
  const podcastCount = await prisma.item.count({ where: { type: "podcast" } });
  const totalCount = await prisma.item.count();

  console.log(`\n✅ Done!`);
  console.log(`  Music: ${musicCount}`);
  console.log(`  Podcasts: ${podcastCount}`);
  console.log(`  Total items in DB: ${totalCount}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
