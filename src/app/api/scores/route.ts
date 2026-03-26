import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * GET /api/scores?itemId=123 — Get all external scores for an item
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`scores:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) return NextResponse.json([]);

  try {
    const scores = await prisma.externalScore.findMany({
      where: { itemId },
      orderBy: { source: "asc" },
    });

    const res = NextResponse.json(scores);
    res.headers.set("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res;
  } catch {
    return NextResponse.json([]);
  }
}
