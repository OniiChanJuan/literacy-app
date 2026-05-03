import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/users/me/following — full list of users the current user follows
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`me-following:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json([]);

  // Fetch follows ordered by recency, then assemble each followed user's
  // public profile from the view, their counts from base User, and
  // their recent ratings (used to derive top media types + last-active)
  // from the Rating model. Splitting these queries keeps user profile
  // reads on the safe-fields view while still allowing the relation
  // traversals the page needs.
  const follows = await prisma.follow.findMany({
    where: { followerId: claims.sub },
    select: { followedId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (follows.length === 0) return NextResponse.json([]);

  const followedIds = follows.map((f) => f.followedId);

  const [profiles, counts, ratings] = await Promise.all([
    prisma.publicUserProfile.findMany({ where: { id: { in: followedIds } } }),
    prisma.user.findMany({
      where: { id: { in: followedIds } },
      select: { id: true, _count: { select: { ratings: true, reviews: true } } },
    }),
    prisma.rating.findMany({
      where: { userId: { in: followedIds } },
      select: { userId: true, createdAt: true, item: { select: { type: true } } },
      orderBy: { createdAt: "desc" },
      take: 200 * followedIds.length, // headroom across all followed users
    }),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const countMap = new Map(counts.map((c) => [c.id, c._count]));
  const ratingsByUser = new Map<string, { type: string; createdAt: Date }[]>();
  for (const r of ratings) {
    const list = ratingsByUser.get(r.userId) ?? [];
    list.push({ type: r.item.type, createdAt: r.createdAt });
    ratingsByUser.set(r.userId, list);
  }

  // Preserve the follow ordering (most-recently-followed first).
  const users = follows
    .map((f) => {
      const p = profileMap.get(f.followedId);
      if (!p) return null;
      const c = countMap.get(f.followedId);
      const userRatings = ratingsByUser.get(f.followedId) ?? [];

      const typeCounts: Record<string, number> = {};
      let lastActiveAt: string | null = null;
      for (const r of userRatings) {
        typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
        if (!lastActiveAt) lastActiveAt = r.createdAt.toISOString(); // desc order
      }
      const topMediaTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type]) => type);

      return {
        id: p.id,
        name: p.name || "Anonymous",
        avatar: p.avatar || p.image || "",
        memberNumber: p.memberNumber,
        ratedCount: c?.ratings ?? 0,
        reviewCount: c?.reviews ?? 0,
        topMediaTypes,
        lastActiveAt,
      };
    })
    .filter(Boolean);

  return NextResponse.json(users);
}
