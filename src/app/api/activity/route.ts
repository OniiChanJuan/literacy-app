import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/activity — recent reviews from people you follow
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`activity:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json([]);
  }

  // Get who the user follows
  const follows = await prisma.follow.findMany({
    where: { followerId: session.user.id },
    select: { followedId: true },
  });
  const followedIds = follows.map((f) => f.followedId);

  if (followedIds.length === 0) {
    return NextResponse.json([]);
  }

  // Get recent reviews from followed users
  const reviews = await prisma.review.findMany({
    where: { userId: { in: followedIds } },
    include: {
      user: { select: { id: true, name: true, image: true, avatar: true } },
      item: { select: { id: true, title: true, type: true, cover: true, year: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Get ratings for these reviews
  const ratingKeys = reviews.map((r) => ({ userId: r.userId, itemId: r.itemId }));
  const ratings = await prisma.rating.findMany({
    where: {
      OR: ratingKeys.map((k) => ({ userId: k.userId, itemId: k.itemId })),
    },
  });
  const ratingMap = new Map(ratings.map((r) => [`${r.userId}-${r.itemId}`, r]));

  return NextResponse.json(reviews.map((r) => {
    const rating = ratingMap.get(`${r.userId}-${r.itemId}`);
    return {
      id: r.id,
      userId: r.user.id,
      userName: r.user.name || "Anonymous",
      userAvatar: r.user.image || r.user.avatar || "",
      itemId: r.item.id,
      itemTitle: r.item.title,
      itemType: r.item.type,
      itemCover: r.item.cover,
      itemYear: r.item.year,
      score: rating?.score ?? 0,
      recommendTag: rating?.recommendTag ?? null,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
    };
  }));
}
