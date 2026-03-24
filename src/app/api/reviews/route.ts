import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateReviewText, rateLimit } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  try {
    const reviews = await prisma.review.findMany({
      where: { itemId },
      include: {
        user: { select: { id: true, name: true, image: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50, // Paginate — don't load all reviews at once
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
        helpfulCount: r.helpfulCount,
        createdAt: r.createdAt.toISOString(),
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

  // Rate limit: 30 reviews per minute per user
  if (!rateLimit(`review:${userId}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { itemId, text } = body;

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

    const existing = await prisma.review.findFirst({
      where: { userId, itemId },
    });

    let review;
    if (existing) {
      review = await prisma.review.update({
        where: { id: existing.id },
        data: { text: textResult.value },
      });
    } else {
      review = await prisma.review.create({
        data: { userId, itemId, text: textResult.value },
      });
    }

    return NextResponse.json({ id: review.id }, { status: existing ? 200 : 201 });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
