import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import { loadPrivacyFlags } from "@/lib/privacy";

// GET /api/users/search?q=username — search users by name
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`users-search:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const claims = await getClaims();
  const currentUserId = claims?.sub;

  // Read profile data from public_user_profiles view; _count comes
  // from a parallel base-User fetch since views don't carry relations.
  const profiles = await prisma.publicUserProfile.findMany({
    where: {
      name: { contains: q, mode: "insensitive" },
      ...(currentUserId ? { id: { not: currentUserId } } : {}),
    },
    take: 20,
  });

  const [counts, flags] = await Promise.all([
    profiles.length > 0
      ? prisma.user.findMany({
          where: { id: { in: profiles.map((p) => p.id) } },
          select: { id: true, _count: { select: { ratings: true, reviews: true } } },
        })
      : Promise.resolve([] as { id: string; _count: { ratings: number; reviews: number } }[]),
    loadPrivacyFlags(profiles.map((p) => p.id)),
  ]);
  const countMap = new Map(counts.map((c) => [c.id, c._count]));

  const users = profiles.map((p) => ({
    ...p,
    _count: countMap.get(p.id) ?? { ratings: 0, reviews: 0 },
  }));

  // If logged in, check which of these the current user follows
  let followedIds = new Set<string>();
  if (currentUserId) {
    const follows = await prisma.follow.findMany({
      where: { followerId: currentUserId, followedId: { in: users.map((u) => u.id) } },
      select: { followedId: true },
    });
    followedIds = new Set(follows.map((f) => f.followedId));
  }

  // Privacy: a matched user still appears in search (findable + followable),
  // but their activity counts follow the same gates as the profile page —
  // is_private hides both; the per-surface toggles narrow further. Mirrors
  // showRatings / showReviews in /api/users/[id].
  return NextResponse.json(users.map((u) => {
    const showRatings = !u.isPrivate && flags.get(u.id)?.showRatingsPublicly !== false;
    const showReviews = !u.isPrivate && flags.get(u.id)?.showActivityPublicly !== false;
    return {
      id: u.id,
      name: u.name || "Anonymous",
      avatar: u.image || u.avatar || "",
      bio: u.bio,
      memberNumber: u.memberNumber,
      ratingsCount: showRatings ? u._count.ratings : 0,
      reviewsCount: showReviews ? u._count.reviews : 0,
      isFollowing: followedIds.has(u.id),
    };
  }));
}
