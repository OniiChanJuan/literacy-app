import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateReviewText, rateLimit } from "@/lib/validation";

/**
 * Build a review tree from a flat list.
 * Top-level reviews (parentId=null) contain nested replies.
 */
function buildTree(flat: any[]): any[] {
  const map = new Map<number, any>();
  for (const r of flat) {
    map.set(r.id, { ...r, replies: [] });
  }
  const roots: any[] = [];
  for (const r of map.values()) {
    if (r.parentId === null) {
      roots.push(r);
    } else {
      const parent = map.get(r.parentId);
      if (parent) parent.replies.push(r);
    }
  }
  return roots;
}

/**
 * GET /api/reviews?itemId=123&sort=top&offset=0&limit=10
 * Returns threaded reviews (top-level with nested replies).
 * sort: top | recent | controversial
 */
export async function GET(req: NextRequest) {
  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const sort = req.nextUrl.searchParams.get("sort") || "top";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "10"), 50);
  const offset = Math.max(parseInt(req.nextUrl.searchParams.get("offset") || "0"), 0);

  const session = await auth();
  const currentUserId = session?.user?.id || null;

  try {
    // Fetch all reviews for item (flat), then build tree in JS.
    // Works well for <200 reviews per item.
    const allReviews = await prisma.review.findMany({
      where: { itemId },
      include: {
        user: { select: { id: true, name: true, image: true, avatar: true, memberNumber: true } },
        ...(currentUserId
          ? { helpfulVotes: { where: { userId: currentUserId }, select: { userId: true, voteType: true } } }
          : {}),
      },
      orderBy: { createdAt: "asc" }, // stable base order for tree building
    });

    // Fetch ratings for all review authors
    const userIds = [...new Set(allReviews.map((r) => r.userId))];
    const ratings = userIds.length > 0
      ? await prisma.rating.findMany({
          where: { itemId, userId: { in: userIds } },
        })
      : [];
    const ratingMap = new Map(ratings.map((r) => [r.userId, r]));

    // Shape each review
    const shaped = allReviews.map((r) => {
      const rating = ratingMap.get(r.userId);
      const votes = (r as any).helpfulVotes as { userId: string; voteType: string }[] | undefined;
      const myVote = votes && votes.length > 0 ? votes[0].voteType : null; // "up" | "down" | null
      return {
        id: r.id,
        userId: r.userId,
        parentId: r.parentId,
        depth: r.depth,
        userName: r.user.name || "Anonymous",
        userAvatar: r.user.image || r.user.avatar || "",
        memberNumber: (r.user as any).memberNumber ?? null,
        score: rating?.score ?? 0,
        recommendTag: rating?.recommendTag ?? null,
        text: r.text,
        containsSpoilers: r.containsSpoilers,
        helpfulCount: r.helpfulCount,
        voteScore: r.voteScore,
        myVote,
        votedHelpful: myVote === "up", // backward compat
        isAuthor: currentUserId === r.userId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        replies: [] as any[],
      };
    });

    // Build tree
    const tree = buildTree(shaped);

    // Sort top-level reviews
    const topLevel = tree;
    if (sort === "recent") {
      topLevel.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === "controversial") {
      // High vote activity but low net score = controversial
      topLevel.sort((a, b) => {
        const aActivity = Math.abs(a.voteScore) + a.replies.length;
        const bActivity = Math.abs(b.voteScore) + b.replies.length;
        return bActivity - aActivity;
      });
    } else {
      // top: sort by voteScore desc, then createdAt desc
      topLevel.sort((a, b) => b.voteScore - a.voteScore || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // Paginate top-level reviews only
    const totalCount = topLevel.length;
    const paginated = topLevel.slice(offset, offset + limit);

    return NextResponse.json({
      reviews: paginated,
      hasMore: offset + limit < totalCount,
      totalCount,
    });
  } catch (e) {
    console.error("GET /api/reviews error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/**
 * POST /api/reviews — create a new review or reply
 * Body: { itemId, text, containsSpoilers, parentId? }
 * - parentId omitted → top-level review (one per user per item)
 * - parentId set → reply (multiple allowed per user)
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

  const { itemId, text, containsSpoilers, parentId } = body;

  if (!itemId || typeof itemId !== "number") {
    return NextResponse.json({ error: "Valid itemId required" }, { status: 400 });
  }

  const textResult = validateReviewText(text || "");
  if (!textResult.valid) {
    return NextResponse.json({ error: textResult.error }, { status: 400 });
  }

  const isReply = parentId != null;

  try {
    // Check item exists
    const item = await prisma.item.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Check rating exists for top-level reviews only
    if (!isReply) {
      const rating = await prisma.rating.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (!rating) {
        return NextResponse.json({ error: "You must rate this item before reviewing" }, { status: 400 });
      }

      // Check if user already has a top-level review for this item
      const existing = await prisma.review.findFirst({
        where: { userId, itemId, parentId: null },
      });
      if (existing) {
        return NextResponse.json(
          { error: "You already reviewed this item. Use edit to update." },
          { status: 409 }
        );
      }
    }

    // Validate parentId and compute depth
    let depth = 0;
    if (isReply) {
      const parent = await prisma.review.findUnique({
        where: { id: parentId },
        select: { id: true, itemId: true, depth: true, userId: true },
      });
      if (!parent || parent.itemId !== itemId) {
        return NextResponse.json({ error: "Parent review not found" }, { status: 404 });
      }
      if (parent.depth >= 3) {
        return NextResponse.json({ error: "Maximum reply depth reached" }, { status: 400 });
      }
      depth = parent.depth + 1;
    }

    // Create review or reply
    const review = await prisma.review.create({
      data: {
        userId,
        itemId,
        parentId: isReply ? parentId : null,
        depth,
        text: textResult.value,
        containsSpoilers: !!containsSpoilers,
      },
      include: {
        user: { select: { id: true, name: true, image: true, avatar: true, memberNumber: true } },
      },
    });

    // Auto-add to library for top-level reviews
    if (!isReply) {
      const libraryEntry = await prisma.libraryEntry.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (!libraryEntry) {
        await prisma.libraryEntry.create({
          data: { userId, itemId, status: "completed" },
        }).catch(() => {});
      }
    }

    // Notify parent review author of the reply
    if (isReply && parentId) {
      const parent = await prisma.review.findUnique({
        where: { id: parentId },
        select: { userId: true, item: { select: { title: true } } },
      });
      if (parent && parent.userId !== userId) {
        await prisma.notification.create({
          data: {
            userId: parent.userId,
            type: "review_reply",
            message: `Someone replied to your review of ${parent.item?.title || "an item"}`,
          },
        }).catch(() => {});
      }
    }

    // Get rating for response
    const rating = isReply ? null : await prisma.rating.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });

    return NextResponse.json({
      id: review.id,
      userId: review.userId,
      parentId: review.parentId,
      depth: review.depth,
      userName: review.user.name || "Anonymous",
      userAvatar: review.user.image || review.user.avatar || "",
      memberNumber: (review.user as any).memberNumber ?? null,
      score: rating?.score ?? 0,
      recommendTag: rating?.recommendTag ?? null,
      text: review.text,
      containsSpoilers: review.containsSpoilers,
      helpfulCount: 0,
      voteScore: 0,
      myVote: null,
      votedHelpful: false,
      isAuthor: true,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      replies: [],
    });
  } catch (e) {
    console.error("POST /api/reviews error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
