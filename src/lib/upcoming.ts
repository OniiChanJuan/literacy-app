import type { Item, UpcomingItem, MediaType, ExternalSource, Person } from "./data";

const TMDB_KEY = () => process.env.TMDB_API_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

const IGDB_CID = () => process.env.IGDB_CLIENT_ID || "";
const IGDB_CS = () => process.env.IGDB_CLIENT_SECRET || "";
const IGDB_IMG = "https://images.igdb.com/igdb/image/upload/t_720p";

const GBOOKS_KEY = () => process.env.GOOGLE_BOOKS_API_KEY || "";

// ── IGDB token cache ────────────────────────────────────────────────────
let igdbToken: string | null = null;
let igdbTokenExpiry = 0;

async function getIgdbToken(): Promise<string> {
  if (igdbToken && Date.now() < igdbTokenExpiry) return igdbToken;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_CID()}&client_secret=${IGDB_CS()}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  igdbToken = data.access_token;
  igdbTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return igdbToken!;
}

// ── Upcoming movies from TMDB ───────────────────────────────────────────
async function fetchUpcomingMovies(): Promise<UpcomingItem[]> {
  try {
    const res = await fetch(`${TMDB_BASE}/movie/upcoming?api_key=${TMDB_KEY()}&region=US&page=1`);
    if (!res.ok) return [];
    const data = await res.json();

    const today = new Date().toISOString().split("T")[0];

    return (data.results || [])
      .filter((m: { release_date: string; poster_path: string | null }) =>
        m.release_date > today && m.poster_path
      )
      .slice(0, 8)
      .map((m: { id: number; title: string; overview: string; release_date: string; poster_path: string; genre_ids: number[]; vote_count: number }) => ({
        id: m.id + 900000,
        title: m.title,
        type: "movie" as MediaType,
        genre: mapTmdbGenres(m.genre_ids),
        vibes: [],
        year: parseInt(m.release_date.split("-")[0]),
        cover: `${TMDB_IMG}${m.poster_path}`,
        desc: m.overview || "",
        people: [] as Person[],
        awards: [],
        platforms: ["theaters"],
        ext: {} as Partial<Record<ExternalSource, number>>,
        totalEp: 1,
        releaseDate: m.release_date,
        hypeScore: Math.min(99, Math.round(50 + m.vote_count / 10)),
        wantCount: Math.round(m.vote_count * 3 + 500),
        upcoming: true as const,
      }));
  } catch { return []; }
}

