import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/catalog — Fetch items from the database for the For You and Explore pages.
 *
 * Query params:
 *   type    — filter by media type (movie, tv, book, manga, comic, game, music, podcast)
 *   limit   — max items to return (default 50, max 200)
 *   offset  — pagination offset
 *   sort    — "rating" (by external score), "recent" (by year desc), "title" (alphabetical)
 *   genre   — filter by genre (partial match)
 *   vibe    — filter by vibe (partial match)
 *   curated — special curated lists: "top_rated", "popular", "hidden_gems"
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");
  const sort = searchParams.get("sort") || "rating";
  const genre = searchParams.get("genre");
  const vibe = searchParams.get("vibe");
  const curated = searchParams.get("curated");

  try {
    const where: any = { isUpcoming: false };
    if (type) where.type = type;
    if (genre) where.genre = { has: genre };
    if (vibe) where.vibes = { has: vibe };

    let orderBy: any = { year: "desc" };
    if (sort === "title") orderBy = { title: "asc" };
    if (sort === "recent") orderBy = { year: "desc" };
    // For rating sort, we order by year desc as a proxy (can't sort by JSON field easily)
    // The client-side will re-sort if needed

    const items = await prisma.item.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      select: {
        id: true,
        title: true,
        type: true,
        genre: true,
        vibes: true,
        year: true,
        cover: true,
        description: true,
        people: true,
        awards: true,
        platforms: true,
        ext: true,
        totalEp: true,
      },
    });

    // Map to the Item shape the frontend expects
    const mapped = items.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      genre: item.genre,
      vibes: item.vibes,
      year: item.year,
      cover: item.cover,
      desc: item.description,
      people: item.people,
      awards: item.awards,
      platforms: item.platforms,
      ext: item.ext,
      totalEp: item.totalEp,
    }));

    return NextResponse.json(mapped);
  } catch (error: any) {
    console.error("Catalog API error:", error);
    return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 });
  }
}
