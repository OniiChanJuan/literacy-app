import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateReviewText, rateLimit } from "@/lib/validation";

/**
 * GET /api/reviews?itemId=123&sort=helpful&offset=0&limit=10
 * Fetches paginated reviews for an item.
 */
export async function GET(req: NextRequest) {
  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const sort = req.nextUrl.searchParams.get("sort") || "helpful";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "10"), 50);
  const offset = Math.max(parseInt(req.nextUrl.searchParams.get("offset") || "0"), 0);

  const session = await auth();
  const currentUserId = session?.user?.id || null;

  try {
    const orderBy: any[] =
      sort === "newest"
        ? [{ createdAt: "desc" }]
        : sort === "oldest"
          ? [{ createdAt: "asc" }]
          : [{ helpfulCount: "desc" }, { createdAt: "desc" }];

    const [reviews, totalCount] = await Promise.all([
      prisma.review.findMany({
        where: { itemId },
        include: {
          user: { select: { id: true, name: true, image: true, avatar: true } },
          ...(currentUserId
            ? { helpfulVotes: { where: { userId: currentUserId }, select: { userId: true } } }
            : {}),
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      prisma.review.count({ where: { itemId } }),
    ]);

    // Fetch ratings for all review authors
    const userIds = reviews.map((r) => r.userId);
    const ratings = userIds.length > 0
      ? await prisma.rating.findMany({
          where: { itemId, userId: { in: userIds } },
        })
      : [];
    const ratingMap = new Map(ratings.map((r) => [r.userId, r]));

    const result = reviews.map((r) => {
      const rating = ratingMap.get(r.userId);
      const votes = (r as any).helpfulVotes;
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
        votedHelpful: currentUserId && votes ? votes.length > 0 : false,
        isAuthor: currentUserId === r.userId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      reviews: result,
      hasMore: offset + limit < totalCount,
      totalCount,
    });
  } catch (e) {
    console.error("GET /api/reviews error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/**
 * POST /api/reviews — create a new review
 */
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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
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
    // Check item exists
    const item = await prisma.item.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Check rating exists — must rate before reviewing
    const rating = await prisma.rating.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (!rating) {
      return NextResponse.json({ error: "You must rate this item before reviewing" }, { status: 400 });
    }

    // Check if user already has a review
    const existing = await prisma.review.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You already reviewed this item. Use edit to update." },
        { status: 409 }
      );
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        userId,
        itemId,
        text: textResult.value,
        containsSpoilers: !!containsSpoilers,
      },
      include: {
        user: { select: { id: true, name: true, image: true, avatar: true } },
      },
    });

    // Auto-add to library as "completed" if not already tracked
    const libraryEntry = await prisma.libraryEntry.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (!libraryEntry) {
      await prisma.libraryEntry.create({
        data: { userId, itemId, status: "completed" },
      }).catch(() => {});
    }

    return NextResponse.json({
      id: review.id,
      userId: review.userId,
      userName: review.user.name || "Anonymous",
      userAvatar: review.user.image || review.user.avatar || "",
      score: rating.score,
      recommendTag: rating.recommendTag,
      text: review.text,
      containsSpoilers: review.containsSpoilers,
      helpfulCount: 0,
      votedHelpful: false,
      isAuthor: true,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    });
  } catch (e) {
    console.error("POST /api/reviews error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
