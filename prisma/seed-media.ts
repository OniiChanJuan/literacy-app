/**
 * Seed music, podcasts, and comics from Spotify + Comic Vine APIs.
 * Run: npx tsx prisma/seed-media.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DB_URL = "postgresql://postgres:Baylorlawsucks2021@db.shlyuoeabdaifketvaeo.supabase.co:5432/postgres";
const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

// ── Spotify helpers ──────────────────────────────────────────────────────

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";

let spotifyToken = "";
let tokenExpiry = 0;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < tokenExpiry) return spotifyToken;
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  spotifyToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return spotifyToken;
}

async function spotifyFetch(path: string): Promise<any> {
  const token = await getSpotifyToken();
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2");
      console.log(`  Rate limited, waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      return spotifyFetch(path);
    }
    return null;
  }
  return res.json();
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Genre/Vibe mapping ──────────────────────────────────────────────────

const GENRE_MAP: Record<string, string> = {
  "art rock": "Alternative", "alternative rock": "Alternative", "indie rock": "Indie",
  "indie pop": "Indie", "hip hop": "Hip-Hop", "rap": "Hip-Hop", "pop": "Pop",
  "r&b": "R&B", "soul": "Soul", "jazz": "Jazz", "classical": "Classical",
  "electronic": "Electronic", "edm": "Electronic", "rock": "Rock", "metal": "Metal",
  "punk": "Punk", "country": "Country", "folk": "Folk", "latin": "Latin",
  "k-pop": "K-Pop", "reggaeton": "Latin", "blues": "Blues", "funk": "Funk",
  "disco": "Disco", "house": "Electronic", "techno": "Electronic",
  "ambient": "Ambient", "trip hop": "Electronic", "grunge": "Rock",
  "new wave": "New Wave", "synthpop": "Electronic", "post-punk": "Alternative",
  "psychedelic rock": "Psychedelic", "progressive rock": "Progressive",
  "hard rock": "Rock", "soft rock": "Rock", "dream pop": "Indie",
  "shoegaze": "Indie", "lo-fi": "Lo-Fi",
};

function mapMusicGenres(spotifyGenres: string[]): string[] {
  const genres = new Set<string>();
  for (const g of spotifyGenres) {
    const lower = g.toLowerCase();
    if (GENRE_MAP[lower]) genres.add(GENRE_MAP[lower]);
    else {
      for (const [key, val] of Object.entries(GENRE_MAP)) {
        if (lower.includes(key)) { genres.add(val); break; }
      }
    }
  }
  return [...genres].slice(0, 4);
}

function musicVibes(genres: string[], popularity: number): string[] {
  const vibes: string[] = [];
  const g = new Set(genres.map(s => s.toLowerCase()));
  if (g.has("electronic") || g.has("ambient")) vibes.push("Atmospheric", "Immersive");
  if (g.has("metal") || g.has("punk")) vibes.push("Intense", "Dark");
  if (g.has("r&b") || g.has("soul")) vibes.push("Emotional", "Stylish");
  if (g.has("hip-hop")) vibes.push("Intense", "Stylish");
  if (g.has("jazz")) vibes.push("Atmospheric", "Stylish");
  if (g.has("classical")) vibes.push("Immersive", "Epic");
  if (g.has("indie") || g.has("folk")) vibes.push("Melancholic", "Heartfelt");
  if (g.has("pop")) vibes.push("Uplifting", "Fast-Paced");
  if (g.has("rock")) vibes.push("Intense", "Epic");
  if (g.has("latin") || g.has("k-pop")) vibes.push("Fast-Paced", "Uplifting");
  if (g.has("blues")) vibes.push("Melancholic", "Emotional");
  if (popularity >= 80) vibes.push("Immersive");
  // Dedupe and limit
  return [...new Set(vibes)].slice(0, 3);
}

function podcastVibes(categories: string[]): string[] {
  const cats = categories.join(" ").toLowerCase();
  const vibes: string[] = [];
  if (cats.includes("crime") || cats.includes("mystery")) vibes.push("Dark", "Intense");
  if (cats.includes("comedy") || cats.includes("humor")) vibes.push("Funny");
  if (cats.includes("science") || cats.includes("tech")) vibes.push("Thought-Provoking", "Cerebral");
  if (cats.includes("history")) vibes.push("Thought-Provoking", "Epic");
  if (cats.includes("news") || cats.includes("politics")) vibes.push("Thought-Provoking");
  if (cats.includes("business") || cats.includes("entrepreneur")) vibes.push("Cerebral");
  if (cats.includes("health") || cats.includes("wellness")) vibes.push("Uplifting", "Heartfelt");
  if (cats.includes("sport")) vibes.push("Intense", "Fast-Paced");
  if (cats.includes("education")) vibes.push("Cerebral", "Thought-Provoking");
  if (vibes.length === 0) vibes.push("Immersive");
  return [...new Set(vibes)].slice(0, 3);
}

function comicVibes(genres: string[], description: string): string[] {
  const vibes: string[] = [];
  const g = genres.join(" ").toLowerCase();
  const d = description.toLowerCase();
  if (g.includes("horror") || d.includes("dark") || d.includes("grim")) vibes.push("Dark");
  if (g.includes("comedy") || g.includes("humor") || d.includes("funny")) vibes.push("Funny");
  if (g.includes("action") || g.includes("superhero")) vibes.push("Epic", "Intense");
  if (g.includes("sci-fi") || g.includes("science fiction")) vibes.push("Mind-Bending");
  if (g.includes("drama") || d.includes("emotional")) vibes.push("Emotional", "Heartbreaking");
  if (g.includes("fantasy")) vibes.push("Epic", "Immersive");
  if (g.includes("noir") || g.includes("crime")) vibes.push("Dark", "Atmospheric");
  if (d.includes("war") || d.includes("dystop")) vibes.push("Gritty", "Brutal");
  if (d.includes("satirical") || d.includes("satire")) vibes.push("Satirical");
  if (d.includes("beautiful") || d.includes("art")) vibes.push("Stylish");
  if (vibes.length === 0) vibes.push("Thought-Provoking");
  return [...new Set(vibes)].slice(0, 3);
}

// ── Seeding: Music ──────────────────────────────────────────────────────

const MUSIC_ARTISTS = [
  "Kendrick Lamar", "Radiohead", "Beyoncé", "Frank Ocean", "Taylor Swift",
  "Tyler, the Creator", "Kanye West", "Daft Punk", "Pink Floyd", "Nirvana",
  "The Beatles", "David Bowie", "Fleetwood Mac", "Amy Winehouse", "Arctic Monkeys",
  "Tame Impala", "SZA", "Bad Bunny", "BTS", "Adele",
  "The Weeknd", "Billie Eilish", "Travis Scott", "Drake", "Lana Del Rey",
  "Mac Miller", "Childish Gambino", "Anderson .Paak", "Gorillaz", "Outkast",
  "Arcade Fire", "LCD Soundsystem", "Bon Iver", "Sufjan Stevens", "The National",
  "Fleet Foxes", "Beach House", "Vampire Weekend", "Phoebe Bridgers", "Japanese Breakfast",
  "Run the Jewels", "Danny Brown", "JPEGMAFIA", "Denzel Curry", "Pusha T",
  "A Tribe Called Quest", "Wu-Tang Clan", "Nas", "Jay-Z", "MF DOOM",
  "Metallica", "Tool", "Rage Against the Machine", "System of a Down", "Queens of the Stone Age",
  "Led Zeppelin", "The Rolling Stones", "The Who", "Queen", "AC/DC",
  "Stevie Wonder", "Prince", "Michael Jackson", "Marvin Gaye", "Aretha Franklin",
  "Miles Davis", "John Coltrane", "Nina Simone", "Ella Fitzgerald", "Herbie Hancock",
];

const GENRE_SEARCHES = [
  "hip hop albums 2024", "best rock albums", "best pop albums", "electronic music albums",
  "R&B albums", "best metal albums", "jazz albums", "classical music albums",
  "indie albums 2024", "latin music albums", "k-pop albums", "best punk albums",
  "best folk albums", "best soul albums", "ambient music albums",
];

async function seedMusic() {
  console.log("\n🎵 Seeding music...");
  let added = 0;
  let skipped = 0;

  // Seed by artist — get top albums
  for (const artist of MUSIC_ARTISTS) {
    try {
      // Search for artist
      const searchData = await spotifyFetch(`/search?q=${encodeURIComponent(artist)}&type=artist&limit=1`);
      if (!searchData?.artists?.items?.length) continue;

      const artistObj = searchData.artists.items[0];
      const artistId = artistObj.id;
      const artistGenres: string[] = artistObj.genres || [];

      // Get artist's albums
      const albumsData = await spotifyFetch(`/artists/${artistId}/albums?include_groups=album&limit=5&market=US`);
      if (!albumsData?.items?.length) continue;

      for (const album of albumsData.items) {
        // Check if already exists
        const existing = await prisma.item.findFirst({ where: { spotifyId: album.id } });
        if (existing) { skipped++; continue; }

        // Also check by title
        const titleMatch = await prisma.item.findFirst({
          where: { title: { equals: album.name, mode: "insensitive" }, type: "music" },
        });
        if (titleMatch) { skipped++; continue; }

        // Get album details for popularity
        const albumDetails = await spotifyFetch(`/albums/${album.id}`);
        const popularity = albumDetails?.popularity || 0;
        if (popularity < 20) continue; // skip obscure albums

        const year = album.release_date ? parseInt(album.release_date.substring(0, 4)) : 0;
        const cover = album.images?.[0]?.url || "";
        const genres = mapMusicGenres(artistGenres);
        const vibes = musicVibes(genres, popularity);

        const trackList = albumDetails?.tracks?.items || [];
        const desc = `${album.name} is ${album.album_type === "album" ? "an album" : "a release"} by ${artistObj.name}, released in ${year}. Features ${album.total_tracks} tracks${trackList.length > 0 ? ` including ${trackList.slice(0, 3).map((t: any) => t.name).join(", ")}` : ""}.`;

        await prisma.item.create({
          data: {
            title: album.name,
            type: "music",
            genre: genres.length > 0 ? genres : ["Pop"],
            vibes,
            year,
            cover,
            description: desc,
            people: [{ role: "Artist", name: artistObj.name }],
            awards: [],
            platforms: ["spotify", "apple-music"],
            ext: { spotify_popularity: popularity },
            totalEp: album.total_tracks || 0,
            spotifyId: album.id,
            popularityScore: popularity,
            voteCount: popularity,
            lastSyncedAt: new Date(),
          },
        });
        added++;
      }

      await sleep(100); // Rate limit
    } catch (err: any) {
      console.log(`  Error for ${artist}: ${err.message?.slice(0, 60)}`);
    }
  }

  // Seed by genre search
  for (const query of GENRE_SEARCHES) {
    try {
      const data = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=album&limit=20&market=US`);
      if (!data?.albums?.items?.length) continue;

      for (const album of data.albums.items) {
        const existing = await prisma.item.findFirst({ where: { spotifyId: album.id } });
        if (existing) { skipped++; continue; }

        const albumDetails = await spotifyFetch(`/albums/${album.id}`);
        const popularity = albumDetails?.popularity || 0;
        if (popularity < 30) continue;

        // Get artist genres
        let artistGenres: string[] = [];
        if (album.artists?.[0]?.id) {
          const artistData = await spotifyFetch(`/artists/${album.artists[0].id}`);
          artistGenres = artistData?.genres || [];
        }

        const year = album.release_date ? parseInt(album.release_date.substring(0, 4)) : 0;
        const cover = album.images?.[0]?.url || "";
        const genres = mapMusicGenres(artistGenres);
        const vibes = musicVibes(genres, popularity);
        const artistName = album.artists?.[0]?.name || "";

        const desc = `${album.name} by ${artistName}, released in ${year}. A ${genres[0] || "music"} album with ${album.total_tracks || 0} tracks.`;

        await prisma.item.create({
          data: {
            title: album.name,
            type: "music",
            genre: genres.length > 0 ? genres : ["Pop"],
            vibes,
            year,
            cover,
            description: desc,
            people: artistName ? [{ role: "Artist", name: artistName }] : [],
            awards: [],
            platforms: ["spotify", "apple-music"],
            ext: { spotify_popularity: popularity },
            totalEp: album.total_tracks || 0,
            spotifyId: album.id,
            popularityScore: popularity,
            voteCount: popularity,
            lastSyncedAt: new Date(),
          },
        });
        added++;

        await sleep(80);
      }
    } catch (err: any) {
      console.log(`  Error for genre search "${query}": ${err.message?.slice(0, 60)}`);
    }
  }

  console.log(`  ✅ Music: ${added} added, ${skipped} skipped (already existed)`);
  return added;
}

// ── Seeding: Podcasts ───────────────────────────────────────────────────

const PODCAST_SEARCHES = [
  "The Joe Rogan Experience", "Serial", "This American Life", "Radiolab",
  "Hardcore History", "My Favorite Murder", "Crime Junkie", "The Daily",
  "Stuff You Should Know", "Conan O'Brien Needs a Friend", "SmartLess",
  "Call Her Daddy", "Armchair Expert", "Huberman Lab", "Lex Fridman Podcast",
  "The Tim Ferriss Show", "Pod Save America", "How I Built This", "Freakonomics Radio",
  "Reply All", "99% Invisible", "Planet Money", "Hidden Brain", "Dateline NBC",
  "WTF with Marc Maron", "Fresh Air", "TED Talks Daily", "The Moth",
  "Up First", "S-Town", "Revisionist History", "Invisibilia", "Ear Hustle",
  "Science Vs", "No Such Thing As A Fish", "Darknet Diaries", "Song Exploder",
  "Lore", "Last Podcast on the Left", "Casefile True Crime",
  // Category searches
  "true crime podcast", "comedy podcast", "science podcast", "news podcast",
  "technology podcast", "sports podcast", "history podcast", "business podcast",
  "health podcast", "education podcast", "storytelling podcast", "interview podcast",
  "politics podcast", "philosophy podcast", "music podcast", "pop culture podcast",
  "self improvement podcast", "parenting podcast", "finance podcast",
];

async function seedPodcasts() {
  console.log("\n🎙️ Seeding podcasts...");
  let added = 0;
  let skipped = 0;

  for (const query of PODCAST_SEARCHES) {
    try {
      const data = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=show&limit=10&market=US`);
      if (!data?.shows?.items?.length) continue;

      for (const show of data.shows.items) {
        if (!show.id || !show.name) continue;

        const existing = await prisma.item.findFirst({ where: { spotifyId: show.id } });
        if (existing) { skipped++; continue; }

        // Also check by title
        const titleMatch = await prisma.item.findFirst({
          where: { title: { equals: show.name, mode: "insensitive" }, type: "podcast" },
        });
        if (titleMatch) { skipped++; continue; }

        const cover = show.images?.[0]?.url || "";
        if (!cover) continue;

        const desc = show.description || `${show.name} is a podcast with ${show.total_episodes || 0} episodes.`;
        if (desc.length < 20) continue;

        // Determine genres from show's description/name
        const categories: string[] = [];
        const descLower = desc.toLowerCase();
        if (descLower.includes("crime") || descLower.includes("murder") || descLower.includes("mystery")) categories.push("True Crime");
        if (descLower.includes("comedy") || descLower.includes("funny") || descLower.includes("humor")) categories.push("Comedy");
        if (descLower.includes("science") || descLower.includes("research")) categories.push("Science");
        if (descLower.includes("tech") || descLower.includes("software") || descLower.includes("ai")) categories.push("Technology");
        if (descLower.includes("news") || descLower.includes("current events")) categories.push("News");
        if (descLower.includes("history") || descLower.includes("historical")) categories.push("History");
        if (descLower.includes("business") || descLower.includes("entrepreneur")) categories.push("Business");
        if (descLower.includes("health") || descLower.includes("wellness") || descLower.includes("fitness")) categories.push("Health");
        if (descLower.includes("politics") || descLower.includes("political")) categories.push("Politics");
        if (descLower.includes("sport")) categories.push("Sports");
        if (descLower.includes("interview") || descLower.includes("conversation")) categories.push("Interview");
        if (descLower.includes("story") || descLower.includes("stories") || descLower.includes("narrative")) categories.push("Storytelling");
        if (descLower.includes("education") || descLower.includes("learn")) categories.push("Education");
        if (categories.length === 0) categories.push("General");

        const vibes = podcastVibes(categories);
        const publisher = show.publisher || "";

        await prisma.item.create({
          data: {
            title: show.name,
            type: "podcast",
            genre: categories.slice(0, 4),
            vibes,
            year: 2020, // Most podcasts don't have clear year, use approximate
            cover,
            description: desc.length > 500 ? desc.substring(0, 497) + "..." : desc,
            people: publisher ? [{ role: "Host", name: publisher }] : [],
            awards: [],
            platforms: ["spotify", "apple-podcasts"],
            ext: {},
            totalEp: show.total_episodes || 0,
            spotifyId: show.id,
            popularityScore: show.total_episodes || 10,
            voteCount: show.total_episodes || 10,
            lastSyncedAt: new Date(),
          },
        });
        added++;

        await sleep(80);
      }
    } catch (err: any) {
      console.log(`  Error for "${query}": ${err.message?.slice(0, 60)}`);
    }
  }

  console.log(`  ✅ Podcasts: ${added} added, ${skipped} skipped`);
  return added;
}

// ── Seeding: Comics ─────────────────────────────────────────────────────

const CV_API = "https://comicvine.gamespot.com/api";
const CV_KEY = process.env.COMICVINE_API_KEY || "";

async function cvFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${CV_API}${path}`);
  url.searchParams.set("api_key", CV_KEY);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Literacy/1.0" },
  });
  if (!res.ok) return null;
  return res.json();
}

const COMIC_SEARCHES = [
  "Batman", "Spider-Man", "X-Men", "Watchmen", "Sandman", "Saga", "The Walking Dead",
  "Invincible", "Maus", "Persepolis", "Scott Pilgrim", "Hellboy", "Spawn",
  "Preacher", "Y The Last Man", "Fables", "Transmetropolitan", "East of West",
  "Paper Girls", "Ms. Marvel", "Hawkeye", "Immortal Hulk",
  "V for Vendetta", "Sin City", "300", "The Dark Knight Returns",
  "Batman Year One", "Kingdom Come", "All-Star Superman", "Batman The Long Halloween",
  "From Hell", "Ghost World", "Fun Home", "Blankets", "Jimmy Corrigan",
  "Superman", "Wonder Woman", "Avengers", "Justice League", "Fantastic Four",
  "Daredevil", "Swamp Thing", "Bone", "Teenage Mutant Ninja Turtles",
  "The Boys", "Kick-Ass", "Akira", "Black Panther", "Captain America",
  "Doom Patrol", "Animal Man", "Planetary", "The Authority", "Ex Machina",
  "Locke & Key", "Rat Queens", "Deadly Class", "Descender", "Black Science",
  "Chew", "Revival", "Wicked + Divine", "Sex Criminals", "Southern Bastards",
  "Berserk", "Usagi Yojimbo", "Cerebus", "Love and Rockets", "Strangers in Paradise",
];

async function seedComics() {
  console.log("\n💥 Seeding comics...");

  if (!CV_KEY) {
    console.log("  ⚠️ No COMICVINE_API_KEY set, seeding comics with manual data...");
    return await seedComicsManual();
  }

  let added = 0;
  let skipped = 0;

  for (const query of COMIC_SEARCHES) {
    try {
      const data = await cvFetch("/search/", {
        query,
        resources: "volume",
        limit: "5",
        field_list: "id,name,start_year,image,description,count_of_issues,publisher,deck",
      });

      if (!data?.results?.length) continue;

      for (const vol of data.results) {
        if (!vol.name || !vol.id) continue;

        const existing = await prisma.item.findFirst({ where: { comicVineId: vol.id } });
        if (existing) { skipped++; continue; }

        const titleMatch = await prisma.item.findFirst({
          where: { title: { equals: vol.name, mode: "insensitive" }, type: "comic" },
        });
        if (titleMatch) { skipped++; continue; }

        const cover = vol.image?.medium_url || vol.image?.small_url || "";
        if (!cover) continue;

        const desc = stripHtml(vol.description || vol.deck || `${vol.name} is a comic series with ${vol.count_of_issues || 0} issues.`);
        if (desc.length < 20) continue;

        const year = vol.start_year ? parseInt(vol.start_year) : 2000;
        const publisher = vol.publisher?.name || "";
        const genres = ["Comics"];
        // Infer genre from title/description
        if (desc.toLowerCase().includes("superhero") || ["Batman", "Spider-Man", "Superman", "X-Men", "Avengers", "Wonder Woman"].some(s => vol.name.includes(s))) {
          genres.push("Superhero");
        }
        if (desc.toLowerCase().includes("horror")) genres.push("Horror");
        if (desc.toLowerCase().includes("sci-fi") || desc.toLowerCase().includes("science fiction")) genres.push("Sci-Fi");
        if (desc.toLowerCase().includes("fantasy")) genres.push("Fantasy");
        if (desc.toLowerCase().includes("crime") || desc.toLowerCase().includes("noir")) genres.push("Crime");

        const vibes = comicVibes(genres, desc);
        const issueCount = vol.count_of_issues || 0;

        await prisma.item.create({
          data: {
            title: vol.name,
            type: "comic",
            genre: genres.slice(0, 4),
            vibes,
            year,
            cover,
            description: desc.length > 500 ? desc.substring(0, 497) + "..." : desc,
            people: publisher ? [{ role: "Publisher", name: publisher }] : [],
            awards: [],
            platforms: ["comixology", "marvel-unlimited"],
            ext: {},
            totalEp: issueCount,
            comicVineId: vol.id,
            popularityScore: issueCount > 0 ? Math.min(100, issueCount) : 10,
            voteCount: issueCount,
            lastSyncedAt: new Date(),
          },
        });
        added++;

        await sleep(1100); // Comic Vine is very rate-limited: 1 req/sec
      }
    } catch (err: any) {
      console.log(`  Error for "${query}": ${err.message?.slice(0, 60)}`);
    }
  }

  console.log(`  ✅ Comics: ${added} added, ${skipped} skipped`);
  return added;
}

// Fallback: seed comics without Comic Vine API using known data
async function seedComicsManual(): Promise<number> {
  const comics = [
    { title: "Watchmen", year: 1986, genres: ["Superhero", "Drama"], vibes: ["Dark", "Thought-Provoking", "Mind-Bending"], people: [{ role: "Writer", name: "Alan Moore" }, { role: "Artist", name: "Dave Gibbons" }], issues: 12, desc: "Set in an alternate history, Watchmen follows a group of retired superheroes investigating a murder that leads to a vast conspiracy threatening humanity." },
    { title: "The Dark Knight Returns", year: 1986, genres: ["Superhero", "Action"], vibes: ["Dark", "Gritty", "Intense"], people: [{ role: "Writer", name: "Frank Miller" }], issues: 4, desc: "An aging Bruce Wayne returns from retirement to fight crime in a dystopian Gotham City, facing both old enemies and a corrupted government." },
    { title: "Saga", year: 2012, genres: ["Sci-Fi", "Fantasy"], vibes: ["Epic", "Emotional", "Immersive"], people: [{ role: "Writer", name: "Brian K. Vaughan" }, { role: "Artist", name: "Fiona Staples" }], issues: 66, desc: "An epic space opera following two lovers from warring alien races who struggle to survive while protecting their newborn daughter." },
    { title: "Sandman", year: 1989, genres: ["Fantasy", "Horror"], vibes: ["Dark", "Atmospheric", "Mind-Bending"], people: [{ role: "Writer", name: "Neil Gaiman" }], issues: 75, desc: "Dream of the Endless, also known as Morpheus, escapes from decades of imprisonment to rebuild his kingdom and discover his purpose." },
    { title: "Maus", year: 1991, genres: ["Biography", "Drama"], vibes: ["Heartbreaking", "Thought-Provoking"], people: [{ role: "Writer", name: "Art Spiegelman" }], issues: 2, desc: "A groundbreaking graphic novel depicting the Holocaust through the metaphor of cats and mice, told through a son interviewing his father." },
    { title: "V for Vendetta", year: 1988, genres: ["Political", "Thriller"], vibes: ["Dark", "Thought-Provoking", "Intense"], people: [{ role: "Writer", name: "Alan Moore" }, { role: "Artist", name: "David Lloyd" }], issues: 10, desc: "In a dystopian near-future Britain, a mysterious masked anarchist known as V wages a one-man war against the totalitarian government." },
    { title: "Invincible", year: 2003, genres: ["Superhero", "Action"], vibes: ["Intense", "Brutal", "Epic"], people: [{ role: "Writer", name: "Robert Kirkman" }, { role: "Artist", name: "Ryan Ottley" }], issues: 144, desc: "Mark Grayson inherits superpowers from his father, the most powerful hero on earth, but discovers a terrible truth about his alien heritage." },
    { title: "The Walking Dead", year: 2003, genres: ["Horror", "Drama"], vibes: ["Dark", "Gritty", "Intense"], people: [{ role: "Writer", name: "Robert Kirkman" }], issues: 193, desc: "After a zombie apocalypse, a group of survivors led by sheriff Rick Grimes must navigate threats both living and undead." },
    { title: "Y: The Last Man", year: 2002, genres: ["Sci-Fi", "Adventure"], vibes: ["Thought-Provoking", "Epic", "Emotional"], people: [{ role: "Writer", name: "Brian K. Vaughan" }], issues: 60, desc: "After a mysterious plague kills every male mammal on earth except for Yorick Brown and his capuchin monkey, he embarks on a journey across a transformed world." },
    { title: "Preacher", year: 1995, genres: ["Action", "Horror"], vibes: ["Dark", "Satirical", "Brutal"], people: [{ role: "Writer", name: "Garth Ennis" }, { role: "Artist", name: "Steve Dillon" }], issues: 66, desc: "A Texas preacher possessed by a divine entity sets out across America with his ex-girlfriend and an Irish vampire to find God and demand answers." },
    { title: "Fables", year: 2002, genres: ["Fantasy", "Drama"], vibes: ["Immersive", "Epic", "Atmospheric"], people: [{ role: "Writer", name: "Bill Willingham" }], issues: 150, desc: "Characters from fairy tales and folklore live in a hidden community in New York City, having been exiled from their magical homeland." },
    { title: "Sin City", year: 1991, genres: ["Crime", "Noir"], vibes: ["Dark", "Gritty", "Stylish"], people: [{ role: "Writer", name: "Frank Miller" }], issues: 13, desc: "A series of interconnected noir stories set in the fictional Basin City, exploring the violent lives of its corrupt inhabitants." },
    { title: "Scott Pilgrim", year: 2004, genres: ["Comedy", "Romance"], vibes: ["Funny", "Stylish", "Fast-Paced"], people: [{ role: "Writer", name: "Bryan Lee O'Malley" }], issues: 6, desc: "Slacker musician Scott Pilgrim must defeat his new girlfriend's seven evil exes in video-game-style battles to win her heart." },
    { title: "Hellboy", year: 1993, genres: ["Horror", "Action"], vibes: ["Dark", "Atmospheric", "Epic"], people: [{ role: "Writer", name: "Mike Mignola" }], issues: 55, desc: "A demon raised by humans works for the Bureau for Paranormal Research and Defense, fighting monsters and investigating the supernatural." },
    { title: "Transmetropolitan", year: 1997, genres: ["Sci-Fi", "Political"], vibes: ["Satirical", "Chaotic", "Intense"], people: [{ role: "Writer", name: "Warren Ellis" }], issues: 60, desc: "Gonzo journalist Spider Jerusalem wages war against corruption and political injustice in a debauched future city." },
    { title: "Bone", year: 1991, genres: ["Fantasy", "Adventure"], vibes: ["Immersive", "Funny", "Epic"], people: [{ role: "Writer", name: "Jeff Smith" }], issues: 55, desc: "Three cousins from Boneville are lost in a vast uncharted desert and discover a valley filled with wonderful and terrifying creatures." },
    { title: "Persepolis", year: 2000, genres: ["Biography", "Political"], vibes: ["Thought-Provoking", "Heartbreaking", "Emotional"], people: [{ role: "Writer", name: "Marjane Satrapi" }], issues: 4, desc: "An autobiographical graphic novel depicting a young girl growing up during the Islamic Revolution in Iran." },
    { title: "Paper Girls", year: 2015, genres: ["Sci-Fi", "Adventure"], vibes: ["Mind-Bending", "Atmospheric", "Intense"], people: [{ role: "Writer", name: "Brian K. Vaughan" }], issues: 30, desc: "Four newspaper delivery girls become unwitting time travelers on the morning after Halloween 1988." },
    { title: "East of West", year: 2013, genres: ["Sci-Fi", "Western"], vibes: ["Dark", "Epic", "Mind-Bending"], people: [{ role: "Writer", name: "Jonathan Hickman" }], issues: 45, desc: "In an alternate America divided into warring nations, Death rides to reclaim his kidnapped son as the apocalypse approaches." },
    { title: "Deadly Class", year: 2014, genres: ["Action", "Drama"], vibes: ["Dark", "Intense", "Stylish"], people: [{ role: "Writer", name: "Rick Remender" }], issues: 56, desc: "A homeless teenager is recruited into a secret academy for the world's deadliest assassins during the late 1980s." },
    { title: "Kingdom Come", year: 1996, genres: ["Superhero", "Drama"], vibes: ["Epic", "Thought-Provoking", "Atmospheric"], people: [{ role: "Writer", name: "Mark Waid" }, { role: "Artist", name: "Alex Ross" }], issues: 4, desc: "An aging Superman returns to a world where a new generation of reckless superheroes threatens to destroy humanity." },
    { title: "All-Star Superman", year: 2005, genres: ["Superhero"], vibes: ["Epic", "Heartfelt", "Uplifting"], people: [{ role: "Writer", name: "Grant Morrison" }, { role: "Artist", name: "Frank Quitely" }], issues: 12, desc: "After being poisoned by solar radiation, Superman embarks on completing twelve legendary labors before his death." },
    { title: "Batman: The Long Halloween", year: 1996, genres: ["Superhero", "Crime"], vibes: ["Dark", "Atmospheric", "Cerebral"], people: [{ role: "Writer", name: "Jeph Loeb" }, { role: "Artist", name: "Tim Sale" }], issues: 13, desc: "Batman hunts a serial killer targeting Gotham's crime families on holidays while navigating the rise of his greatest rogues." },
    { title: "The Authority", year: 1999, genres: ["Superhero", "Action"], vibes: ["Intense", "Epic", "Brutal"], people: [{ role: "Writer", name: "Warren Ellis" }], issues: 29, desc: "A team of superhumans takes a proactive approach to saving the world, changing it by force when necessary." },
    { title: "Planetary", year: 1998, genres: ["Sci-Fi", "Mystery"], vibes: ["Mind-Bending", "Atmospheric", "Cerebral"], people: [{ role: "Writer", name: "Warren Ellis" }, { role: "Artist", name: "John Cassaday" }], issues: 27, desc: "A trio of superpowered archaeologists excavate the secret history of the world and uncover a vast conspiracy." },
    { title: "Locke & Key", year: 2008, genres: ["Horror", "Fantasy"], vibes: ["Dark", "Atmospheric", "Emotional"], people: [{ role: "Writer", name: "Joe Hill" }, { role: "Artist", name: "Gabriel Rodriguez" }], issues: 37, desc: "After their father's murder, three siblings discover magical keys in their family estate that unlock supernatural doors." },
    { title: "From Hell", year: 1989, genres: ["Horror", "Historical"], vibes: ["Dark", "Cerebral", "Atmospheric"], people: [{ role: "Writer", name: "Alan Moore" }], issues: 16, desc: "A meticulously researched graphic novel exploring a theory about Jack the Ripper's identity and Victorian London's dark underbelly." },
    { title: "Ghost World", year: 1993, genres: ["Drama", "Comedy"], vibes: ["Melancholic", "Satirical", "Stylish"], people: [{ role: "Writer", name: "Daniel Clowes" }], issues: 1, desc: "Two cynical teenage girls navigate post-high-school aimlessness as their friendship slowly dissolves." },
    { title: "Fun Home", year: 2006, genres: ["Biography", "Drama"], vibes: ["Emotional", "Thought-Provoking", "Heartbreaking"], people: [{ role: "Writer", name: "Alison Bechdel" }], issues: 1, desc: "A memoir exploring the author's complex relationship with her closeted father and her own coming-out journey." },
    { title: "Blankets", year: 2003, genres: ["Romance", "Drama"], vibes: ["Emotional", "Heartfelt", "Immersive"], people: [{ role: "Writer", name: "Craig Thompson" }], issues: 1, desc: "An autobiographical coming-of-age story about first love and the struggle between religious upbringing and personal identity." },
    { title: "The Boys", year: 2006, genres: ["Superhero", "Satire"], vibes: ["Dark", "Satirical", "Brutal"], people: [{ role: "Writer", name: "Garth Ennis" }], issues: 72, desc: "A CIA squad monitors corrupt superheroes who abuse their powers, ready to stop them by any means necessary." },
    { title: "Spawn", year: 1992, genres: ["Superhero", "Horror"], vibes: ["Dark", "Intense", "Atmospheric"], people: [{ role: "Writer", name: "Todd McFarlane" }], issues: 350, desc: "A murdered CIA agent returns from hell as a Hellspawn warrior, battling both heaven and hell while protecting the innocent." },
    { title: "Kick-Ass", year: 2008, genres: ["Superhero", "Action"], vibes: ["Intense", "Funny", "Brutal"], people: [{ role: "Writer", name: "Mark Millar" }], issues: 8, desc: "An ordinary teenager decides to become a real-life superhero despite having no powers, training, or meaningful reason to do so." },
    { title: "Black Panther", year: 1998, genres: ["Superhero", "Political"], vibes: ["Epic", "Thought-Provoking", "Intense"], people: [{ role: "Writer", name: "Christopher Priest" }], issues: 62, desc: "T'Challa, king of the technologically advanced African nation of Wakanda, balances his duties as monarch and superhero." },
    { title: "Daredevil", year: 1998, genres: ["Superhero", "Crime"], vibes: ["Dark", "Gritty", "Intense"], people: [{ role: "Writer", name: "Kevin Smith" }], issues: 119, desc: "Blind lawyer Matt Murdock fights crime in Hell's Kitchen as the vigilante Daredevil, using his superhuman senses." },
    { title: "Swamp Thing", year: 1984, genres: ["Horror", "Fantasy"], vibes: ["Dark", "Atmospheric", "Cerebral"], people: [{ role: "Writer", name: "Alan Moore" }], issues: 45, desc: "A plant elemental struggles with his lost humanity while discovering his connection to a force that unites all plant life on Earth." },
    { title: "Rat Queens", year: 2013, genres: ["Fantasy", "Comedy"], vibes: ["Funny", "Intense", "Stylish"], people: [{ role: "Writer", name: "Kurtis J. Wiebe" }], issues: 30, desc: "A band of boozing, brawling female adventurers take on quests and monsters in a wild fantasy world." },
    { title: "Descender", year: 2015, genres: ["Sci-Fi"], vibes: ["Emotional", "Atmospheric", "Immersive"], people: [{ role: "Writer", name: "Jeff Lemire" }], issues: 32, desc: "In a universe where robots are hunted after a devastating attack by giant killing machines, a young robot boy may hold the key to understanding the threat." },
    { title: "Black Science", year: 2013, genres: ["Sci-Fi", "Action"], vibes: ["Mind-Bending", "Chaotic", "Intense"], people: [{ role: "Writer", name: "Rick Remender" }], issues: 43, desc: "A scientist and his team are stranded across infinite dimensions after their dimension-hopping device malfunctions." },
    { title: "Chew", year: 2009, genres: ["Crime", "Comedy"], vibes: ["Funny", "Surreal", "Stylish"], people: [{ role: "Writer", name: "John Layman" }], issues: 60, desc: "An FDA agent with the ability to receive psychic impressions from anything he eats investigates food-related crimes." },
    { title: "Wicked + The Divine", year: 2014, genres: ["Fantasy", "Drama"], vibes: ["Stylish", "Dark", "Epic"], people: [{ role: "Writer", name: "Kieron Gillen" }], issues: 45, desc: "Every ninety years, twelve gods are reincarnated as young people, given two years to live as pop-culture icons before dying." },
    { title: "Sex Criminals", year: 2013, genres: ["Comedy", "Sci-Fi"], vibes: ["Funny", "Surreal", "Heartfelt"], people: [{ role: "Writer", name: "Matt Fraction" }], issues: 31, desc: "Two people discover they can freeze time when they orgasm and decide to use this power to rob banks." },
    { title: "100 Bullets", year: 1999, genres: ["Crime", "Noir"], vibes: ["Dark", "Gritty", "Cerebral"], people: [{ role: "Writer", name: "Brian Azzarello" }], issues: 100, desc: "A mysterious agent offers people the chance for revenge with an untraceable gun and 100 bullets." },
    { title: "Ms. Marvel", year: 2014, genres: ["Superhero"], vibes: ["Heartfelt", "Uplifting", "Funny"], people: [{ role: "Writer", name: "G. Willow Wilson" }], issues: 19, desc: "Pakistani-American teenager Kamala Khan discovers she has shape-shifting powers and takes on the mantle of Ms. Marvel." },
    { title: "Hawkeye", year: 2012, genres: ["Superhero", "Comedy"], vibes: ["Funny", "Stylish", "Heartfelt"], people: [{ role: "Writer", name: "Matt Fraction" }, { role: "Artist", name: "David Aja" }], issues: 22, desc: "Clint Barton tries to live a normal life in Brooklyn between Avengers missions, dealing with everyday problems and Russian gangsters." },
    { title: "Immortal Hulk", year: 2018, genres: ["Superhero", "Horror"], vibes: ["Dark", "Cerebral", "Intense"], people: [{ role: "Writer", name: "Al Ewing" }], issues: 50, desc: "Bruce Banner is resurrected by a new, terrifying incarnation of the Hulk that emerges at night, raising questions about death and identity." },
  ];

  let added = 0;
  for (const c of comics) {
    const existing = await prisma.item.findFirst({
      where: { title: { equals: c.title, mode: "insensitive" }, type: "comic" },
    });
    if (existing) {
      // Update existing to have better data
      await prisma.item.update({
        where: { id: existing.id },
        data: {
          genre: c.genres,
          vibes: c.vibes,
          description: c.desc,
          people: c.people as any,
          popularityScore: c.issues,
          voteCount: c.issues,
        },
      });
      continue;
    }

    await prisma.item.create({
      data: {
        title: c.title,
        type: "comic",
        genre: c.genres,
        vibes: c.vibes,
        year: c.year,
        cover: "", // Will be populated by Comic Vine search below
        description: c.desc,
        people: c.people as any,
        awards: [],
        platforms: ["comixology"],
        ext: {},
        totalEp: c.issues,
        popularityScore: c.issues,
        voteCount: c.issues,
        lastSyncedAt: new Date(),
      },
    });
    added++;
  }

  // Try to get covers from Comic Vine for items without covers
  if (CV_KEY) {
    const noCover = await prisma.item.findMany({
      where: { type: "comic", OR: [{ cover: "" }, { cover: null as any }] },
      select: { id: true, title: true },
    });

    for (const item of noCover) {
      try {
        const data = await cvFetch("/search/", {
          query: item.title,
          resources: "volume",
          limit: "1",
          field_list: "image",
        });

        if (data?.results?.[0]?.image?.medium_url) {
          await prisma.item.update({
            where: { id: item.id },
            data: { cover: data.results[0].image.medium_url },
          });
        }
        await sleep(1100);
      } catch { /* skip */ }
    }
  }

  console.log(`  ✅ Comics (manual): ${added} added`);
  return added;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim();
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding music, podcasts, and comics...\n");

  const musicAdded = await seedMusic();
  const podcastAdded = await seedPodcasts();
  const comicAdded = await seedComics();

  // Final counts
  const counts = await prisma.$queryRaw<{ type: string; count: number }[]>`
    SELECT type, COUNT(*)::int as count FROM items WHERE type IN ('music', 'podcast', 'comic') GROUP BY type ORDER BY type
  `;
  console.log("\n📊 Final counts:");
  console.table(counts);

  console.log(`\n✅ Done! Added: ${musicAdded} music, ${podcastAdded} podcasts, ${comicAdded} comics`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error("Seed failed:", e);
  process.exit(1);
});