// ── Upcoming TV from TMDB — only brand new shows that haven't premiered ──
async function fetchUpcomingTV(): Promise<UpcomingItem[]> {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Fetch multiple pages of discover results for shows premiering in the future
    const pages = [1, 2];
    const allResults: any[] = [];

    for (const page of pages) {
      const res = await fetch(
        `${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY()}&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      allResults.push(...(data.results || []));
    }

    return allResults
      .filter((t: { first_air_date: string; poster_path: string | null; vote_count: number }) =>
        t.poster_path && t.first_air_date && t.first_air_date > today
      )
      .slice(0, 6)
      .map((t: { id: number; name: string; overview: string; first_air_date: string; poster_path: string; genre_ids: number[]; vote_count: number }) => ({
        id: t.id + 800000,
        title: t.name,
        type: "tv" as MediaType,
        genre: mapTmdbGenres(t.genre_ids),
        vibes: [],
        year: parseInt((t.first_air_date || "0").split("-")[0]),
        cover: `${TMDB_IMG}${t.poster_path}`,
        desc: t.overview || "",
        people: [] as Person[],
        awards: [],
        platforms: [],
        ext: {} as Partial<Record<ExternalSource, number>>,
        totalEp: 0,
        releaseDate: t.first_air_date || "",
        hypeScore: Math.min(99, Math.round(40 + t.vote_count / 20)),
        wantCount: Math.round(t.vote_count * 5 + 300),
        upcoming: true as const,
      }));
  } catch { return []; }
}

// ── Returning Soon — existing shows with confirmed upcoming seasons ──────
export interface ReturningSoonItem {
  id: number;
  title: string;
  type: "tv";
  cover: string;
  seasonNumber: number;
  airDate: string;
  overview: string;
  year: number;
}

async function fetchReturningSoonTV(): Promise<ReturningSoonItem[]> {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Get currently "on the air" shows — these are existing shows with recent/upcoming episodes
    const res = await fetch(`${TMDB_BASE}/tv/on_the_air?api_key=${TMDB_KEY()}&page=1`);
    if (!res.ok) return [];
    const data = await res.json();

    const results: ReturningSoonItem[] = [];

    for (const show of (data.results || [])) {
      // Only include shows that have ALREADY premiered (first_air_date in the past)
      if (!show.first_air_date || show.first_air_date >= today) continue;
      if (!show.poster_path) continue;
      if (!show.vote_count || show.vote_count < 50) continue;

      // Fetch show details to get next_episode_to_air and season info
      try {
        const detailRes = await fetch(`${TMDB_BASE}/tv/${show.id}?api_key=${TMDB_KEY()}`);
        if (!detailRes.ok) continue;
        const detail = await detailRes.json();

        const nextEp = detail.next_episode_to_air;
        if (!nextEp || !nextEp.air_date) continue;
        // Only include if next episode is in the future
        if (nextEp.air_date <= today) continue;

        results.push({
          id: show.id,
          title: show.name,
          type: "tv",
          cover: `${TMDB_IMG}${show.poster_path}`,
          seasonNumber: nextEp.season_number || detail.number_of_seasons || 1,
          airDate: nextEp.air_date,
          overview: show.overview || "",
          year: parseInt(show.first_air_date.split("-")[0]),
        });

        if (results.length >= 10) break;
      } catch { continue; }
    }

    // Sort by nearest air date
    results.sort((a, b) => a.airDate.localeCompare(b.airDate));
    return results;
  } catch { return []; }
}

// ── Upcoming games from IGDB ────────────────────────────────────────────
async function fetchUpcomingGames(): Promise<UpcomingItem[]> {
  try {
    const token = await getIgdbToken();
    const now = Math.floor(Date.now() / 1000);
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": IGDB_CID(),
        "Authorization": `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: `fields name,cover.image_id,first_release_date,hypes,summary,involved_companies.company.name,involved_companies.developer,genres.name,platforms.name; where first_release_date > ${now} & hypes > 3 & cover != null; sort hypes desc; limit 8;`,
    });
    if (!res.ok) return [];
    const data = await res.json();

    return data.map((g: {
      id: number; name: string; summary?: string; cover?: { image_id: string };
      first_release_date: number; hypes: number;
      involved_companies?: { company: { name: string }; developer: boolean }[];
      genres?: { name: string }[];
      platforms?: { name: string }[];
    }) => {
      const date = new Date(g.first_release_date * 1000);
      const people: Person[] = [];
      const dev = g.involved_companies?.find((c) => c.developer);
      if (dev) people.push({ role: "Developer", name: dev.company.name });

      return {
        id: g.id + 700000,
        title: g.name,
        type: "game" as MediaType,
        genre: (g.genres || []).map((ge: { name: string }) => ge.name).slice(0, 3),
        vibes: [],
        year: date.getFullYear(),
        cover: g.cover ? `${IGDB_IMG}/${g.cover.image_id}.jpg` : "",
        desc: g.summary || "",
        people,
        awards: [],
        platforms: mapIgdbPlatforms(g.platforms || []),
        ext: {} as Partial<Record<ExternalSource, number>>,
        totalEp: 0,
        releaseDate: date.toISOString().split("T")[0],
        hypeScore: Math.min(99, Math.round(50 + g.hypes / 5)),
        wantCount: Math.round(g.hypes * 40 + 1000),
        upcoming: true as const,
      };
    });
  } catch { return []; }
}

