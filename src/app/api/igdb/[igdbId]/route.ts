import { NextRequest, NextResponse } from "next/server";
import { getIgdbDetails } from "@/lib/igdb";

// GET /api/igdb/12345 — fetch full IGDB game details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ igdbId: string }> }
) {
  const { igdbId } = await params;
  const id = parseInt(igdbId);
  if (!id) {
    return NextResponse.json({ error: "Invalid IGDB ID" }, { status: 400 });
  }

  const item = await getIgdbDetails(id);
  if (!item) {
    return NextResponse.json({ error: "Not found on IGDB" }, { status: 404 });
  }

  return NextResponse.json(item);
}
