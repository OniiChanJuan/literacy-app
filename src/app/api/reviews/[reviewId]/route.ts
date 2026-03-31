import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateReviewText, rateLimit } from "@/lib/validation";

/**
 * PUT /api/reviews/[reviewId] — edit a review (author only)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`review-edit:${session.user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { reviewId: rid } = await params;
  const reviewId = parseInt(rid);
  if (!reviewId) {
    return NextResponse.json({ error: "Valid reviewId required" }, { status: 400 });
  }

  const userId = session.user.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { text, containsSpoilers } = body;

  const textResult = validateReviewText(text || "");
  if (!textResult.valid) {
    return NextResponse.json({ error: textResult.error }, { status: 400 });
  }

  try {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    if (review.userId !== userId) {
      return NextResponse.json({ error: "Not your review" }, { status: 403 });
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: {
        text: textResult.value,
        containsSpoilers: containsSpoilers !== undefined ? !!containsSpoilers : review.containsSpoilers,
        updatedAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, image: true, avatar: true } },
      },
    });

    // Get rating for response
    const rating = await prisma.rating.findUnique({
      where: { userId_itemId: { userId, itemId: review.itemId } },
    });

    return NextResponse.json({
      id: updated.id,
      userId: updated.userId,
      parentId: updated.parentId,
      depth: updated.depth,
      userName: updated.user.name || "Anonymous",
      userAvatar: updated.user.image || updated.user.avatar || "",
      score: rating?.score ?? 0,
      recommendTag: rating?.recommendTag ?? null,
      text: updated.text,
      containsSpoilers: updated.containsSpoilers,
      helpfulCount: updated.helpfulCount,
      voteScore: updated.voteScore,
      myVote: null,
      votedHelpful: false,
      isAuthor: true,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      replies: [],
    });
  } catch (e) {
    console.error("PUT /api/reviews/[reviewId] error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/**
 * DELETE /api/reviews/[reviewId] — delete a review (author only)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`review-delete:${session.user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { reviewId: rid } = await params;
  const reviewId = parseInt(rid);
  if (!reviewId) {
    return NextResponse.json({ error: "Valid reviewId required" }, { status: 400 });
  }

  const userId = session.user.id;

  try {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    if (review.userId !== userId) {
      return NextResponse.json({ error: "Not your review" }, { status: 403 });
    }

    // Delete helpful votes first, then the review
    await prisma.$transaction([
      prisma.reviewHelpfulVote.deleteMany({ where: { reviewId } }),
      prisma.report.deleteMany({ where: { reviewId } }),
      prisma.review.delete({ where: { id: reviewId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/reviews/[reviewId] error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
