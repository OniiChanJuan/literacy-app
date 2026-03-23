import { NextRequest, NextResponse } from "next/server";
import { getSpotifyAlbumDetails, getSpotifyShowDetails } from "@/lib/spotify";

// GET /api/spotify/album/{id} or /api/spotify/show/{id}
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; spotifyId: string }> }
) {
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

  return NextResponse.json(item);
}
