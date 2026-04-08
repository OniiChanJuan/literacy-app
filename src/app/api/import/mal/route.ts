import { NextRequest, NextResponse } from "next/server";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/import/mal?username=xxx&type=anime|manga&offset=0
// Fetches a user's MAL list via Jikan API
export async function GET(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`import-mal:${claims.sub}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const type = searchParams.get("type") || "anime"; // anime or manga
  const page = parseInt(searchParams.get("page") || "1");

  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  if (type !== "anime" && type !== "manga") {
    return NextResponse.json({ error: "type must be anime or manga" }, { status: 400 });
  }

  try {
    // Use Jikan v4 API to get user's list
    const endpoint = type === "anime" ? "animelist" : "mangalist";
    const res = await fetch(
      `https://api.jikan.moe/v4/users/${encodeURIComponent(username)}/${endpoint}?page=${page}&limit=25`,
      { next: { revalidate: 0 } }
    );

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: "MAL user not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Failed to fetch MAL data" }, { status: 502 });
    }

    const data = await res.json();

    // Transform to our format
    const items = (data.data || []).map((entry: any) => ({
      node: {
        id: entry.mal_id,
        title: entry[type]?.title || entry.title || "",
        main_picture: entry[type]?.images?.jpg ? { medium: entry[type].images.jpg.image_url } : undefined,
        start_date: entry[type]?.aired?.from || entry[type]?.published?.from || "",
      },
      list_status: {
        status: entry.status?.toLowerCase().replace(/ /g, "_") || "completed",
        score: entry.score || 0,
        num_episodes_watched: entry.episodes_watched,
        num_chapters_read: entry.chapters_read,
        finish_date: entry.finish_date || null,
        updated_at: entry.updated_at || null,
      },
    }));

    return NextResponse.json({
      items,
      hasMore: data.pagination?.has_next_page || false,
      totalItems: data.pagination?.items?.total || items.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "MAL API error" }, { status: 502 });
  }
}
