/**
 * Backfill missing franchise items from APIs.
 * Searches TMDB, IGDB, Google Books, and Jikan for known franchise members
 * and adds any that are missing from our database.
 *
 * Run: npx tsx scripts/backfill-franchises.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;
const GOOGLE_BOOKS_KEY = process.env.GOOGLE_BOOKS_API_KEY!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── TMDB helpers ────────────────────────────────────────────────────────
async function searchTMDB(title: string, type: "movie" | "tv"): Promise<any | null> {
  const data = await fetchJson(
    `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`
  );
  return (data.results || [])[0] || null;
}

async function getTMDBDetails(id: number, type: "movie" | "tv"): Promise<any> {
  return fetchJson(`https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}&append_to_response=credits`);
}

function tmdbToItem(d: any, type: "movie" | "tv") {
  const title = d.title || d.name || "";
  const year = parseInt((d.release_date || d.first_air_date || "0").slice(0, 4)) || 0;
  const genres = (d.genres || []).map((g: any) => g.name);
  const people: any[] = [];

  if (d.credits) {
    const directors = (d.credits.crew || []).filter((c: any) => c.job === "Director").slice(0, 3);
    directors.forEach((c: any) => people.push({ name: c.name, role: "Director" }));
    const cast = (d.credits.cast || []).slice(0, 5);
    cast.forEach((c: any) => people.push({ name: c.name, role: c.character || "Actor" }));
  }

  return {
    title,
    type,
    genre: genres,
    vibes: [],
    year,
    cover: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
    description: d.overview || "",
    people,
    awards: [],
    platforms: [],
    ext: {},
    totalEp: d.number_of_episodes || 0,
    isUpcoming: false,
    popularityScore: d.popularity || 0,
    voteCount: d.vote_count || 0,
  };
}

// ── IGDB helper ─────────────────────────────────────────────────────────
let igdbToken = "";
async function getIGDBToken() {
  if (igdbToken) return igdbToken;
  const data = await fetchJson(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  igdbToken = data.access_token;
  return igdbToken;
}

async function searchIGDB(title: string): Promise<any[]> {
  const token = await getIGDBToken();
  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: { "Client-ID": IGDB_ID, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: `search "${title}"; fields name,cover.url,summary,genres.name,first_release_date,total_rating,total_rating_count,platforms.name,involved_companies.company.name,involved_companies.developer; limit 5;`,
  });
  return res.json();
}

function igdbToItem(g: any) {
  const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : 0;
  const genres = (g.genres || []).map((ge: any) => ge.name);
  const people: any[] = [];
  (g.involved_companies || []).filter((c: any) => c.developer).forEach((c: any) => {
    people.push({ name: c.company?.name || "Unknown", role: "Developer" });
  });
  const platforms = (g.platforms || []).map((p: any) => p.name);
  const cover = g.cover?.url ? "https:" + g.cover.url.replace("t_thumb", "t_cover_big") : "";

  return {
    title: g.name,
    type: "game" as const,
    genre: genres,
    vibes: [],
    year,
    cover,
    description: g.summary || "",
    people,
    awards: [],
    platforms,
    ext: {},
    totalEp: 0,
    isUpcoming: false,
    popularityScore: g.total_rating_count || 0,
    voteCount: g.total_rating_count || 0,
  };
}

// ── Google Books helper ─────────────────────────────────────────────────
async function searchBooks(query: string): Promise<any | null> {
  const data = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3&key=${GOOGLE_BOOKS_KEY}`
  );
  return (data.items || [])[0] || null;
}

function bookToItem(vol: any) {
  const info = vol.volumeInfo || {};
  return {
    title: info.title || "",
    type: "book" as const,
    genre: info.categories || ["Fiction"],
    vibes: [],
    year: parseInt((info.publishedDate || "0").slice(0, 4)) || 0,
    cover: info.imageLinks?.thumbnail?.replace("zoom=1", "zoom=0") || "",
    description: info.description || "",
    people: (info.authors || []).map((a: string) => ({ name: a, role: "Author" })),
    awards: [],
    platforms: [],
    ext: {},
    totalEp: 0,
    isUpcoming: false,
    popularityScore: info.ratingsCount || 0,
    voteCount: info.ratingsCount || 0,
  };
}

// ── Franchise definitions — what SHOULD exist ───────────────────────────
interface FranchiseSpec {
  name: string;
  icon: string;
  movies?: string[];
  tv?: string[];
  games?: string[];
  books?: string[];
  comics?: string[];
  manga?: string[];
}

const FRANCHISE_SPECS: FranchiseSpec[] = [
  {
    name: "Spider-Man",
    icon: "🕷",
    movies: [
      "Spider-Man (2002)", "Spider-Man 2", "Spider-Man 3",
      "The Amazing Spider-Man", "The Amazing Spider-Man 2",
      "Spider-Man: Homecoming", "Spider-Man: Far From Home", "Spider-Man: No Way Home",
      "Spider-Man: Into the Spider-Verse", "Spider-Man: Across the Spider-Verse",
      "Spider-Man: Beyond the Spider-Verse", "Venom", "Venom: Let There Be Carnage",
    ],
    games: [
      "Marvel's Spider-Man", "Marvel's Spider-Man: Miles Morales", "Marvel's Spider-Man 2",
    ],
    tv: ["The Spectacular Spider-Man"],
  },
  {
    name: "Batman",
    icon: "🦇",
    movies: [
      "Batman (1989)", "Batman Returns", "Batman Forever", "Batman & Robin",
      "Batman Begins", "The Dark Knight", "The Dark Knight Rises",
      "The Batman", "The Batman Part II",
      "Batman: Mask of the Phantasm", "Batman: Under the Red Hood",
      "The LEGO Batman Movie",
    ],
    tv: ["Batman: The Animated Series", "Gotham", "Batwoman", "The Penguin"],
    games: [
      "Batman: Arkham Asylum", "Batman: Arkham City", "Batman: Arkham Knight",
      "Batman: Arkham Origins", "Gotham Knights",
    ],
    comics: ["Batman"],
  },
  {
    name: "Marvel Cinematic Universe",
    icon: "🦸",
    movies: [
      "Iron Man", "Iron Man 2", "Iron Man 3",
      "Thor", "Thor: The Dark World", "Thor: Ragnarok", "Thor: Love and Thunder",
      "Captain America: The First Avenger", "Captain America: The Winter Soldier", "Captain America: Civil War",
      "The Avengers", "Avengers: Age of Ultron", "Avengers: Infinity War", "Avengers: Endgame", "Avengers: Doomsday",
      "Guardians of the Galaxy", "Guardians of the Galaxy Vol. 2", "Guardians of the Galaxy Vol. 3",
      "Black Panther", "Black Panther: Wakanda Forever",
      "Doctor Strange", "Doctor Strange in the Multiverse of Madness",
      "Ant-Man", "Ant-Man and the Wasp", "Ant-Man and the Wasp: Quantumania",
      "Captain Marvel", "Shang-Chi and the Legend of the Ten Rings",
      "Eternals", "Black Widow",
      "Deadpool & Wolverine",
    ],
    tv: [
      "WandaVision", "Loki", "The Falcon and the Winter Soldier",
      "Hawkeye", "Moon Knight", "Ms. Marvel", "She-Hulk: Attorney at Law",
      "Daredevil", "Daredevil: Born Again",
    ],
  },
  {
    name: "X-Men",
    icon: "🧬",
    movies: [
      "X-Men", "X2", "X-Men: The Last Stand",
      "X-Men: First Class", "X-Men: Days of Future Past", "X-Men: Apocalypse", "X-Men: Dark Phoenix",
      "Logan", "The Wolverine",
      "Deadpool", "Deadpool 2",
    ],
  },
  {
    name: "Harry Potter",
    icon: "⚡",
    movies: [
      "Harry Potter and the Philosopher's Stone", "Harry Potter and the Chamber of Secrets",
      "Harry Potter and the Prisoner of Azkaban", "Harry Potter and the Goblet of Fire",
      "Harry Potter and the Order of the Phoenix", "Harry Potter and the Half-Blood Prince",
      "Harry Potter and the Deathly Hallows: Part 1", "Harry Potter and the Deathly Hallows: Part 2",
      "Fantastic Beasts and Where to Find Them", "Fantastic Beasts: The Crimes of Grindelwald",
      "Fantastic Beasts: The Secrets of Dumbledore",
    ],
    books: [
      "Harry Potter and the Sorcerer's Stone J.K. Rowling",
      "Harry Potter and the Chamber of Secrets J.K. Rowling",
      "Harry Potter and the Prisoner of Azkaban J.K. Rowling",
      "Harry Potter and the Goblet of Fire J.K. Rowling",
      "Harry Potter and the Order of the Phoenix J.K. Rowling",
      "Harry Potter and the Half-Blood Prince J.K. Rowling",
      "Harry Potter and the Deathly Hallows J.K. Rowling",
    ],
    games: ["Hogwarts Legacy", "Harry Potter: Quidditch Champions"],
  },
  {
    name: "Lord of the Rings",
    icon: "💍",
    books: [
      "The Fellowship of the Ring J.R.R. Tolkien",
      "The Two Towers J.R.R. Tolkien",
      "The Return of the King J.R.R. Tolkien",
      "The Hobbit J.R.R. Tolkien",
      "The Silmarillion J.R.R. Tolkien",
    ],
    games: [
      "Middle-earth: Shadow of Mordor", "Middle-earth: Shadow of War",
      "LEGO The Lord of the Rings",
    ],
  },
  {
    name: "The Witcher",
    icon: "🐺",
    books: [
      "The Last Wish Andrzej Sapkowski",
      "Blood of Elves Andrzej Sapkowski",
      "The Sword of Destiny Andrzej Sapkowski",
    ],
  },
  {
    name: "Resident Evil",
    icon: "🧟",
    movies: [
      "Resident Evil (2002)", "Resident Evil: Apocalypse",
      "Resident Evil: Extinction", "Resident Evil: Afterlife",
      "Resident Evil: Retribution", "Resident Evil: The Final Chapter",
      "Resident Evil: Welcome to Raccoon City",
    ],
    games: [
      "Resident Evil", "Resident Evil 2", "Resident Evil 3",
      "Resident Evil 4", "Resident Evil 5", "Resident Evil 6",
      "Resident Evil 7: Biohazard", "Resident Evil Village",
    ],
    tv: ["Resident Evil"],
  },
];

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Load all existing titles for dedup
  const existing = await prisma.item.findMany({
    select: { id: true, title: true, type: true, year: true },
  });
  const titleKey = (t: string, type: string) => `${t.toLowerCase().replace(/[^a-z0-9]/g, "")}|${type}`;
  const existingKeys = new Set(existing.map((i) => titleKey(i.title, i.type)));

  let added = 0;
  let skipped = 0;
  let failed = 0;
  const newItemIds: Map<string, number[]> = new Map(); // franchise name -> item IDs

  for (const spec of FRANCHISE_SPECS) {
    console.log(`\n═══ ${spec.icon} ${spec.name} ═══`);
    const franchiseItemIds: number[] = [];

    // Collect existing items that match this franchise
    const existingMatches = existing.filter((i) => {
      const lower = i.title.toLowerCase();
      const specName = spec.name.toLowerCase();
      return lower.includes(specName) ||
        (spec.name === "Lord of the Rings" && (lower.includes("lord of the rings") || lower.includes("hobbit") || lower.includes("rings of power") || lower.includes("middle-earth"))) ||
        (spec.name === "Harry Potter" && (lower.includes("harry potter") || lower.includes("fantastic beasts") || lower.includes("hogwarts"))) ||
        (spec.name === "Marvel Cinematic Universe" && (lower.includes("avenger") || lower.includes("iron man") || lower.includes("captain america") || lower.includes("thor:") || lower.includes("black panther") || lower.includes("guardians of the galaxy") || lower.includes("doctor strange") || lower.includes("ant-man") || lower.includes("captain marvel") || lower.includes("eternals") || lower.includes("black widow") || lower.includes("wandavision") || lower.includes("loki") || lower.includes("hawkeye") || lower.includes("moon knight") || lower.includes("she-hulk") || lower.includes("daredevil") || lower.includes("shang-chi"))) ||
        (spec.name === "X-Men" && (lower.includes("x-men") || lower.includes("wolverine") || lower.includes("deadpool") || lower.includes("logan")));
    });
    existingMatches.forEach((m) => franchiseItemIds.push(m.id));
    console.log(`  Existing in DB: ${existingMatches.length} items`);

    // Process movies
    if (spec.movies) {
      for (const title of spec.movies) {
        const cleanTitle = title.replace(/\s*\(\d{4}\)/, "");
        const yearMatch = title.match(/\((\d{4})\)/);

        // Check if already exists
        if (existingKeys.has(titleKey(cleanTitle, "movie"))) {
          const match = existing.find((i) => i.type === "movie" && i.title.toLowerCase().includes(cleanTitle.toLowerCase().slice(0, 20)));
          if (match && !franchiseItemIds.includes(match.id)) franchiseItemIds.push(match.id);
          skipped++;
          continue;
        }

        try {
          let searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(cleanTitle)}`;
          if (yearMatch) searchUrl += `&year=${yearMatch[1]}`;
          const searchData = await fetchJson(searchUrl);
          await sleep(260);

          const match = (searchData.results || []).find((r: any) => {
            const t = (r.title || "").toLowerCase();
            const ct = cleanTitle.toLowerCase();
            return t === ct || t.includes(ct) || ct.includes(t);
          });

          if (match) {
            const details = await getTMDBDetails(match.id, "movie");
            await sleep(260);
            const item = tmdbToItem(details, "movie");

            if (item.title && item.year > 0) {
              const created = await prisma.item.create({ data: item });
              franchiseItemIds.push(created.id);
              existingKeys.add(titleKey(item.title, "movie"));
              added++;
              console.log(`  ✓ Added movie: ${item.title} (${item.year})`);
            }
          } else {
            console.log(`  ✗ Not found on TMDB: ${cleanTitle}`);
            failed++;
          }
        } catch (e: any) {
          console.log(`  ✗ Error adding ${cleanTitle}: ${e.message?.slice(0, 80)}`);
          failed++;
        }
      }
    }

    // Process TV shows
    if (spec.tv) {
      for (const title of spec.tv) {
        if (existingKeys.has(titleKey(title, "tv"))) {
          const match = existing.find((i) => i.type === "tv" && i.title.toLowerCase().includes(title.toLowerCase().slice(0, 15)));
          if (match && !franchiseItemIds.includes(match.id)) franchiseItemIds.push(match.id);
          skipped++;
          continue;
        }

        try {
          const searchData = await fetchJson(
            `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`
          );
          await sleep(260);

          const match = (searchData.results || [])[0];
          if (match) {
            const details = await getTMDBDetails(match.id, "tv");
            await sleep(260);
            const item = tmdbToItem(details, "tv");
            if (item.title && item.year > 0) {
              const created = await prisma.item.create({ data: item });
              franchiseItemIds.push(created.id);
              existingKeys.add(titleKey(item.title, "tv"));
              added++;
              console.log(`  ✓ Added TV: ${item.title} (${item.year})`);
            }
          } else {
            failed++;
          }
        } catch (e: any) {
          failed++;
        }
      }
    }

    // Process games
    if (spec.games) {
      for (const title of spec.games) {
        if (existingKeys.has(titleKey(title, "game"))) {
          const match = existing.find((i) => i.type === "game" && i.title.toLowerCase().includes(title.toLowerCase().slice(0, 15)));
          if (match && !franchiseItemIds.includes(match.id)) franchiseItemIds.push(match.id);
          skipped++;
          continue;
        }

        try {
          const games = await searchIGDB(title);
          await sleep(300);

          const match = games.find((g: any) => {
            const gn = (g.name || "").toLowerCase();
            const tn = title.toLowerCase();
            return gn === tn || gn.includes(tn) || tn.includes(gn);
          });

          if (match) {
            const item = igdbToItem(match);
            if (item.title && item.year > 0) {
              const created = await prisma.item.create({ data: item });
              franchiseItemIds.push(created.id);
              existingKeys.add(titleKey(item.title, "game"));
              added++;
              console.log(`  ✓ Added game: ${item.title} (${item.year})`);
            }
          } else {
            console.log(`  ✗ Not found on IGDB: ${title}`);
            failed++;
          }
        } catch (e: any) {
          failed++;
        }
      }
    }

    // Process books
    if (spec.books) {
      for (const query of spec.books) {
        const bookTitle = query.split(/(?=[A-Z][a-z])/)[0]?.trim() || query;
        if (existingKeys.has(titleKey(bookTitle, "book"))) {
          skipped++;
          continue;
        }

        try {
          const vol = await searchBooks(query);
          await sleep(300);

          if (vol) {
            const item = bookToItem(vol);
            if (item.title && item.year > 0) {
              const created = await prisma.item.create({ data: item });
              franchiseItemIds.push(created.id);
              existingKeys.add(titleKey(item.title, "book"));
              added++;
              console.log(`  ✓ Added book: ${item.title} (${item.year})`);
            }
          } else {
            failed++;
          }
        } catch (e: any) {
          failed++;
        }
      }
    }

    newItemIds.set(spec.name, franchiseItemIds);
    console.log(`  Total items for ${spec.name}: ${franchiseItemIds.length}`);
  }

  // ── Create/update franchise links ─────────────────────────────────────
  console.log("\n\n═══ LINKING FRANCHISES ═══\n");

  for (const spec of FRANCHISE_SPECS) {
    const itemIds = newItemIds.get(spec.name) || [];
    const uniqueIds = [...new Set(itemIds)];

    if (uniqueIds.length < 2) {
      console.log(`  ⚠ ${spec.name}: only ${uniqueIds.length} items, skipping`);
      continue;
    }

    // Check if franchise already exists
    let franchise = await prisma.franchise.findFirst({
      where: { name: { contains: spec.name, mode: "insensitive" } },
      include: { items: true },
    });

    if (franchise) {
      // Add any new items to existing franchise
      const existingItemIds = new Set(franchise.items.map((fi) => fi.itemId));
      const toAdd = uniqueIds.filter((id) => !existingItemIds.has(id));

      if (toAdd.length > 0) {
        for (const id of toAdd) {
          try {
            await prisma.franchiseItem.create({
              data: { franchiseId: franchise.id, itemId: id, addedBy: "auto" },
            });
          } catch { /* skip duplicates */ }
        }
        console.log(`  ✓ ${spec.name}: added ${toAdd.length} new items to existing franchise (total: ${existingItemIds.size + toAdd.length})`);
      } else {
        console.log(`  ✓ ${spec.name}: already complete (${existingItemIds.size} items)`);
      }
    } else {
      // Create new franchise
      try {
        await prisma.franchise.create({
          data: {
            name: spec.name,
            icon: spec.icon,
            description: `${spec.name} franchise across all media`,
            autoGenerated: true,
            confidenceTier: 1,
            items: {
              create: uniqueIds.map((id) => ({ itemId: id, addedBy: "auto" })),
            },
          },
        });
        console.log(`  ✓ ${spec.name}: created with ${uniqueIds.length} items`);
      } catch (e: any) {
        console.log(`  ✗ ${spec.name}: ${e.message?.slice(0, 100)}`);
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\n\n════════════════════════════════════════════════════════");
  console.log("📊 BACKFILL SUMMARY");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  Items added:   ${added}`);
  console.log(`  Items skipped: ${skipped} (already in DB)`);
  console.log(`  Items failed:  ${failed}`);
  console.log("════════════════════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch((e) => { console.error("Failed:", e.message); process.exit(1); });
