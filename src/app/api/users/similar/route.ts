import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/users/similar — find users with overlapping ratings
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`users-similar:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json([]);
  }

  // Get current user's ratings
  const myRatings = await prisma.rating.findMany({
    where: { userId: claims.sub },
    select: { itemId: true, score: true },
  });

  if (myRatings.length === 0) {
    return NextResponse.json([]);
  }

  const myItemIds = myRatings.map((r) => r.itemId);
  const myScoreMap = new Map(myRatings.map((r) => [r.itemId, r.score]));

  // Find other users who rated the same items
  const otherRatings = await prisma.rating.findMany({
    where: {
      itemId: { in: myItemIds },
      userId: { not: claims.sub },
    },
    select: { userId: true, itemId: true, score: true },
  });

  // Compute similarity: count of shared ratings + score closeness
  const userScores: Record<string, { shared: number; closeness: number }> = {};
  for (const r of otherRatings) {
    if (!userScores[r.userId]) userScores[r.userId] = { shared: 0, closeness: 0 };
    userScores[r.userId].shared++;
    const myScore = myScoreMap.get(r.itemId) ?? 0;
    // Closeness: 5 - abs(diff), so identical ratings = 5, max diff = 1
    userScores[r.userId].closeness += 5 - Math.abs(myScore - r.score);
  }

  // Rank by combined score (shared count * closeness), take top 8
  const ranked = Object.entries(userScores)
    .map(([userId, { shared, closeness }]) => ({
      userId,
      shared,
      similarity: shared * 2 + closeness,
    }))
    .filter((u) => u.shared >= 1)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 8);

  if (ranked.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch user details from the safe-fields view; _count fetched
  // in parallel from base User since views don't carry relations.
  const userIds = ranked.map((r) => r.userId);
  const [profiles, counts] = await Promise.all([
    prisma.publicUserProfile.findMany({ where: { id: { in: userIds } } }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, _count: { select: { ratings: true, reviews: true } } },
    }),
  ]);
  const countMap = new Map(counts.map((c) => [c.id, c._count]));
  const userMap = new Map(profiles.map((p) => [p.id, {
    ...p,
    _count: countMap.get(p.id) ?? { ratings: 0, reviews: 0 },
  }]));

  // Check follow status
  const follows = await prisma.follow.findMany({
    where: { followerId: claims.sub, followedId: { in: userIds } },
    select: { followedId: true },
  });
  const followedIds = new Set(follows.map((f) => f.followedId));

  return NextResponse.json(ranked.map((r) => {
    const u = userMap.get(r.userId);
    if (!u) return null;
    return {
      id: u.id,
      name: u.name || "Anonymous",
      avatar: u.image || u.avatar || "",
      bio: u.bio,
      memberNumber: u.memberNumber,
      ratingsCount: u._count.ratings,
      reviewsCount: u._count.reviews,
      sharedRatings: r.shared,
      isFollowing: followedIds.has(u.id),
    };
  }).filter(Boolean));
}
