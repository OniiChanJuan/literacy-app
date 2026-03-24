import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isValidScore, isValidRecTag, rateLimit } from "@/lib/validation";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ratings: {}, recTags: {} });
  }

  try {
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
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;

  // Rate limit: 30 ratings per minute per user
  if (!rateLimit(`rate:${userId}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { itemId, score, recTag } = body;

  if (!itemId || typeof itemId !== "number") {
    return NextResponse.json({ error: "Valid itemId required" }, { status: 400 });
  }

  // Score 0 = delete rating
  if (score === 0) {
    try {
      await prisma.rating.deleteMany({ where: { userId, itemId } });
      return NextResponse.json({ deleted: true });
    } catch {
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  }

  if (!isValidScore(score)) {
    return NextResponse.json({ error: "Score must be an integer between 1 and 5" }, { status: 400 });
  }

  if (!isValidRecTag(recTag ?? null)) {
    return NextResponse.json({ error: "Invalid recommend tag" }, { status: 400 });
  }

  try {
    const rating = await prisma.rating.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: { score, recommendTag: recTag ?? null },
      create: { userId, itemId, score, recommendTag: recTag ?? null },
    });

    return NextResponse.json({ itemId: rating.itemId, score: rating.score });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
