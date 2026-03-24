import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Standard select — includes all fields needed for cards + hover previews */
const ITEM_SELECT = {
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
} as const;

/**
 * GET /api/catalog — Fetch items with pagination and caching.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const sort = searchParams.get("sort") || "recent";
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

    if (curated === "top_rated") {
      const items = await prisma.item.findMany({
        where: { isUpcoming: false },
        orderBy: { year: "desc" },
        take: 100,
        select: ITEM_SELECT,
      });

      const sorted = items
        .filter((i) => {
          const ext = i.ext as Record<string, number>;
          return Object.values(ext).some((v) => v >= 8);
        })
        .sort((a, b) => {
          const aMax = Math.max(...Object.values(a.ext as Record<string, number>));
          const bMax = Math.max(...Object.values(b.ext as Record<string, number>));
          return bMax - aMax;
        })
        .slice(0, limit);

      return jsonResponse(sorted.map(mapItem));
    }

    if (curated === "popular") {
      const currentYear = new Date().getFullYear();
      const items = await prisma.item.findMany({
        where: { isUpcoming: false, year: { gte: currentYear - 3 } },
        orderBy: { year: "desc" },
        take: limit,
        select: ITEM_SELECT,
      });
      return jsonResponse(items.map(mapItem));
    }

    if (curated === "hidden_gems") {
      const items = await prisma.item.findMany({
        where: { isUpcoming: false },
        orderBy: { year: "desc" },
        take: 100,
        select: ITEM_SELECT,
      });

      const gems = items
        .filter((i) => {
          const ext = i.ext as Record<string, number>;
          const vals = Object.values(ext);
          return vals.length > 0 && vals.some((v) => v >= 7) && !vals.some((v) => v >= 9);
        })
        .slice(0, limit);

      return jsonResponse(gems.map(mapItem));
    }

    // Standard query with pagination
    const items = await prisma.item.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      select: ITEM_SELECT,
    });

    return jsonResponse(items.map(mapItem));
  } catch (error: any) {
    console.error("Catalog API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch catalog" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function jsonResponse(data: any) {
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res;
}

function mapItem(item: any) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    genre: item.genre || [],
    vibes: item.vibes || [],
    year: item.year,
    cover: item.cover || "",
    desc: item.description || "",
    people: item.people || [],
    awards: item.awards || [],
    platforms: item.platforms || [],
    ext: item.ext || {},
    totalEp: item.totalEp || 0,
  };
}
