import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

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

  const session = await auth();
  const currentUserId = session?.user?.id;

  const users = await prisma.user.findMany({
    where: {
      name: { contains: q, mode: "insensitive" },
      ...(currentUserId ? { id: { not: currentUserId } } : {}),
    },
    select: {
      id: true, name: true, image: true, avatar: true, bio: true, memberNumber: true,
      _count: { select: { ratings: true, reviews: true } },
    },
    take: 20,
  });

  // If logged in, check which of these the current user follows
  let followedIds = new Set<string>();
  if (currentUserId) {
    const follows = await prisma.follow.findMany({
      where: { followerId: currentUserId, followedId: { in: users.map((u) => u.id) } },
      select: { followedId: true },
    });
    followedIds = new Set(follows.map((f) => f.followedId));
  }

  return NextResponse.json(users.map((u) => ({
    id: u.id,
    name: u.name || "Anonymous",
    avatar: u.image || u.avatar || "",
    bio: u.bio,
    memberNumber: u.memberNumber,
    ratingsCount: u._count.ratings,
    reviewsCount: u._count.reviews,
    isFollowing: followedIds.has(u.id),
  })));
}
