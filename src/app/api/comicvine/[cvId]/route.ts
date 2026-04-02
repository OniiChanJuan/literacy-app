import { NextRequest, NextResponse } from "next/server";
import { getComicVineDetails } from "@/lib/comicvine";
import { rateLimit } from "@/lib/validation";

// GET /api/comicvine/12345 — fetch full Comic Vine volume details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cvId: string }> }
) {
  const ip = _req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`comicvine:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { cvId } = await params;
  const id = parseInt(cvId);
  if (!id) {
    return NextResponse.json({ error: "Invalid Comic Vine ID" }, { status: 400 });
  }

  const item = await getComicVineDetails(id);
  if (!item) {
    return NextResponse.json({ error: "Not found on Comic Vine" }, { status: 404 });
  }

  const res = NextResponse.json(item);
  // Comic Vine metadata is stable per ID — cache aggressively at CDN
  res.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res;
}
