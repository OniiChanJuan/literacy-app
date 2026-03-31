import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/reviews/helpful
 * Up/down vote a review.
 * Body: { reviewId: number, voteType: "up" | "down" }
 * - If no existing vote: create vote, update voteScore
 * - If same vote exists: remove vote (toggle off), update voteScore
 * - If opposite vote exists: switch vote type, update voteScore by 2
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;

  if (!rateLimit(`helpful:${userId}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { reviewId, voteType } = body;
  if (!reviewId || typeof reviewId !== "number") {
    return NextResponse.json({ error: "Valid reviewId required" }, { status: 400 });
  }
  if (voteType !== "up" && voteType !== "down") {
    return NextResponse.json({ error: "voteType must be 'up' or 'down'" }, { status: 400 });
  }

  try {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, userId: true, voteScore: true, item: { select: { title: true } } },
    });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    if (review.userId === userId) {
      return NextResponse.json({ error: "Cannot vote on your own review" }, { status: 400 });
    }

    const existing = await prisma.reviewHelpfulVote.findUnique({
      where: { userId_reviewId: { userId, reviewId } },
    });

    if (!existing) {
      // No vote yet — create new vote
      const delta = voteType === "up" ? 1 : -1;
      await prisma.$transaction([
        prisma.reviewHelpfulVote.create({
          data: { userId, reviewId, voteType },
        }),
        prisma.review.update({
          where: { id: reviewId },
          data: {
            voteScore: { increment: delta },
            ...(voteType === "up" ? { helpfulCount: { increment: 1 } } : {}),
          },
        }),
      ]);
      return NextResponse.json({ myVote: voteType, voteScore: review.voteScore + delta });

    } else if (existing.voteType === voteType) {
      // Same vote — toggle off (remove)
      const delta = voteType === "up" ? -1 : 1;
      await prisma.$transaction([
        prisma.reviewHelpfulVote.delete({
          where: { userId_reviewId: { userId, reviewId } },
        }),
        prisma.review.update({
          where: { id: reviewId },
          data: {
            voteScore: { increment: delta },
            ...(voteType === "up" ? { helpfulCount: { decrement: 1 } } : {}),
          },
        }),
      ]);
      return NextResponse.json({ myVote: null, voteScore: review.voteScore + delta });

    } else {
      // Opposite vote — switch direction (delta = ±2)
      const delta = voteType === "up" ? 2 : -2;
      await prisma.$transaction([
        prisma.reviewHelpfulVote.update({
          where: { userId_reviewId: { userId, reviewId } },
          data: { voteType },
        }),
        prisma.review.update({
          where: { id: reviewId },
          data: {
            voteScore: { increment: delta },
            // adjust helpfulCount: switching from down→up +1, up→down -1
            helpfulCount: voteType === "up" ? { increment: 1 } : { decrement: 1 },
          },
        }),
      ]);

      // Notify on upvote (not on downvote)
      if (voteType === "up") {
        const itemTitle = review.item?.title || "an item";
        const recentNotif = await prisma.notification.findFirst({
          where: {
            userId: review.userId,
            type: "review_helpful",
            read: false,
            message: { contains: `review of ${itemTitle}` },
          },
        });
        if (!recentNotif) {
          await prisma.notification.create({
            data: {
              userId: review.userId,
              type: "review_helpful",
              message: `Someone found your review of ${itemTitle} helpful`,
            },
          }).catch(() => {});
        }
      }

      return NextResponse.json({ myVote: voteType, voteScore: review.voteScore + delta });
    }
  } catch (e) {
    console.error("POST /api/reviews/helpful error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
