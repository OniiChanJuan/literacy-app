import { NextRequest, NextResponse } from "next/server";
import { getTmdbDetails } from "@/lib/tmdb";
import { rateLimit } from "@/lib/validation";

// GET /api/tmdb/movie/12345 or /api/tmdb/tv/12345
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; tmdbId: string }> }
) {
  const ip = _req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`tmdb:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { type, tmdbId } = await params;

  if (type !== "movie" && type !== "tv") {
    return NextResponse.json({ error: "Type must be movie or tv" }, { status: 400 });
  }

  const id = parseInt(tmdbId);
  if (!id) {
    return NextResponse.json({ error: "Invalid TMDB ID" }, { status: 400 });
  }

  const item = await getTmdbDetails(type, id);
  if (!item) {
    return NextResponse.json({ error: "Not found on TMDB" }, { status: 404 });
  }

  const res = NextResponse.json(item);
  // TMDB metadata is immutable per ID — cache aggressively at CDN
  res.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res;
}
