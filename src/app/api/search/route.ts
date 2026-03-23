import { NextRequest, NextResponse } from "next/server";
import { ALL_ITEMS } from "@/lib/data";
import { searchTmdb, tmdbItemId } from "@/lib/tmdb";
import { searchIgdb, igdbItemId } from "@/lib/igdb";
import { searchGoogleBooks, gbookItemId } from "@/lib/google-books";
import { searchSpotify, spotifyItemId } from "@/lib/spotify";
import { searchJikanManga, searchJikanAnime, jikanItemId } from "@/lib/jikan";
import { searchComicVine, cvItemId } from "@/lib/comicvine";

// GET /api/search?q=query — search all APIs
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const localTitles = new Set(ALL_ITEMS.map((i) => `${i.title.toLowerCase()}-${i.year}`));

  // Search local items first
  const localResults = ALL_ITEMS.filter((item) => {
    const searchable = [
      item.title,
      ...item.genre,
      ...item.vibes,
      ...item.people.map((p) => p.name),
    ].join(" ").toLowerCase();
    return searchable.includes(q);
  }).map((item) => ({
    ...item,
    source: "local",
    routeId: String(item.id),
  }));

  // Search all APIs in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tmdbResults, igdbResults, gbookResults, spotifyResults, mangaResults, animeResults, comicResults] = await Promise.all([
    searchTmdb(q) // Already filters out anime TV shows
      .then((items) =>
        items
          .filter((item) => !localTitles.has(`${item.title.toLowerCase()}-${item.year}`))
          .map((item) => ({
            ...item,
            source: "tmdb" as const,
            routeId: tmdbItemId(item.type as "movie" | "tv", item.id),
          }))
      )
      .catch((e) => { console.error("TMDB search failed:", e); return [] as any[]; }),

    searchIgdb(q)
      .then((items) =>
        items
          .filter((item) => !localTitles.has(`${item.title.toLowerCase()}-${item.year}`))
          .map((item) => ({
            ...item,
            source: "igdb" as const,
            routeId: igdbItemId(item.id),
          }))
      )
      .catch((e) => { console.error("IGDB search failed:", e); return [] as any[]; }),

    searchGoogleBooks(q)
      .then((items) =>
        items
          .filter((item) => !localTitles.has(`${item.title.toLowerCase()}-${item.year}`))
          .filter((item) => item.cover)
          .map((item) => ({
            ...item,
            source: "gbook" as const,
            routeId: gbookItemId(item.volumeId),
          }))
      )
      .catch((e) => { console.error("Google Books search failed:", e); return [] as any[]; }),

    searchSpotify(q)
      .then((items) =>
        items
          .filter((item) => !localTitles.has(`${item.title.toLowerCase()}-${item.year}`))
          .filter((item) => item.cover)
          .map((item) => ({
            ...item,
            source: "spotify" as const,
            routeId: spotifyItemId(item.spotifyType, item.spotifyId),
          }))
      )
      .catch((e) => { console.error("Spotify search failed:", e); return [] as any[]; }),

    searchJikanManga(q)
      .then((items) =>
        items
          .filter((item) => !localTitles.has(`${item.title.toLowerCase()}-${item.year}`))
          .filter((item) => item.cover)
          .map((item) => ({
            ...item,
            source: "jikan" as const,
            routeId: jikanItemId("manga", item.malId),
          }))
      )
      .catch((e) => { console.error("Jikan manga search failed:", e); return [] as any[]; }),

    searchJikanAnime(q)
      .then((items) =>
        items
          .filter((item) => !localTitles.has(`${item.title.toLowerCase()}-${item.year}`))
          .filter((item) => item.cover)
          .map((item) => ({
            ...item,
            source: "jikan" as const,
            routeId: jikanItemId("anime", item.malId),
          }))
      )
      .catch((e) => { console.error("Jikan anime search failed:", e); return [] as any[]; }),

    searchComicVine(q)
      .then((items) =>
        items
          .filter((item) => !localTitles.has(`${item.title.toLowerCase()}-${item.year}`))
          .filter((item) => item.cover)
          .map((item) => ({
            ...item,
            source: "comicvine" as const,
            routeId: cvItemId(item.cvId),
          }))
      )
      .catch((e) => { console.error("Comic Vine search failed:", e); return [] as any[]; }),
  ]);

  return NextResponse.json([
    ...localResults, ...tmdbResults, ...mangaResults, ...animeResults,
    ...comicResults, ...igdbResults, ...gbookResults, ...spotifyResults,
  ]);
}
