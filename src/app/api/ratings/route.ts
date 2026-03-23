import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/ratings — fetch all ratings for authenticated user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ratings: {}, recTags: {} });
  }

  const rows = await prisma.rating.findMany({
    where: { userId: session.user.id },
  });

  const ratings: Record<number, number> = {};
  const recTags: Record<number, string | null> = {};

  for (const r of rows) {
    ratings[r.itemId] = r.score;
    recTags[r.itemId] = r.recommendTag;
  }

  return NextResponse.json({ ratings, recTags });
}

// PUT /api/ratings — upsert or delete a rating
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json();
  const { itemId, score, recTag } = body as {
    itemId: number;
    score: number;
    recTag: string | null;
  };

  if (!itemId || typeof score !== "number") {
    return NextResponse.json({ error: "itemId and score required" }, { status: 400 });
  }

  if (score === 0) {
    await prisma.rating.deleteMany({
      where: { userId, itemId },
    });
    return NextResponse.json({ deleted: true });
  }

  const rating = await prisma.rating.upsert({
    where: { userId_itemId: { userId, itemId } },
    update: { score, recommendTag: recTag ?? null },
    create: { userId, itemId, score, recommendTag: recTag ?? null },
  });

  return NextResponse.json(rating);
}
