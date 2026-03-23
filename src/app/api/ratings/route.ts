import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEMO_USER_ID } from "@/lib/constants";

// GET /api/ratings — fetch all ratings for demo user
export async function GET() {
  const rows = await prisma.rating.findMany({
    where: { userId: DEMO_USER_ID },
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
    // Delete rating
    await prisma.rating.deleteMany({
      where: { userId: DEMO_USER_ID, itemId },
    });
    return NextResponse.json({ deleted: true });
  }

  // Upsert rating
  const rating = await prisma.rating.upsert({
    where: { userId_itemId: { userId: DEMO_USER_ID, itemId } },
    update: { score, recommendTag: recTag ?? null },
    create: { userId: DEMO_USER_ID, itemId, score, recommendTag: recTag ?? null },
  });

  return NextResponse.json(rating);
}
