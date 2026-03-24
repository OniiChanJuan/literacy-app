import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rankSearchResults } from "@/lib/ranking";
import { searchTmdb, tmdbItemId } from "@/lib/tmdb";
import { searchIgdb, igdbItemId } from "@/lib/igdb";
import { searchGoogleBooks, gbookItemId } from "@/lib/google-books";
import { searchSpotify, spotifyItemId } from "@/lib/spotify";
import { searchJikanManga, searchJikanAnime, jikanItemId } from "@/lib/jikan";
import { searchComicVine, cvItemId } from "@/lib/comicvine";

// GET /api/search?q=query — search local DB + all external APIs in parallel
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  // Search local database
  const dbResultsPromise = prisma.item.findMany({
    where: {
      parentItemId: null, // Exclude DLCs
      title: { contains: q, mode: "insensitive" },
    },
    select: {
      id: true, title: true, type: true, genre: true, vibes: true,
      year: true, cover: true, description: true, ext: true, totalEp: true,
      people: true, awards: true, platforms: true, isUpcoming: true,
    },
    take: 20,
    orderBy: [{ popularityScore: "desc" }],
  }).then((items) =>
    items.map((item) => ({
      ...item,
      desc: item.description,
      source: "local",
      routeId: String(item.id),
    }))
  ).catch(() => [] as any[]);

  // Build dedup set from DB
  const localTitlesPromise = prisma.item.findMany({
    where: { title: { contains: q, mode: "insensitive" } },
    select: { title: true, year: true },
  }).then((items) => new Set(items.map((i) => `${i.title.toLowerCase()}-${i.year}`)))
    .catch(() => new Set<string>());

  // Search all external APIs in parallel alongside DB
  const [localResults, localTitles, tmdbResults, igdbResults, gbookResults, spotifyResults, mangaResults, animeResults, comicResults] = await Promise.all([
    dbResultsPromise,
    localTitlesPromise,

    searchTmdb(q)
      .then((items) => items.map((item) => ({
        ...item, source: "tmdb" as const,
        routeId: tmdbItemId(item.type as "movie" | "tv", item.id),
        sourceLabel: "TMDB",
      })))
      .catch(() => [] as any[]),

    searchIgdb(q)
      .then((items) => items.map((item) => ({
        ...item, source: "igdb" as const,
        routeId: igdbItemId(item.id),
        sourceLabel: "IGDB",
      })))
      .catch(() => [] as any[]),

    searchGoogleBooks(q)
      .then((items) => items.filter((i) => i.cover).map((item) => ({
        ...item, source: "gbook" as const,
        routeId: gbookItemId(item.volumeId),
        sourceLabel: "Google Books",
      })))
      .catch(() => [] as any[]),

    searchSpotify(q)
      .then((items) => items.filter((i) => i.cover).map((item) => ({
        ...item, source: "spotify" as const,
        routeId: spotifyItemId(item.spotifyType, item.spotifyId),
        sourceLabel: "Spotify",
      })))
      .catch(() => [] as any[]),

    searchJikanManga(q)
      .then((items) => items.filter((i) => i.cover).map((item) => ({
        ...item, source: "jikan" as const,
        routeId: jikanItemId("manga", item.malId),
        sourceLabel: "MAL",
      })))
      .catch(() => [] as any[]),

    searchJikanAnime(q)
      .then((items) => items.filter((i) => i.cover).map((item) => ({
        ...item, source: "jikan" as const,
        routeId: jikanItemId("anime", item.malId),
        sourceLabel: "MAL",
      })))
      .catch(() => [] as any[]),

    searchComicVine(q)
      .then((items) => items.filter((i) => i.cover).map((item) => ({
        ...item, source: "comicvine" as const,
        routeId: cvItemId(item.cvId),
        sourceLabel: "Comic Vine",
      })))
      .catch(() => [] as any[]),
  ]);

  // Deduplicate: remove API results that already exist locally
  const apiResults = [...tmdbResults, ...mangaResults, ...animeResults, ...comicResults, ...igdbResults, ...gbookResults, ...spotifyResults]
    .filter((item) => !localTitles.has(`${(item.title || "").toLowerCase()}-${item.year}`));

  // Mark local results
  const markedLocal = localResults.map((r: any) => ({ ...r, sourceLabel: "Your catalog" }));

  // Combine and rank
  const combined = rankSearchResults([...markedLocal, ...apiResults], q);

  const res = NextResponse.json(combined);
  res.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  return res;
}
