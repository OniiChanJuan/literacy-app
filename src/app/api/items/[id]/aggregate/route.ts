import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/items/[id]/aggregate — compute aggregate rating data
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = parseInt(id);
  if (!itemId) {
    return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
  }

  const ratings = await prisma.rating.findMany({
    where: { itemId },
  });

  if (ratings.length === 0) {
    return NextResponse.json({
      avg: "0.0",
      count: 0,
      dist: [0, 0, 0, 0, 0],
      recPct: 0,
    });
  }

  // Compute average
  const sum = ratings.reduce((acc, r) => acc + r.score, 0);
  const avg = (sum / ratings.length).toFixed(1);

  // Distribution (index 0 = 1 star, index 4 = 5 stars)
  const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of ratings) {
    if (r.score >= 1 && r.score <= 5) {
      dist[r.score - 1]++;
    }
  }

  // Recommend percentage
  const recCount = ratings.filter((r) => r.recommendTag === "recommend").length;
  const recPct = Math.round((recCount / ratings.length) * 100);

  return NextResponse.json({
    avg,
    count: ratings.length,
    dist,
    recPct,
  });
}
