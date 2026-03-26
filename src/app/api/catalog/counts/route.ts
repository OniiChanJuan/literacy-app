import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * GET /api/catalog/counts — Get item counts by type, genre, and vibe.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`catalog-counts:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  try {
    // Count by type
    const typeCounts = await prisma.item.groupBy({
      by: ["type"],
      where: { isUpcoming: false, parentItemId: null },
      _count: true,
    });

    const byType: Record<string, number> = {};
    for (const t of typeCounts) byType[t.type] = t._count;

    // Total count
    const total = await prisma.item.count({ where: { isUpcoming: false, parentItemId: null } });

    return NextResponse.json({ byType, total });
  } catch (error: any) {
    console.error("Counts API error:", error);
    return NextResponse.json({ byType: {}, total: 0 }, { status: 500 });
  }
}
