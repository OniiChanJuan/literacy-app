import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

const VALID_REASONS = ["spam", "harassment", "hate_speech", "spoilers", "other"];

/**
 * POST /api/reports — Report a review for moderation
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Rate limit: 10 reports per hour per user
  if (!rateLimit(`report:${session.user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many reports. Try again later." }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { reviewId, reason, details } = body;

  if (!reviewId || typeof reviewId !== "number") {
    return NextResponse.json({ error: "reviewId required" }, { status: 400 });
  }
  if (!reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Valid reason required" }, { status: 400 });
  }

  // Check review exists
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { userId: true } });
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  // Can't report your own review
  if (review.userId === session.user.id) {
    return NextResponse.json({ error: "Cannot report your own review" }, { status: 400 });
  }

  // Check for duplicate report
  const existing = await prisma.report.findFirst({
    where: { reporterUserId: session.user.id, reviewId },
  });
  if (existing) {
    return NextResponse.json({ error: "You have already reported this review" }, { status: 409 });
  }

  await prisma.report.create({
    data: {
      reporterUserId: session.user.id,
      reviewId,
      reason,
      details: typeof details === "string" ? details.slice(0, 500) : "",
    },
  });

  return NextResponse.json({ ok: true });
}
