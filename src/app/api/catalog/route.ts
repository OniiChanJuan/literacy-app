import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Lightweight select for card views — no description, people, awards, platforms */
const CARD_SELECT = {
  id: true,
  title: true,
  type: true,
  genre: true,
  vibes: true,
  year: true,
  cover: true,
  ext: true,
  totalEp: true,
} as const;

/** Full select for detail views */
const FULL_SELECT = {
  ...CARD_SELECT,
  description: true,
  people: true,
  awards: true,
  platforms: true,
  isUpcoming: true,
  releaseDate: true,
  hypeScore: true,
  wantCount: true,
} as const;

/**
 * GET /api/catalog — Fetch items with pagination and caching.
 *
 * Query params:
 *   type    — filter by media type
 *   limit   — max items (default 20, max 100)
 *   offset  — pagination offset
 *   sort    — "recent" (year desc) | "title" (alpha) | "rating" (year desc proxy)
 *   genre   — filter by genre
 *   vibe    — filter by vibe
 *   curated — "top_rated" | "popular" | "hidden_gems"
 *   fields  — "full" for detail shape, omit for card shape
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
  const fields = searchParams.get("fields");

  try {
    const where: any = { isUpcoming: false };
    if (type) where.type = type;
    if (genre) where.genre = { has: genre };
    if (vibe) where.vibes = { has: vibe };

    let orderBy: any = { year: "desc" };
    if (sort === "title") orderBy = { title: "asc" };

    const useSelect = fields === "full" ? FULL_SELECT : CARD_SELECT;

    // For curated lists, use specific query strategies
    if (curated === "top_rated") {
      // Fetch items with high external scores — use year desc and let DB handle it
      const items = await prisma.item.findMany({
        where: { isUpcoming: false },
        orderBy: { year: "desc" },
        take: 200,
        select: CARD_SELECT,
      });

      // Sort by max external score server-side
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

      const res = NextResponse.json(sorted.map(mapCard));
      res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      return res;
    }

    if (curated === "popular") {
      const currentYear = new Date().getFullYear();
      const items = await prisma.item.findMany({
        where: { isUpcoming: false, year: { gte: currentYear - 3 } },
        orderBy: { year: "desc" },
        take: limit,
        select: CARD_SELECT,
      });
      const res = NextResponse.json(items.map(mapCard));
      res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      return res;
    }

    if (curated === "hidden_gems") {
      const items = await prisma.item.findMany({
        where: { isUpcoming: false },
        orderBy: { year: "desc" },
        take: 300,
        select: CARD_SELECT,
      });

      // Hidden gems: have scores >=7 but not in the absolute top tier
      const gems = items
        .filter((i) => {
          const ext = i.ext as Record<string, number>;
          const vals = Object.values(ext);
          return vals.length > 0 && vals.some((v) => v >= 7) && !vals.some((v) => v >= 9);
        })
        .slice(0, limit);

      const res = NextResponse.json(gems.map(mapCard));
      res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      return res;
    }

    // Count total for pagination
    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        select: useSelect,
      }),
      prisma.item.count({ where }),
    ]);

    const mapped = fields === "full"
      ? items.map(mapFull)
      : items.map(mapCard);

    const res = NextResponse.json(mapped, {
      headers: {
        "X-Total-Count": total.toString(),
        "X-Has-More": (offset + limit < total).toString(),
      },
    });
    res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (error: any) {
    console.error("Catalog API error:", error);
    return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 });
  }
}

function mapCard(item: any) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    genre: item.genre,
    vibes: item.vibes,
    year: item.year,
    cover: item.cover,
    ext: item.ext,
    totalEp: item.totalEp,
  };
}

function mapFull(item: any) {
  return {
    ...mapCard(item),
    desc: item.description,
    people: item.people,
    awards: item.awards,
    platforms: item.platforms,
  };
}
