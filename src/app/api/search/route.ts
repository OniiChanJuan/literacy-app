import { NextRequest, NextResponse } from "next/server";
import { ALL_ITEMS } from "@/lib/data";
import { searchTmdb, tmdbItemId } from "@/lib/tmdb";
import { searchIgdb, igdbItemId } from "@/lib/igdb";

// GET /api/search?q=query — search local items + TMDB + IGDB
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

  // Search TMDB + IGDB in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tmdbResults, igdbResults] = await Promise.all([
    searchTmdb(q)
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
  ]);

  // Local first, then TMDB, then IGDB
  return NextResponse.json([...localResults, ...tmdbResults, ...igdbResults]);
}
