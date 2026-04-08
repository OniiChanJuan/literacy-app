import { NextRequest, NextResponse } from "next/server";
import { getClaims } from "@/lib/supabase/auth";
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

  const claims = await getClaims();
  const stats = await getStats(franchiseId);

  let userRating: number | null = null;
  if (claims?.sub) {
    const row = await prisma.franchiseRating.findUnique({
      where: { userId_franchiseId: { userId: claims.sub, franchiseId } },
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
  const claims = await getClaims();
  if (!claims?.sub) {
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
    where: { userId_franchiseId: { userId: claims.sub, franchiseId } },
    create: { userId: claims.sub, franchiseId, rating },
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
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { franchiseId: fIdStr } = await params;
  const franchiseId = parseInt(fIdStr);
  if (!franchiseId) return NextResponse.json({ error: "Invalid franchise ID" }, { status: 400 });

  await prisma.franchiseRating.deleteMany({
    where: { userId: claims.sub, franchiseId },
  });

  const stats = await getStats(franchiseId);
  return NextResponse.json({ userRating: null, ...stats });
}
