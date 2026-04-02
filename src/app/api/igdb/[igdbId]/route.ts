import { NextRequest, NextResponse } from "next/server";
import { getIgdbDetails } from "@/lib/igdb";
import { rateLimit } from "@/lib/validation";

// GET /api/igdb/12345 — fetch full IGDB game details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ igdbId: string }> }
) {
  const ip = _req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`igdb:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { igdbId } = await params;
  const id = parseInt(igdbId);
  if (!id) {
    return NextResponse.json({ error: "Invalid IGDB ID" }, { status: 400 });
  }

  const item = await getIgdbDetails(id);
  if (!item) {
    return NextResponse.json({ error: "Not found on IGDB" }, { status: 404 });
  }

  const res = NextResponse.json(item);
  // IGDB game metadata is immutable per ID — cache aggressively at CDN
  res.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res;
}
