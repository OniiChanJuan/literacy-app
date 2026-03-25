import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/refresh-catalog
 * Body: { types: ["music", "podcast", "comic"] }
 * Pulls fresh popular content from Spotify and Comic Vine APIs.
 * Can be triggered manually from admin panel when catalog feels stale.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const types: string[] = body.types || ["music", "podcast", "comic"];
  const results: Record<string, number> = {};

  for (const type of types) {
    try {
      if (type === "music") {
        results.music = await refreshMusic();
      } else if (type === "podcast") {
        results.podcast = await refreshPodcasts();
      } else if (type === "comic") {
        results.comic = await refreshComics();
      }
    } catch (err: any) {
      console.error(`Refresh ${type} failed:`, err.message?.slice(0, 100));
      results[type] = -1;
    }
  }

  return NextResponse.json({ results });
}

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
  if (res.status === 429) {
    const wait = Math.min(parseInt(res.headers.get("Retry-After") || "5"), 10);
    await new Promise(r => setTimeout(r, wait * 1000));
    return spotifyFetch(path);
  }
  if (!res.ok) return null;
  return res.json();
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Refresh Music ────────────────────────────────────────────────────────

async function refreshMusic(): Promise<number> {
  const searches = [
    "new albums 2026", "new albums 2025", "top albums", "best albums",
    "trending music", "popular albums", "album of the year",
  ];

  let added = 0;
  for (const query of searches) {
    const data = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=album&limit=20&market=US`);
    if (!data?.albums?.items) continue;

    for (const album of data.albums.items) {
      if (!album.id || !album.name) continue;
      const existing = await prisma.item.findFirst({ where: { spotifyId: album.id } });
      if (existing) continue;

      const cover = album.images?.[0]?.url || "";
      if (!cover) continue;

      const artistName = album.artists?.[0]?.name || "";
      const year = album.release_date ? parseInt(album.release_date.substring(0, 4)) : 0;
      const desc = `${album.name} by ${artistName}, released in ${year}. ${album.total_tracks || 0} tracks.`;

      await prisma.item.create({
        data: {
          title: album.name,
          type: "music",
          genre: ["Pop"],
          vibes: ["Immersive"],
          year,
          cover,
          description: desc,
          people: artistName ? [{ role: "Artist", name: artistName }] as any : [],
          awards: [],
          platforms: ["spotify", "apple-music"],
          ext: { spotify_popularity: 50 },
          totalEp: album.total_tracks || 0,
          spotifyId: album.id,
          popularityScore: 50,
          voteCount: 50,
          lastSyncedAt: new Date(),
        },
      });
      added++;
      await sleep(100);
    }
  }
  return added;
}

// ── Refresh Podcasts ────────────────────────────────────────────────────

async function refreshPodcasts(): Promise<number> {
  const searches = [
    "new podcasts 2026", "trending podcasts", "top podcasts",
    "popular podcasts", "best new podcasts",
  ];

  let added = 0;
  for (const query of searches) {
    const data = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=show&limit=20&market=US`);
    if (!data?.shows?.items) continue;

    for (const show of data.shows.items) {
      if (!show.id || !show.name) continue;
      const existing = await prisma.item.findFirst({ where: { spotifyId: show.id } });
      if (existing) continue;

      const cover = show.images?.[0]?.url || "";
      if (!cover) continue;

      const desc = show.description || `${show.name} podcast with ${show.total_episodes || 0} episodes.`;
      if (desc.length < 20) continue;

      await prisma.item.create({
        data: {
          title: show.name,
          type: "podcast",
          genre: ["General"],
          vibes: ["Immersive"],
          year: 2024,
          cover,
          description: desc.length > 500 ? desc.substring(0, 497) + "..." : desc,
          people: show.publisher ? [{ role: "Host", name: show.publisher }] as any : [],
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
      await sleep(100);
    }
  }
  return added;
}

// ── Refresh Comics ──────────────────────────────────────────────────────

async function refreshComics(): Promise<number> {
  const cvKey = process.env.COMICVINE_API_KEY;
  if (!cvKey) return 0;

  let added = 0;
  const searches = ["new comics 2026", "best comics", "popular comics", "graphic novel"];

  for (const query of searches) {
    try {
      const url = new URL("https://comicvine.gamespot.com/api/search/");
      url.searchParams.set("api_key", cvKey);
      url.searchParams.set("format", "json");
      url.searchParams.set("query", query);
      url.searchParams.set("resources", "volume");
      url.searchParams.set("limit", "10");
      url.searchParams.set("field_list", "id,name,start_year,image,description,count_of_issues,publisher,deck");

      const res = await fetch(url.toString(), { headers: { "User-Agent": "Literacy/1.0" } });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.results) continue;

      for (const vol of data.results) {
        if (!vol.name || !vol.id) continue;
        const existing = await prisma.item.findFirst({ where: { comicVineId: vol.id } });
        if (existing) continue;

        const cover = vol.image?.medium_url || "";
        if (!cover) continue;

        const desc = (vol.description || vol.deck || "")
          .replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim();
        if (desc.length < 20) continue;

        await prisma.item.create({
          data: {
            title: vol.name,
            type: "comic",
            genre: ["Comics"],
            vibes: ["Thought-Provoking"],
            year: vol.start_year ? parseInt(vol.start_year) : 2020,
            cover,
            description: desc.length > 500 ? desc.substring(0, 497) + "..." : desc,
            people: vol.publisher?.name ? [{ role: "Publisher", name: vol.publisher.name }] as any : [],
            awards: [],
            platforms: ["comixology"],
            ext: {},
            totalEp: vol.count_of_issues || 0,
            comicVineId: vol.id,
            popularityScore: vol.count_of_issues || 10,
            voteCount: vol.count_of_issues || 10,
            lastSyncedAt: new Date(),
          },
        });
        added++;
        await sleep(1100); // Comic Vine: 1 req/sec
      }
    } catch { /* skip */ }
  }
  return added;
}
