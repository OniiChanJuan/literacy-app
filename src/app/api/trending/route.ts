import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * GET /api/trending
 *
 * 5 items with the most ratings in the last 7 days. Falls back to
 * all-time most-rated if last-7-day counts are empty.
 */

interface TrendingOut {
  id: number;
  title: string;
  type: string;
  cover: string | null;
  slug: string | null;
  ratingCount: number;
  window: "7d" | "all-time";
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`trending:${ip}`, 120, 60_000)) {
    return NextResponse.json([], { status: 429 });
  }

  try {
    const sevenDay: Array<{ id: number; rating_count: number }> = await prisma.$queryRawUnsafe(`
      SELECT items.id, COUNT(ratings.id)::int AS rating_count
      FROM ratings
      JOIN items ON ratings.item_id = items.id
      WHERE ratings.created_at > NOW() - INTERVAL '7 days'
      GROUP BY items.id
      ORDER BY rating_count DESC
      LIMIT 5
    `);

    let rows = sevenDay;
    let windowKind: TrendingOut["window"] = "7d";

    if (rows.length === 0) {
      windowKind = "all-time";
      rows = await prisma.$queryRawUnsafe(`
        SELECT items.id, COUNT(ratings.id)::int AS rating_count
        FROM ratings
        JOIN items ON ratings.item_id = items.id
        GROUP BY items.id
        ORDER BY rating_count DESC
        LIMIT 5
      `);
    }

    if (rows.length === 0) {
      return NextResponse.json([]);
    }

    const items = await prisma.item.findMany({
      where: { id: { in: rows.map((r) => Number(r.id)) } },
      select: { id: true, title: true, type: true, cover: true, slug: true },
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    const out: TrendingOut[] = rows
      .map((r) => {
        const it = itemMap.get(Number(r.id));
        if (!it) return null;
        return {
          id: it.id,
          title: it.title,
          type: it.type,
          cover: it.cover,
          slug: it.slug,
          ratingCount: Number(r.rating_count),
          window: windowKind,
        };
      })
      .filter(Boolean) as TrendingOut[];

    const res = NextResponse.json(out);
    res.headers.set("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200");
    return res;
  } catch (err) {
    console.error("trending error:", err);
    return NextResponse.json([]);
  }
}
