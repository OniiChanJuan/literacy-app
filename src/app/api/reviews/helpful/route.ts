import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

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

  const { reviewId } = body;
  if (!reviewId || typeof reviewId !== "number") {
    return NextResponse.json({ error: "Valid reviewId required" }, { status: 400 });
  }

  try {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { item: { select: { title: true } } },
    });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    if (review.userId === userId) {
      return NextResponse.json({ error: "Cannot vote on your own review" }, { status: 400 });
    }

    // Toggle vote
    const existing = await prisma.reviewHelpfulVote.findUnique({
      where: { userId_reviewId: { userId, reviewId } },
    });

    if (existing) {
      // Remove vote
      await prisma.$transaction([
        prisma.reviewHelpfulVote.delete({
          where: { userId_reviewId: { userId, reviewId } },
        }),
        prisma.review.update({
          where: { id: reviewId },
          data: { helpfulCount: { decrement: 1 } },
        }),
      ]);
      return NextResponse.json({ voted: false });
    } else {
      // Add vote
      await prisma.$transaction([
        prisma.reviewHelpfulVote.create({
          data: { userId, reviewId },
        }),
        prisma.review.update({
          where: { id: reviewId },
          data: { helpfulCount: { increment: 1 } },
        }),
      ]);

      // Create notification for the review author (batched message)
      if (review.userId !== userId) {
        const itemTitle = review.item?.title || "an item";
        // Check for existing unread helpful notification for this review
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
          }).catch(() => {}); // Non-critical
        }
      }

      return NextResponse.json({ voted: true });
    }
  } catch (e) {
    console.error("POST /api/reviews/helpful error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
