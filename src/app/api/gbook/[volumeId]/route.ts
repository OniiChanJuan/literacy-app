import { NextRequest, NextResponse } from "next/server";
import { getGoogleBookDetails } from "@/lib/google-books";
import { rateLimit } from "@/lib/validation";

// GET /api/gbook/{volumeId} — fetch full Google Books details
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ volumeId: string }> }
) {
  const ip = _req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`gbook:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

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
