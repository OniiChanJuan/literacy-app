import { NextRequest, NextResponse } from "next/server";
import { getTmdbDetails } from "@/lib/tmdb";

// GET /api/tmdb/movie/12345 or /api/tmdb/tv/12345
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; tmdbId: string }> }
) {
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

  return NextResponse.json(item);
}