// ── Upcoming books from Google Books ────────────────────────────────────
async function fetchUpcomingBooks(): Promise<UpcomingItem[]> {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const queries = [
      `subject:fiction+${year}`,
      `subject:fantasy+${year + 1}`,
      `subject:thriller+${year}`,
    ];

    const allBooks: UpcomingItem[] = [];

    for (const q of queries) {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&key=${GBOOKS_KEY()}&maxResults=5&printType=books&langRestrict=en&orderBy=newest`
      );
      if (!res.ok) continue;
      const data = await res.json();

      for (const item of (data.items || [])) {
        const v = item.volumeInfo;
        const pubDate = v.publishedDate || "";
        // Only include future-dated books
        if (pubDate <= today.toISOString().split("T")[0]) continue;
        if (!v.imageLinks?.thumbnail) continue;
        if (allBooks.length >= 6) break;

        const cover = (v.imageLinks.thumbnail || "")
          .replace("&edge=curl", "")
          .replace("zoom=1", "zoom=0")
          .replace("http://", "https://");

        const people: Person[] = (v.authors || []).map((a: string) => ({ role: "Author", name: a }));

        allBooks.push({
          id: hashStr(item.id) + 600000,
          title: v.title,
          type: "book" as MediaType,
          genre: (v.categories || ["Fiction"]).slice(0, 3),
          vibes: [],
          year: parseInt(pubDate.split("-")[0]),
          cover,
          desc: stripHtml(v.description || ""),
          people,
          awards: [],
          platforms: ["kindle", "library"],
          ext: {} as Partial<Record<ExternalSource, number>>,
          totalEp: v.pageCount || 0,
          releaseDate: pubDate,
          hypeScore: Math.round(40 + Math.random() * 30),
          wantCount: Math.round(500 + Math.random() * 5000),
          upcoming: true as const,
        });
      }
    }

    return allBooks;
  } catch { return []; }
}

// ── Curated upcoming music ──────────────────────────────────────────────
function getCuratedUpcomingMusic(): UpcomingItem[] {
  return [
    {
      id: 500001, title: "Brat and It's Completely Different but Also Still Brat", type: "music",
      genre: ["Pop", "Electronic"], vibes: ["intense", "stylish"], year: 2026,
      cover: "https://i.scdn.co/image/ab67616d0000b2736d367b11525a3c3e33217191",
      desc: "Charli xcx follows up the cultural phenomenon of Brat with a reimagined companion album featuring new collaborations.",
      people: [{ role: "Artist", name: "Charli xcx" }],
      awards: [], platforms: ["spotify", "apple_music"],
      ext: {}, totalEp: 0,
      releaseDate: "2026-06-15", hypeScore: 85, wantCount: 18200, upcoming: true,
    },
    {
      id: 500002, title: "Beyoncé — Act III", type: "music",
      genre: ["R&B", "Pop"], vibes: ["epic", "emotional"], year: 2026,
      cover: "https://i.scdn.co/image/ab67616d0000b273e9b413ddb3817e5e257eed8f",
      desc: "The highly anticipated third act of Beyoncé's Renaissance trilogy, rumored to explore rock and Americana influences.",
      people: [{ role: "Artist", name: "Beyoncé" }],
      awards: [], platforms: ["spotify", "apple_music"],
      ext: {}, totalEp: 0,
      releaseDate: "2026-09-01", hypeScore: 95, wantCount: 45000, upcoming: true,
    },
    {
      id: 500003, title: "SZA — Lana", type: "music",
      genre: ["R&B", "Alternative"], vibes: ["emotional", "atmospheric"], year: 2026,
      cover: "https://i.scdn.co/image/ab67616d0000b2730c471c36970b9406233842a5",
      desc: "SZA's follow-up to the chart-dominating SOS, expected to continue her blend of vulnerable songwriting and genre experimentation.",
      people: [{ role: "Artist", name: "SZA" }],
      awards: [], platforms: ["spotify", "apple_music"],
      ext: {}, totalEp: 0,
      releaseDate: "2026-03-28", hypeScore: 92, wantCount: 38000, upcoming: true,
    },
  ];
}

// ── Curated upcoming comics ─────────────────────────────────────────────
function getCuratedUpcomingComics(): UpcomingItem[] {
  return [
    {
      id: 400001, title: "Ultimate Spider-Man Vol. 4", type: "comic",
      genre: ["Superhero", "Action"], vibes: ["epic", "stylish"], year: 2026,
      cover: "https://comicvine.gamespot.com/a/uploads/scale_large/11/117763/9600379-usm2024015_cov.jpg",
      desc: "Jonathan Hickman and Marco Checchetto continue the critically acclaimed reimagining of Spider-Man in the Ultimate Universe.",
      people: [{ role: "Writer", name: "Jonathan Hickman" }, { role: "Artist", name: "Marco Checchetto" }, { role: "Publisher", name: "Marvel" }],
      awards: [], platforms: ["comixology"],
      ext: {}, totalEp: 6,
      releaseDate: "2026-06-01", hypeScore: 88, wantCount: 12400, upcoming: true,
    },
    {
      id: 400002, title: "Absolute Batman Vol. 2", type: "comic",
      genre: ["Superhero", "Action"], vibes: ["dark", "intense"], year: 2026,
      cover: "https://comicvine.gamespot.com/a/uploads/scale_large/11/117763/9656785-absbat2024009_cov.jpg",
      desc: "Scott Snyder and Nick Dragotta continue their bold reimagining of Batman in DC's Absolute Universe.",
      people: [{ role: "Writer", name: "Scott Snyder" }, { role: "Artist", name: "Nick Dragotta" }, { role: "Publisher", name: "DC Comics" }],
      awards: [], platforms: ["comixology"],
      ext: {}, totalEp: 6,
      releaseDate: "2026-07-15", hypeScore: 91, wantCount: 15800, upcoming: true,
    },
  ];
}

// ── Main exports ────────────────────────────────────────────────────────

/** Fetch all upcoming items from all APIs — only truly unreleased titles */
export async function fetchAllUpcoming(): Promise<UpcomingItem[]> {
  const [movies, tv, games, books] = await Promise.all([
    fetchUpcomingMovies(),
    fetchUpcomingTV(),
    fetchUpcomingGames(),
    fetchUpcomingBooks(),
  ]);

  const music = getCuratedUpcomingMusic();
  const comics = getCuratedUpcomingComics();

  // Combine and sort by release date
  const all = [...movies, ...tv, ...games, ...books, ...music, ...comics];

  // Final safety filter: exclude anything with a release date in the past
  const today = new Date().toISOString().split("T")[0];
  const filtered = all.filter((item) => item.releaseDate >= today);

  filtered.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  return filtered;
}

/** Fetch returning soon TV shows (existing shows with upcoming new seasons) */
export async function fetchReturningSoon(): Promise<ReturningSoonItem[]> {
  return fetchReturningSoonTV();
}

/** Look up a single upcoming item by its offset ID (for detail page) */
export async function lookupUpcomingItem(id: number): Promise<UpcomingItem | null> {
  // Determine source from ID range
  if (id >= 900000 && id < 1000000) {
    // TMDB movie
    const tmdbId = id - 900000;
    try {
      const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY()}`);
      if (!res.ok) return null;
      const m = await res.json();
      return {
        id,
        title: m.title,
        type: "movie" as MediaType,
        genre: (m.genres || []).map((g: { name: string }) => g.name).slice(0, 3),
        vibes: [],
        year: parseInt((m.release_date || "0").split("-")[0]),
        cover: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : "",
        desc: m.overview || "",
        people: [] as Person[],
        awards: [],
        platforms: ["theaters"],
        ext: {} as Partial<Record<ExternalSource, number>>,
        totalEp: 1,
        releaseDate: m.release_date || "",
        hypeScore: Math.min(99, Math.round(50 + (m.vote_count || 0) / 10)),
        wantCount: Math.round((m.vote_count || 0) * 3 + 500),
        upcoming: true as const,
      };
    } catch { return null; }
  }

  if (id >= 800000 && id < 900000) {
    // TMDB TV
    const tmdbId = id - 800000;
    try {
      const res = await fetch(`${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_KEY()}`);
      if (!res.ok) return null;
      const t = await res.json();
      return {
        id,
        title: t.name,
        type: "tv" as MediaType,
        genre: (t.genres || []).map((g: { name: string }) => g.name).slice(0, 3),
        vibes: [],
        year: parseInt((t.first_air_date || "0").split("-")[0]),
        cover: t.poster_path ? `${TMDB_IMG}${t.poster_path}` : "",
        desc: t.overview || "",
        people: [] as Person[],
        awards: [],
        platforms: [],
        ext: {} as Partial<Record<ExternalSource, number>>,
        totalEp: t.number_of_episodes || 0,
        releaseDate: t.first_air_date || "",
        hypeScore: Math.min(99, Math.round(40 + (t.vote_count || 0) / 20)),
        wantCount: Math.round((t.vote_count || 0) * 5 + 300),
        upcoming: true as const,
      };
    } catch { return null; }
  }

  if (id >= 700000 && id < 800000) {
    // IGDB game
    const igdbId = id - 700000;
    try {
      const token = await getIgdbToken();
      const res = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": IGDB_CID(),
          "Authorization": `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: `fields name,cover.image_id,first_release_date,hypes,summary,genres.name,platforms.name; where id = ${igdbId};`,
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data[0]) return null;
      const g = data[0];
      const date = g.first_release_date ? new Date(g.first_release_date * 1000) : new Date();
      return {
        id,
        title: g.name,
        type: "game" as MediaType,
        genre: (g.genres || []).map((ge: { name: string }) => ge.name).slice(0, 3),
        vibes: [],
        year: date.getFullYear(),
        cover: g.cover ? `${IGDB_IMG}/${g.cover.image_id}.jpg` : "",
        desc: g.summary || "",
        people: [] as Person[],
        awards: [],
        platforms: mapIgdbPlatforms(g.platforms || []),
        ext: {} as Partial<Record<ExternalSource, number>>,
        totalEp: 0,
        releaseDate: date.toISOString().split("T")[0],
        hypeScore: Math.min(99, Math.round(50 + (g.hypes || 0) / 5)),
        wantCount: Math.round((g.hypes || 0) * 40 + 1000),
        upcoming: true as const,
      };
    } catch { return null; }
  }

  // 600000+ range: Google Books — can't easily reverse lookup, return null
  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const TMDB_GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
  10752: "War", 37: "Western",
  10759: "Action", 10765: "Sci-Fi", 10766: "Soap", 10768: "War",
};

function mapTmdbGenres(ids: number[]): string[] {
  return ids.map((id) => TMDB_GENRE_MAP[id]).filter(Boolean).slice(0, 3);
}

function mapIgdbPlatforms(platforms: { name: string }[]): string[] {
  const result: string[] = [];
  for (const p of platforms) {
    const n = p.name.toLowerCase();
    if (n.includes("pc") || n.includes("windows")) { if (!result.includes("steam")) result.push("steam"); }
    else if (n.includes("playstation")) { if (!result.includes("ps")) result.push("ps"); }
    else if (n.includes("xbox")) { if (!result.includes("xbox")) result.push("xbox"); }
    else if (n.includes("switch")) { if (!result.includes("switch")) result.push("switch"); }
  }
  return result;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim();
}

function hashStr(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash);
}
