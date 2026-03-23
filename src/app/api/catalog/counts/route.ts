import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/catalog/counts — Get item counts by type, genre, and vibe.
 */
export async function GET() {
  try {
    // Count by type
    const typeCounts = await prisma.item.groupBy({
      by: ["type"],
      where: { isUpcoming: false },
      _count: true,
    });

    const byType: Record<string, number> = {};
    for (const t of typeCounts) byType[t.type] = t._count;

    // Total count
    const total = await prisma.item.count({ where: { isUpcoming: false } });

    return NextResponse.json({ byType, total });
  } catch (error: any) {
    console.error("Counts API error:", error);
    return NextResponse.json({ byType: {}, total: 0 }, { status: 500 });
  }
}
