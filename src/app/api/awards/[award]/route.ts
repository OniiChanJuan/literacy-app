import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";
import { AWARDS } from "@/lib/awards";

// GET /api/awards/oscar — read-only browse endpoint for an award key.
// Returns every catalog item holding a relational Award row for the key,
// as slim card-shaped items plus their win details (category/year/result).
// Public catalog data; no auth. Cached like /api/catalog.

// Mirrors the catalog route's slim card projection (Card/HoverPreview needs).
const CARD_EXT_KEYS = [
  "imdb", "tmdb", "mal", "igdb", "igdb_critics", "google_books",
  "rt_critics", "metacritic", "pitchfork", "ign", "spotify_popularity",
  "aoty", "opencritic", "anilist",
  "steam", "steam_label",
  "igdb_count", "igdb_critics_count",
] as const;

function slimExt(ext: any): Record<string, number | string> {
  if (!ext || typeof ext !== "object") return {};
  const out: Record<string, number | string> = {};
  for (const k of CARD_EXT_KEYS) {
    if (ext[k] !== undefined && ext[k] !== null) out[k] = ext[k];
  }
  return out;
}

function truncateDesc(d: string | null | undefined): string {
  if (!d) return "";
  return d.length > 280 ? d.slice(0, 280).trimEnd() + "…" : d;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ award: string }> }
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!rateLimit(`awards:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { award } = await params;
  if (!AWARDS[award]) {
    return NextResponse.json({ error: "Unknown award" }, { status: 404 });
  }

  try {
    const rows = await prisma.award.findMany({
      where: { awardKey: award },
      orderBy: { year: "desc" },
      include: {
        item: {
          select: {
            id: true, title: true, type: true, genre: true, vibes: true,
            year: true, cover: true, description: true, people: true,
            awards: true, ext: true, totalEp: true, voteCount: true, malId: true,
          },
        },
      },
    });

    // Group award rows per item — one card per item, all its wins attached.
    const byItem = new Map<number, { item: any; wins: { category: string; year: number; result: string }[] }>();
    for (const r of rows) {
      if (!r.item) continue;
      if (!byItem.has(r.itemId)) byItem.set(r.itemId, { item: r.item, wins: [] });
      byItem.get(r.itemId)!.wins.push({ category: r.category, year: r.year, result: r.result });
    }

    const winners = [...byItem.values()].map(({ item, wins }) => ({
      id: item.id, title: item.title, type: item.type,
      genre: item.genre || [], vibes: item.vibes || [],
      year: item.year, cover: item.cover || "",
      desc: truncateDesc(item.description),
      people: (item.people || []).slice(0, 3),
      awards: Array.isArray(item.awards) ? item.awards : [], platforms: [],
      ext: slimExt(item.ext), totalEp: item.totalEp || 0,
      voteCount: item.voteCount || 0,
      malId: item.malId ?? null,
      wins: wins.sort((a, b) => b.year - a.year),
    }));

    const res = NextResponse.json({ winners });
    res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (error) {
    console.error("Awards API error:", error);
    return NextResponse.json({ error: "Failed to fetch award winners" }, { status: 500 });
  }
}
