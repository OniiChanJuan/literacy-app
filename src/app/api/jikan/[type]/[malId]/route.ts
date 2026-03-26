import { NextRequest, NextResponse } from "next/server";
import { getJikanMangaDetails, getJikanAnimeDetails } from "@/lib/jikan";
import { rateLimit } from "@/lib/validation";

// GET /api/jikan/manga/12345 or /api/jikan/anime/12345
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; malId: string }> }
) {
  const ip = _req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`jikan:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { type, malId } = await params;

  if (type !== "manga" && type !== "anime") {
    return NextResponse.json({ error: "Type must be manga or anime" }, { status: 400 });
  }

  const id = parseInt(malId);
  if (!id) {
    return NextResponse.json({ error: "Invalid MAL ID" }, { status: 400 });
  }

  const item = type === "manga"
    ? await getJikanMangaDetails(id)
    : await getJikanAnimeDetails(id);

  if (!item) {
    return NextResponse.json({ error: "Not found on Jikan/MAL" }, { status: 404 });
  }

  return NextResponse.json(item);
}
