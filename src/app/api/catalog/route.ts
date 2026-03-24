import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ITEM_SELECT = {
  id: true, title: true, type: true, genre: true, vibes: true,
  year: true, cover: true, description: true, people: true,
  awards: true, platforms: true, ext: true, totalEp: true,
  popularityScore: true, voteCount: true,
} as const;

// Minimum vote counts for curated rows (type-specific)
const MIN_VOTES: Record<string, number> = {
  movie: 500, tv: 500, game: 50, manga: 1000,
  book: 100, music: 40, comic: 20, podcast: 10,
};

// For "popular right now" — lower thresholds since recent items have fewer votes
const MIN_VOTES_RECENT: Record<string, number> = {
  movie: 100, tv: 100, game: 20, manga: 200,
  book: 20, music: 10, comic: 5, podcast: 5,
};

/**
 * GET /api/catalog — Fetch items with popularity filtering + deduplication
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const sort = searchParams.get("sort") || "recent";
  const genre = searchParams.get("genre");
  const vibe = searchParams.get("vibe");
  const curated = searchParams.get("curated");
  const excludeIds = searchParams.get("exclude")?.split(",").map(Number).filter(Boolean) || [];

  try {
    const where: any = { isUpcoming: false };
    if (type) where.type = type;
    if (genre) where.genre = { has: genre };
    if (vibe) where.vibes = { has: vibe };
    if (excludeIds.length > 0) where.id = { notIn: excludeIds };

    // ── Critically acclaimed ──────────────────────────────────────────
    if (curated === "top_rated") {
      const items = await prisma.item.findMany({
        where: { isUpcoming: false, voteCount: { gte: 50 }, id: excludeIds.length ? { notIn: excludeIds } : undefined },
        orderBy: { voteCount: "desc" },
        take: 500,
        select: ITEM_SELECT,
      });

      // Score: normalized score × log10(vote_count)
      const scored = items
        .filter(i => {
          const ext = i.ext as Record<string, number>;
          const vals = Object.values(ext);
          // Normalize to 0-10 scale
          const best = vals.length > 0 ? Math.max(...vals.map(v => {
            if (v <= 10) return v; // Already 0-10
            if (v <= 100) return v / 10; // 0-100 → 0-10
            return v / 100; // 0-1000 → 0-10
          })) : 0;
          return best >= 7.5; // Minimum 7.5/10 equivalent
        })
        .map(i => {
          const ext = i.ext as Record<string, number>;
          const vals = Object.values(ext);
          const best = vals.length > 0 ? Math.max(...vals.map(v => v <= 10 ? v : v <= 100 ? v / 10 : v / 100)) : 0;
          const compositeScore = best * Math.log10(Math.max(i.voteCount, 10));
          return { ...i, compositeScore };
        })
        .sort((a, b) => b.compositeScore - a.compositeScore);

      // Enforce max 30% per type
      const typeCounts = new Map<string, number>();
      const maxPerType = Math.ceil(limit * 0.3);
      const diverse = scored.filter(i => {
        const count = typeCounts.get(i.type) || 0;
        if (count >= maxPerType) return false;
        typeCounts.set(i.type, count + 1);
        return true;
      }).slice(offset, offset + limit);

      return jsonResponse(diverse.map(mapItem));
    }

    // ── Popular right now ─────────────────────────────────────────────
    if (curated === "popular") {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 18);
      const currentYear = new Date().getFullYear();

      const items = await prisma.item.findMany({
        where: {
          isUpcoming: false,
          year: { gte: currentYear - 2 },
          voteCount: { gte: 10 },
          id: excludeIds.length ? { notIn: excludeIds } : undefined,
        },
        orderBy: { popularityScore: "desc" },
        skip: offset,
        take: limit,
        select: ITEM_SELECT,
      });

      return jsonResponse(items.map(mapItem));
    }

    // ── Hidden gems ───────────────────────────────────────────────────
    if (curated === "hidden_gems") {
      const items = await prisma.item.findMany({
        where: {
          isUpcoming: false,
          voteCount: { gte: 10, lt: 5000 }, // Enough to be real but not mainstream
          id: excludeIds.length ? { notIn: excludeIds } : undefined,
        },
        orderBy: { year: "desc" },
        take: 500,
        select: ITEM_SELECT,
      });

      // Hidden gems: high score-to-popularity ratio
      const gems = items
        .filter(i => {
          const ext = i.ext as Record<string, number>;
          const vals = Object.values(ext);
          const best = vals.length > 0 ? Math.max(...vals.map(v => v <= 10 ? v : v <= 100 ? v / 10 : v / 100)) : 0;
          return best >= 7.5;
        })
        .map(i => {
          const ext = i.ext as Record<string, number>;
          const vals = Object.values(ext);
          const best = vals.length > 0 ? Math.max(...vals.map(v => v <= 10 ? v : v <= 100 ? v / 10 : v / 100)) : 0;
          // Higher score + lower vote count = more "hidden"
          const gemScore = best / Math.log10(Math.max(i.voteCount, 10));
          return { ...i, gemScore };
        })
        .sort((a, b) => b.gemScore - a.gemScore)
        .slice(offset, offset + limit);

      return jsonResponse(gems.map(mapItem));
    }

    // ── Standard type-filtered query with popularity ──────────────────
    let orderBy: any = { voteCount: "desc" }; // Default: most popular first
    if (sort === "title") orderBy = { title: "asc" };
    if (sort === "recent") orderBy = { year: "desc" };
    if (sort === "popular") orderBy = { popularityScore: "desc" };

    // For type rows, apply minimum vote threshold
    if (type && !genre && !vibe) {
      const minVotes = MIN_VOTES[type] || 10;
      // Use a lower threshold to ensure we have enough items
      where.voteCount = { gte: Math.min(minVotes, 10) };
      orderBy = [{ voteCount: "desc" }, { year: "desc" }];
    }

    const items = await prisma.item.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      select: ITEM_SELECT,
    });

    return jsonResponse(items.map(mapItem));
  } catch (error: any) {
    console.error("Catalog API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch catalog" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function jsonResponse(data: any) {
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res;
}

function mapItem(item: any) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    genre: item.genre || [],
    vibes: item.vibes || [],
    year: item.year,
    cover: item.cover || "",
    desc: item.description || "",
    people: item.people || [],
    awards: item.awards || [],
    platforms: item.platforms || [],
    ext: item.ext || {},
    totalEp: item.totalEp || 0,
  };
}
