import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/reviews?itemId=X — fetch all reviews for an item
export async function GET(req: NextRequest) {
  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const reviews = await prisma.review.findMany({
    where: { itemId },
    include: {
      user: { select: { id: true, name: true, image: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get the associated ratings for these users on this item
  const userIds = reviews.map((r) => r.userId);
  const ratings = await prisma.rating.findMany({
    where: { itemId, userId: { in: userIds } },
  });
  const ratingMap = new Map(ratings.map((r) => [r.userId, r]));

  const result = reviews.map((r) => {
    const rating = ratingMap.get(r.userId);
    return {
      id: r.id,
      userId: r.userId,
      userName: r.user.name || "Anonymous",
      userAvatar: r.user.image || r.user.avatar || "",
      score: rating?.score ?? 0,
      recommendTag: rating?.recommendTag ?? null,
      text: r.text,
      helpfulCount: r.helpfulCount,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return NextResponse.json(result);
}

// POST /api/reviews — create or update a review
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json();
  const { itemId, text } = body as { itemId: number; text: string };

  if (!itemId || !text?.trim()) {
    return NextResponse.json({ error: "itemId and text required" }, { status: 400 });
  }

  // Check if user has rated this item
  const rating = await prisma.rating.findUnique({
    where: { userId_itemId: { userId, itemId } },
  });
  if (!rating) {
    return NextResponse.json({ error: "You must rate this item before reviewing" }, { status: 400 });
  }

  // Upsert review (one review per user per item)
  const existing = await prisma.review.findFirst({
    where: { userId, itemId },
  });

  let review;
  if (existing) {
    review = await prisma.review.update({
      where: { id: existing.id },
      data: { text: text.trim() },
    });
  } else {
    review = await prisma.review.create({
      data: { userId, itemId, text: text.trim() },
    });
  }

  return NextResponse.json(review, { status: existing ? 200 : 201 });
}
