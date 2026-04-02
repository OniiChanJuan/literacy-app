import { NextRequest, NextResponse } from "next/server";
import { getSpotifyAlbumDetails, getSpotifyShowDetails } from "@/lib/spotify";
import { rateLimit } from "@/lib/validation";

// GET /api/spotify/album/{id} or /api/spotify/show/{id}
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; spotifyId: string }> }
) {
  const ip = _req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`spotify:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { type, spotifyId } = await params;

  if (type !== "album" && type !== "show") {
    return NextResponse.json({ error: "Type must be album or show" }, { status: 400 });
  }

  const item = type === "album"
    ? await getSpotifyAlbumDetails(spotifyId)
    : await getSpotifyShowDetails(spotifyId);

  if (!item) {
    return NextResponse.json({ error: "Not found on Spotify" }, { status: 404 });
  }

  const res = NextResponse.json(item);
  // Spotify metadata is stable per ID — cache aggressively at CDN
  res.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res;
}
