import { NextResponse } from "next/server";
import { fetchAllUpcoming, fetchReturningSoon } from "@/lib/upcoming";

// GET /api/upcoming — fetch upcoming items + returning soon shows
// Cached for 1 hour to avoid hammering APIs
export async function GET() {
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
