import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import type { TasteDimensions } from "@/lib/taste-dimensions";

/**
 * GET /api/for-you/profile — Lightweight taste profile + identity-card
 * stats endpoint. No item scoring, no candidate scan. Used by the
 * For You TasteIdentityCard + the (smaller) TasteFilterBar beneath it.
 *
 * Returns:
 *   tasteProfile     — raw TasteDimensions JSON for tag derivation
 *   topGenres        — weighted genre list for the genre-pills row
 *   stats            — { ratingCount, typesCount, avgScore, typeBreakdown, memberNumber, displayName, email, joinedAt }
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`for-you-profile:${ip}`, 240, 60_000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ tasteProfile: null, topGenres: [], stats: null });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        tasteProfile: true,
        name: true,
        email: true,
        memberNumber: true,
        createdAt: true,
      },
    });
    const tasteProfile = (user?.tasteProfile as unknown as TasteDimensions) || null;

    // Pull all ratings joined to item.type + item.genre in one query.
    const ratings = await prisma.rating.findMany({
      where: { userId: claims.sub },
      select: { score: true, item: { select: { type: true, genre: true } } },
    });

    // ── Top genres (weight 4+ stars double) ────────────────────────────
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

    // ── Identity-card stats ────────────────────────────────────────────
    const typeBreakdown: Record<string, number> = {};
    let scoreSum = 0;
    for (const r of ratings) {
      typeBreakdown[r.item.type] = (typeBreakdown[r.item.type] || 0) + 1;
      scoreSum += r.score;
    }
    const ratingCount = ratings.length;
    const typesCount = Object.keys(typeBreakdown).length;
    const avgScore = ratingCount > 0 ? scoreSum / ratingCount : 0;

    const stats = user
      ? {
          ratingCount,
          typesCount,
          avgScore: Number(avgScore.toFixed(1)),
          typeBreakdown, // e.g. { movie: 8, tv: 4, game: 2 }
          displayName: user.name || user.email?.split("@")[0] || "You",
          memberNumber: user.memberNumber ?? null,
          joinedAt: user.createdAt?.toISOString() ?? null,
          userId: claims.sub,
        }
      : null;

    const res = NextResponse.json({ tasteProfile, topGenres, stats });
    res.headers.set("Cache-Control", "private, max-age=60");
    return res;
  } catch (err) {
    console.error("For You profile error:", err);
    return NextResponse.json({ tasteProfile: null, topGenres: [], stats: null });
  }
}
