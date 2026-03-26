import { NextRequest, NextResponse } from "next/server";
import { fetchAllUpcoming, fetchReturningSoon } from "@/lib/upcoming";
import { rateLimit } from "@/lib/validation";

// GET /api/upcoming — fetch upcoming items + returning soon shows
// Cached for 1 hour to avoid hammering APIs
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`upcoming:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const [upcoming, returningSoon] = await Promise.all([
    fetchAllUpcoming(),
    fetchReturningSoon(),
  ]);

  return NextResponse.json({ upcoming, returningSoon }, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
    },
  });
}
