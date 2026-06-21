import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

// GET /api/items/[id]/aggregate — compute aggregate rating data
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = _req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`item-aggregate:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { id } = await params;
  const itemId = parseInt(id);
  if (!itemId) {
    return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
  }

  const ratings = await prisma.rating.findMany({
    where: { itemId },
  });

  if (ratings.length === 0) {
    const emptyRes = NextResponse.json({
      avg: "0.0",
      count: 0,
      dist: [0, 0, 0, 0, 0],
      recPct: 0,
      recCount: 0,
      taggedCount: 0,
    });
    emptyRes.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return emptyRes;
  }

  // Compute average
  const sum = ratings.reduce((acc, r) => acc + r.score, 0);
  const avg = (sum / ratings.length).toFixed(1);

  // Distribution (index 0 = 1 star, index 4 = 5 stars)
  const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of ratings) {
    if (r.score >= 1 && r.score <= 5) {
      dist[r.score - 1]++;
    }
  }

  // Recommend percentage — denominator is TAGGED ratings only. A user who
  // stars without choosing recommend/mixed/skip must not silently count as a
  // non-recommend (the old `/ ratings.length` deflated every recPct). recPct is
  // recommend ÷ (recommend + mixed + skip); 0 when nothing is tagged yet.
  const recCount = ratings.filter((r) => r.recommendTag === "recommend").length;
  const taggedCount = ratings.filter((r) => r.recommendTag != null).length;
  const recPct = taggedCount > 0 ? Math.round((recCount / taggedCount) * 100) : 0;

  const res = NextResponse.json({
    avg,
    count: ratings.length,
    dist,
    recPct,
    // recCount: "recommend"-tagged ratings; taggedCount: ratings with ANY tag
    // (the recPct denominator). Both exposed read-only so callers can gate the
    // Recommend% leg/pill on >=5 tags (tags, not ratings).
    recCount,
    taggedCount,
  });
  // Public aggregate data — cache 60s at CDN, serve stale up to 2 min while revalidating
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  return res;
}
