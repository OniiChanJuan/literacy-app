import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import type { TasteDimensions } from "@/lib/taste-dimensions";

/**
 * GET /api/for-you/profile — Lightweight taste profile endpoint.
 *
 * Returns only { tasteProfile, topGenres } — NO item scoring, NO candidate
 * scan. Used by the For You banner so the page no longer has to run the
 * full scoring pipeline just to render the taste header.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`for-you-profile:${ip}`, 240, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const claims = await getClaims();
  if (!claims?.sub) {
    // TEMPORARY debug: expose whether claims was null vs tasteProfile empty
    return NextResponse.json({
      tasteProfile: null,
      topGenres: [],
      _debug_authed: false,
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { tasteProfile: true },
    });
    const tasteProfile = (user?.tasteProfile as unknown as TasteDimensions) || null;

    // Compute top genres from user's ratings (weight high-rated items double)
    const ratings = await prisma.rating.findMany({
      where: { userId: claims.sub },
      select: { score: true, item: { select: { genre: true } } },
    });

    const genreCounts: Record<string, number> = {};
    for (const r of ratings) {
      for (const g of (r.item.genre || [])) {
        genreCounts[g] = (genreCounts[g] || 0) + (r.score >= 4 ? 2 : 1);
      }
    }
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([g]) => g);

    const res = NextResponse.json({
      tasteProfile,
      topGenres,
      _debug_authed: true,
      _debug_uid: claims.sub,
      _debug_rating_count: ratings.length,
    });
    res.headers.set("Cache-Control", "private, max-age=60");
    return res;
  } catch (err: any) {
    console.error("For You profile error:", err);
    return NextResponse.json({
      tasteProfile: null,
      topGenres: [],
      _debug_authed: true,
      _debug_error: err?.message || String(err),
    });
  }
}
