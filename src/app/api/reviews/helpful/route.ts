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
    // Check review exists and user isn't voting on own review
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
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
      return NextResponse.json({ voted: true });
    }
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
