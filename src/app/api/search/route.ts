import { NextRequest, NextResponse } from "next/server";
import { ALL_ITEMS } from "@/lib/data";
import { searchTmdb, tmdbItemId } from "@/lib/tmdb";

// GET /api/search?q=query — search local items + TMDB
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

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

  // Search TMDB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tmdbResults: any[] = [];
  try {
    const tmdbItems = await searchTmdb(q);
    // Filter out TMDB results that match local items by title+year
    const localTitles = new Set(ALL_ITEMS.map((i) => `${i.title.toLowerCase()}-${i.year}`));
    tmdbResults = tmdbItems
      .filter((item) => !localTitles.has(`${item.title.toLowerCase()}-${item.year}`))
      .map((item) => ({
        ...item,
        source: "tmdb",
        routeId: tmdbItemId(item.type as "movie" | "tv", item.id),
      }));
  } catch (e) {
    console.error("TMDB search failed:", e);
  }

  // Local first, then TMDB
  return NextResponse.json([...localResults, ...tmdbResults]);
}
