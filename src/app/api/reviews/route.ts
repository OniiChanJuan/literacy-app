import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateReviewText, rateLimit } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  // Get current user for helpful vote status
  const session = await auth();
  const currentUserId = session?.user?.id || null;

  try {
    const reviews = await prisma.review.findMany({
      where: { itemId },
      include: {
        user: { select: { id: true, name: true, image: true, avatar: true } },
        helpfulVotes: currentUserId
          ? { where: { userId: currentUserId }, select: { userId: true } }
          : false,
      },
      orderBy: [{ helpfulCount: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

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
        containsSpoilers: r.containsSpoilers,
        helpfulCount: r.helpfulCount,
        votedHelpful: currentUserId
          ? (r.helpfulVotes as any[])?.length > 0
          : false,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;

  if (!rateLimit(`review:${userId}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { itemId, text, containsSpoilers } = body;

  if (!itemId || typeof itemId !== "number") {
    return NextResponse.json({ error: "Valid itemId required" }, { status: 400 });
  }

  const textResult = validateReviewText(text || "");
  if (!textResult.valid) {
    return NextResponse.json({ error: textResult.error }, { status: 400 });
  }

  try {
    const rating = await prisma.rating.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (!rating) {
      return NextResponse.json({ error: "You must rate this item before reviewing" }, { status: 400 });
    }

    // Upsert review
    const review = await prisma.review.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: {
        text: textResult.value,
        containsSpoilers: !!containsSpoilers,
      },
      create: {
        userId,
        itemId,
        text: textResult.value,
        containsSpoilers: !!containsSpoilers,
      },
    });

    // Auto-add to library as "completed" if not already tracked
    const existing = await prisma.libraryEntry.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (!existing) {
      await prisma.libraryEntry.create({
        data: { userId, itemId, status: "completed" },
      });
    }

    return NextResponse.json({ id: review.id });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { reviewId } = body;
  if (!reviewId || typeof reviewId !== "number") {
    return NextResponse.json({ error: "Valid reviewId required" }, { status: 400 });
  }

  try {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review || review.userId !== userId) {
      return NextResponse.json({ error: "Not found or not yours" }, { status: 404 });
    }

    await prisma.review.delete({ where: { id: reviewId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
