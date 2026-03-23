import { NextRequest, NextResponse } from "next/server";
import { getGoogleBookDetails } from "@/lib/google-books";

// GET /api/gbook/{volumeId} — fetch full Google Books details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ volumeId: string }> }
) {
  const { volumeId } = await params;
  if (!volumeId) {
    return NextResponse.json({ error: "Invalid volume ID" }, { status: 400 });
  }

  const item = await getGoogleBookDetails(volumeId);
  if (!item) {
    return NextResponse.json({ error: "Not found on Google Books" }, { status: 404 });
  }

  return NextResponse.json(item);
}
