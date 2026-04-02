import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getStats(franchiseId: number) {
  const agg = await prisma.franchiseRating.aggregate({
    where: { franchiseId },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return {
    communityAverage: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
    totalVotes: agg._count.rating,
  };
}

/** GET /api/franchises/[franchiseId]/rate — return user's rating + community stats */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ franchiseId: string }> }
) {
  const { franchiseId: fIdStr } = await params;
  const franchiseId = parseInt(fIdStr);
  if (!franchiseId) return NextResponse.json({ error: "Invalid franchise ID" }, { status: 400 });

  const session = await auth();
  const stats = await getStats(franchiseId);

  let userRating: number | null = null;
  if (session?.user?.id) {
    const row = await prisma.franchiseRating.findUnique({
      where: { userId_franchiseId: { userId: session.user.id, franchiseId } },
      select: { rating: true },
    });
    userRating = row?.rating ?? null;
  }

  return NextResponse.json({ userRating, ...stats });
}

/** POST /api/franchises/[franchiseId]/rate — upsert rating (body: { rating: 1-5 }) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ franchiseId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { franchiseId: fIdStr } = await params;
  const franchiseId = parseInt(fIdStr);
  if (!franchiseId) return NextResponse.json({ error: "Invalid franchise ID" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const rating = parseInt(body.rating);
  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
  }

  await prisma.franchiseRating.upsert({
    where: { userId_franchiseId: { userId: session.user.id, franchiseId } },
    create: { userId: session.user.id, franchiseId, rating },
    update: { rating, updatedAt: new Date() },
  });

  const stats = await getStats(franchiseId);
  return NextResponse.json({ userRating: rating, ...stats });
}

/** DELETE /api/franchises/[franchiseId]/rate — remove user's rating */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ franchiseId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { franchiseId: fIdStr } = await params;
  const franchiseId = parseInt(fIdStr);
  if (!franchiseId) return NextResponse.json({ error: "Invalid franchise ID" }, { status: 400 });

  await prisma.franchiseRating.deleteMany({
    where: { userId: session.user.id, franchiseId },
  });

  const stats = await getStats(franchiseId);
  return NextResponse.json({ userRating: null, ...stats });
}
