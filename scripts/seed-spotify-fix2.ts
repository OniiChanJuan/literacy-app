import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SPOTIFY_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 100))}`);
  return res.json();
}

let token = "";
async function getToken(): Promise<string> {
  if (token) return token;
  const data = await fetchJson("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${SPOTIFY_ID}:${SPOTIFY_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  token = data.access_token;
  return token;
}

async function search(query: string, type: "album" | "show", limit: number, genreTags?: string[]): Promise<any[]> {
  const t = await getToken();
  const items: any[] = [];
  // Use limit of 10 per request — Spotify is being strict
  for (let offset = 0; offset < limit; offset += 10) {
    const batch = Math.min(10, limit - offset);
    try {
      const data = await fetchJson(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=${batch}&offset=${offset}&market=US`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      const results = type === "album" ? data.albums?.items : data.shows?.items;
      for (const r of results || []) {
        if (!r.name || !r.images?.[0]?.url) continue;
        if (type === "album") {
          items.push({
            title: r.name,
            type: "music",
            genre: genreTags || [],
            vibes: [],
            year: parseInt((r.release_date || "0").slice(0, 4)) || 0,
            cover: r.images[0].url,
            description: `${r.name} by ${(r.artists || []).map((a: any) => a.name).join(", ")}. ${r.total_tracks || 0} tracks.`,
            people: (r.artists || []).map((a: any) => ({ role: "Artist", name: a.name })).slice(0, 3),
            awards: [], platforms: ["spotify", "apple_music"], ext: {}, totalEp: r.total_tracks || 0,
          });
        } else {
          const desc = (r.description || "").toLowerCase();
          const g: string[] = [];
          if (desc.includes("crime")) g.push("True Crime");
          if (desc.includes("comedy")) g.push("Comedy");
          if (desc.includes("news")) g.push("News");
          if (desc.includes("tech") || desc.includes("science")) g.push("Technology");
          if (desc.includes("business")) g.push("Business");
          if (desc.includes("history")) g.push("History");
          if (g.length === 0) g.push("General");
          items.push({
            title: r.name,
            type: "podcast",
            genre: g.slice(0, 3),
            vibes: [],
            year: 0,
            cover: r.images[0].url,
            description: (r.description || "").slice(0, 500),
            people: [{ role: "Host", name: r.publisher || "Unknown" }],
            awards: [], platforms: ["spotify", "apple_pod"], ext: {}, totalEp: r.total_episodes || 0,
          });
        }
      }
      await sleep(150);
    } catch (e: any) {
      console.warn(`  "${query}" offset ${offset}: ${e.message}`);
    }
  }
  return items;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.item.findMany({
    where: { type: { in: ["music", "podcast"] } },
    select: { title: true, type: true },
  });
  const seen = new Set(existing.map((e) => `${e.title}|||${e.type}`));
  console.log(`${seen.size} music/podcast items already in DB\n`);

  const all: any[] = [];

  // Albums
  const albumQ: [string, string[]][] = [
    ["greatest albums ever made", ["Rock", "Pop"]],
    ["best hip hop rap albums", ["Hip-Hop"]],
    ["classic rock albums", ["Rock"]],
    ["best pop albums hits", ["Pop"]],
    ["top country albums", ["Country"]],
    ["best latin music albums", ["Latin"]],
    ["kpop best albums", ["K-Pop"]],
    ["best metal albums heavy", ["Metal"]],
    ["best soul funk albums", ["Soul"]],
    ["best alternative albums", ["Alternative"]],
    ["best punk albums", ["Punk"]],
    ["best reggae albums", ["Reggae"]],
    ["best blues albums", ["Blues"]],
    ["best world music albums", ["World"]],
  ];

  for (const [q, g] of albumQ) {
    console.log(`Albums: "${q}"...`);
    all.push(...await search(q, "album", 10, g));
  }

  // Podcasts
  const podQ = [
    "popular podcasts 2024",
    "best true crime podcast",
    "comedy podcast popular",
    "technology podcast",
    "business podcast",
    "science podcast",
    "history podcast",
    "health wellness podcast",
    "sports podcast",
    "education podcast",
  ];

  for (const q of podQ) {
    console.log(`Podcasts: "${q}"...`);
    all.push(...await search(q, "show", 10));
  }

  const toInsert = all.filter((item) => {
    const key = `${item.title}|||${item.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\nFetched: ${all.length}, New: ${toInsert.length}`);

  if (toInsert.length > 0) {
    await prisma.item.createMany({
      data: toInsert.map((item) => ({
        ...item,
        description: item.description,
        isUpcoming: false,
      })),
      skipDuplicates: true,
    });
  }

  const music = await prisma.item.count({ where: { type: "music" } });
  const podcast = await prisma.item.count({ where: { type: "podcast" } });
  const total = await prisma.item.count();
  console.log(`\nMusic: ${music}, Podcasts: ${podcast}, Total: ${total}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
