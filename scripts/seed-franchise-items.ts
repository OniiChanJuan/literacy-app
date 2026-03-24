/**
 * Seed missing franchise items across all media types.
 * For each known franchise, search all connected APIs for items
 * that should be in our catalog but aren't.
 *
 * Run: npx tsx scripts/seed-franchise-items.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Franchises to seed — search terms for each API
const FRANCHISE_SEEDS: {
  name: string;
  tmdbMovieSearch?: string[];
  tmdbTvSearch?: string[];
  igdbSearch?: string[];
  jikanSearch?: string[];
}[] = [
  // ── MOVIES/TV ──
  { name: "Scream", tmdbMovieSearch: ["Scream"], tmdbTvSearch: ["Scream"] },
  { name: "Resident Evil", tmdbMovieSearch: ["Resident Evil"], igdbSearch: ["Resident Evil"] },
  { name: "Star Wars", tmdbMovieSearch: ["Star Wars"], tmdbTvSearch: ["Star Wars", "Mandalorian", "Andor", "Ahsoka", "Obi-Wan Kenobi"] },
  { name: "Harry Potter", tmdbMovieSearch: ["Harry Potter"], tmdbTvSearch: ["Harry Potter"] },
  { name: "Lord of the Rings", tmdbMovieSearch: ["Lord of the Rings", "The Hobbit"], tmdbTvSearch: ["Rings of Power"] },
  { name: "James Bond", tmdbMovieSearch: ["James Bond", "007"] },
  { name: "Fast & Furious", tmdbMovieSearch: ["Fast Furious", "Fast & Furious"] },
  { name: "John Wick", tmdbMovieSearch: ["John Wick"] },
  { name: "The Matrix", tmdbMovieSearch: ["The Matrix"] },
  { name: "Alien", tmdbMovieSearch: ["Alien"] },
  { name: "Jurassic Park", tmdbMovieSearch: ["Jurassic Park", "Jurassic World"] },
  { name: "Mission: Impossible", tmdbMovieSearch: ["Mission Impossible"] },
  { name: "Toy Story", tmdbMovieSearch: ["Toy Story"] },
  { name: "Transformers", tmdbMovieSearch: ["Transformers"] },
  { name: "The Conjuring", tmdbMovieSearch: ["Conjuring", "Annabelle", "The Nun"] },
  { name: "Ghostbusters", tmdbMovieSearch: ["Ghostbusters"] },
  { name: "Pirates of the Caribbean", tmdbMovieSearch: ["Pirates of the Caribbean"] },
  { name: "Halloween", tmdbMovieSearch: ["Halloween"] },
  { name: "The Hunger Games", tmdbMovieSearch: ["Hunger Games"] },
  { name: "Twilight", tmdbMovieSearch: ["Twilight Saga"] },
  { name: "The Witcher", tmdbTvSearch: ["The Witcher"], igdbSearch: ["The Witcher"] },
  { name: "Game of Thrones", tmdbTvSearch: ["Game of Thrones", "House of the Dragon"] },
  { name: "The Last of Us", tmdbTvSearch: ["The Last of Us"], igdbSearch: ["The Last of Us"] },
  { name: "Halo", tmdbTvSearch: ["Halo"], igdbSearch: ["Halo"] },

  // ── GAMES ──
  { name: "Grand Theft Auto", igdbSearch: ["Grand Theft Auto"] },
  { name: "God of War", igdbSearch: ["God of War"] },
  { name: "Uncharted", igdbSearch: ["Uncharted"] },
  { name: "Metal Gear", igdbSearch: ["Metal Gear Solid"] },
  { name: "Mass Effect", igdbSearch: ["Mass Effect"] },
  { name: "Dark Souls / Elden Ring", igdbSearch: ["Dark Souls", "Elden Ring", "Bloodborne", "Sekiro"] },
  { name: "Pokémon", igdbSearch: ["Pokemon"] },
  { name: "Final Fantasy", igdbSearch: ["Final Fantasy"] },
  { name: "Persona", igdbSearch: ["Persona"] },
  { name: "Resident Evil", igdbSearch: ["Resident Evil"] },
  { name: "Zelda", igdbSearch: ["Legend of Zelda"] },
  { name: "Super Mario", igdbSearch: ["Super Mario"] },
  { name: "Metroid", igdbSearch: ["Metroid"] },
  { name: "Doom", igdbSearch: ["Doom"] },
  { name: "BioShock", igdbSearch: ["BioShock"] },
  { name: "Fallout", igdbSearch: ["Fallout"] },
  { name: "Elder Scrolls", igdbSearch: ["Elder Scrolls"] },
  { name: "Assassin's Creed", igdbSearch: ["Assassin's Creed"] },

  // ── ANIME/MANGA ──
  { name: "Dragon Ball", jikanSearch: ["Dragon Ball"], tmdbTvSearch: ["Dragon Ball"] },
  { name: "Naruto", jikanSearch: ["Naruto"], tmdbTvSearch: ["Naruto"] },
  { name: "Bleach", jikanSearch: ["Bleach"] },
  { name: "Berserk", jikanSearch: ["Berserk"] },
  { name: "Cowboy Bebop", jikanSearch: ["Cowboy Bebop"], tmdbTvSearch: ["Cowboy Bebop"] },
  { name: "Ghost in the Shell", jikanSearch: ["Ghost in the Shell"], tmdbMovieSearch: ["Ghost in the Shell"] },
  { name: "Neon Genesis Evangelion", jikanSearch: ["Evangelion"] },
];

async function main() {
  console.log("🌱 Seeding Missing Franchise Items\n");

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Get all existing titles to avoid duplicates
  const existing = await prisma.item.findMany({
    select: { title: true, type: true },
  });
  const existingSet = new Set(existing.map((i) => `${i.title.toLowerCase()}|${i.type}`));
  function alreadyExists(title: string, type: string): boolean {
    return existingSet.has(`${title.toLowerCase()}|${type}`);
  }

  let totalAdded = 0;

  // Get IGDB token
  let igdbToken = "";
  try {
    const tokenData = await fetchJson(
      `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    igdbToken = tokenData.access_token;
  } catch {}

  for (const seed of FRANCHISE_SEEDS) {
    console.log(`\n📦 ${seed.name}:`);

    // ── TMDB Movies ──
    if (seed.tmdbMovieSearch) {
      for (const query of seed.tmdbMovieSearch) {
        try {
          const data = await fetchJson(
            `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`
          );
          await sleep(260);

          for (const r of (data.results || []).slice(0, 10)) {
            if (!r.title || r.vote_average < 5 || r.vote_count < 50) continue;
            if (alreadyExists(r.title, "movie")) continue;

            const poster = r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : "";
            const year = r.release_date ? parseInt(r.release_date.split("-")[0]) : 0;
            if (!year) continue;

            await prisma.item.create({
              data: {
                title: r.title,
                type: "movie",
                genre: [],
                vibes: ["immersive"],
                year,
                cover: poster,
                description: r.overview || "",
                people: [],
                awards: [],
                platforms: [],
                ext: r.vote_average ? { imdb: Math.round(r.vote_average * 10) / 10 } : {},
                totalEp: 0,
              },
            });

            // Also add to external_scores
            if (r.vote_average) {
              const newItem = await prisma.item.findFirst({
                where: { title: r.title, type: "movie", year },
                select: { id: true },
              });
              if (newItem) {
                await prisma.externalScore.upsert({
                  where: { itemId_source: { itemId: newItem.id, source: "imdb" } },
                  update: { score: r.vote_average, maxScore: 10, scoreType: "community" },
                  create: { itemId: newItem.id, source: "imdb", score: r.vote_average, maxScore: 10, scoreType: "community" },
                });
              }
            }

            existingSet.add(`${r.title.toLowerCase()}|movie`);
            totalAdded++;
            console.log(`  + ${r.title} (${year}) [movie]`);
          }
        } catch {}
      }
    }

    // ── TMDB TV ──
    if (seed.tmdbTvSearch) {
      for (const query of seed.tmdbTvSearch) {
        try {
          const data = await fetchJson(
            `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`
          );
          await sleep(260);

          for (const r of (data.results || []).slice(0, 5)) {
            if (!r.name || r.vote_average < 5 || r.vote_count < 20) continue;
            if (alreadyExists(r.name, "tv")) continue;

            const poster = r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : "";
            const year = r.first_air_date ? parseInt(r.first_air_date.split("-")[0]) : 0;
            if (!year) continue;

            await prisma.item.create({
              data: {
                title: r.name,
                type: "tv",
                genre: [],
                vibes: ["immersive"],
                year,
                cover: poster,
                description: r.overview || "",
                people: [],
                awards: [],
                platforms: [],
                ext: r.vote_average ? { imdb: Math.round(r.vote_average * 10) / 10 } : {},
                totalEp: 0,
              },
            });

            existingSet.add(`${r.name.toLowerCase()}|tv`);
            totalAdded++;
            console.log(`  + ${r.name} (${year}) [tv]`);
          }
        } catch {}
      }
    }

    // ── IGDB Games ──
    if (seed.igdbSearch && igdbToken) {
      for (const query of seed.igdbSearch) {
        try {
          const res = await fetch("https://api.igdb.com/v4/games", {
            method: "POST",
            headers: { "Client-ID": IGDB_ID, Authorization: `Bearer ${igdbToken}`, "Content-Type": "text/plain" },
            body: `search "${query}"; fields name,cover.image_id,first_release_date,summary,aggregated_rating,rating,genres.name; where rating > 60 & rating_count > 10; limit 15;`,
          });
          const games = await res.json();
          await sleep(300);

          for (const g of games) {
            if (!g.name) continue;
            if (alreadyExists(g.name, "game")) continue;

            const coverId = g.cover?.image_id;
            const cover = coverId ? `https://images.igdb.com/igdb/image/upload/t_720p/${coverId}.jpg` : "";
            const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : 0;
            if (!year) continue;

            const genres = (g.genres || []).map((genre: any) => genre.name).filter(Boolean);

            await prisma.item.create({
              data: {
                title: g.name,
                type: "game",
                genre: genres,
                vibes: ["immersive"],
                year,
                cover,
                description: g.summary || "",
                people: [],
                awards: [],
                platforms: [],
                ext: g.aggregated_rating ? { metacritic: Math.round(g.aggregated_rating) } : {},
                totalEp: 0,
              },
            });

            existingSet.add(`${g.name.toLowerCase()}|game`);
            totalAdded++;
            console.log(`  + ${g.name} (${year}) [game]`);
          }
        } catch {}
      }
    }

    // ── Jikan Anime/Manga ──
    if (seed.jikanSearch) {
      for (const query of seed.jikanSearch) {
        // Search anime
        try {
          const data = await fetchJson(
            `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=10&order_by=score&sort=desc`
          );
          await sleep(500);

          for (const a of (data.data || []).slice(0, 8)) {
            if (!a.title_english && !a.title) continue;
            const title = a.title_english || a.title;
            if (alreadyExists(title, "tv")) continue;
            if (a.score < 6) continue;

            const cover = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || "";
            const year = a.aired?.from ? new Date(a.aired.from).getFullYear() : a.year || 0;
            if (!year) continue;

            const genres = (a.genres || []).map((g: any) => g.name).filter(Boolean);
            if (!genres.includes("Anime")) genres.push("Anime");

            await prisma.item.create({
              data: {
                title,
                type: "tv",
                genre: genres,
                vibes: ["epic", "immersive"],
                year,
                cover,
                description: a.synopsis || "",
                people: [],
                awards: [],
                platforms: [],
                ext: a.score ? { mal: a.score } : {},
                totalEp: a.episodes || 0,
              },
            });

            if (a.score) {
              const newItem = await prisma.item.findFirst({
                where: { title, type: "tv", year },
                select: { id: true },
              });
              if (newItem) {
                await prisma.externalScore.upsert({
                  where: { itemId_source: { itemId: newItem.id, source: "mal" } },
                  update: { score: a.score, maxScore: 10, scoreType: "community" },
                  create: { itemId: newItem.id, source: "mal", score: a.score, maxScore: 10, scoreType: "community" },
                });
              }
            }

            existingSet.add(`${title.toLowerCase()}|tv`);
            totalAdded++;
            console.log(`  + ${title} (${year}) [anime]`);
          }
        } catch {}

        // Search manga
        try {
          const data = await fetchJson(
            `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=5&order_by=score&sort=desc`
          );
          await sleep(500);

          for (const m of (data.data || []).slice(0, 4)) {
            if (!m.title_english && !m.title) continue;
            const title = m.title_english || m.title;
            if (alreadyExists(title, "manga")) continue;
            if (m.score < 6) continue;

            const cover = m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || "";
            const year = m.published?.from ? new Date(m.published.from).getFullYear() : 0;
            if (!year) continue;

            await prisma.item.create({
              data: {
                title,
                type: "manga",
                genre: (m.genres || []).map((g: any) => g.name).filter(Boolean),
                vibes: ["immersive"],
                year,
                cover,
                description: m.synopsis || "",
                people: (m.authors || []).map((a: any) => ({ name: a.name, role: "Author" })),
                awards: [],
                platforms: [],
                ext: m.score ? { mal: m.score } : {},
                totalEp: m.chapters || 0,
              },
            });

            existingSet.add(`${title.toLowerCase()}|manga`);
            totalAdded++;
            console.log(`  + ${title} (${year}) [manga]`);
          }
        } catch {}
      }
    }
  }

  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`📊 Total new items added: ${totalAdded}`);
  console.log(`════════════════════════════════════════════════════════\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
