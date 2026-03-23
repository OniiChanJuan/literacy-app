import { NextResponse } from "next/server";
import { fetchAllUpcoming } from "@/lib/upcoming";

// GET /api/upcoming — fetch upcoming items from all APIs
// Cached for 1 hour to avoid hammering APIs
export async function GET() {
  const items = await fetchAllUpcoming();
  return NextResponse.json(items, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
    },
  });
}
