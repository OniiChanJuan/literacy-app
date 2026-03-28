import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";
import { normalizeScore, meetsQualityFloor, interleaveByType } from "@/lib/ranking";
import { tasteSimilarity, neutralDimensions, type TasteDimensions } from "@/lib/taste-dimensions";

const ITEM_SELECT = {
  id: true, title: true, type: true, genre: true, vibes: true,
  year: true, cover: true, description: true, people: true,
  awards: true, platforms: true, ext: true, totalEp: true,
  popularityScore: true, voteCount: true, itemDimensions: true,
} as const;

/**
 * GET /api/for-you — Personalized recommendations based on user's taste profile
 *
 * Without section param:
 *   Returns: { personalPicks: Item[], discoverAcrossMedia: Item[], tasteProfile }
 *   (legacy format for taste profile + initial preview)
 *
 * With section param (paginated):
 *   ?section=personalPicks&limit=20&offset=0
 *   ?section=discoverAcrossMedia&limit=20&offset=0
 *   Returns: Item[] (array, compatible with PaginatedRow)
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`for-you:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await auth();
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  if (!session?.user?.id) {
    if (section) return NextResponse.json([]);
    return NextResponse.json({ personalPicks: [], discoverAcrossMedia: [], tasteProfile: null });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tasteProfile: true },
    });

    const tasteProfile = (user?.tasteProfile as unknown as TasteDimensions) || null;
    if (!tasteProfile) {
      if (section) return NextResponse.json([]);
      return NextResponse.json({ personalPicks: [], discoverAcrossMedia: [], tasteProfile: null });
    }

    // Get user's rated items to exclude + learn preferred types
    const ratings = await prisma.rating.findMany({
      where: { userId: session.user.id },
      select: { itemId: true, score: true, item: { select: { type: true } } },
    });

    const ratedIds = new Set(ratings.map((r) => r.itemId));
    const ratingCount = ratings.length;

    if (ratingCount < 5) {
      if (section) return NextResponse.json([]);
      return NextResponse.json({ personalPicks: [], discoverAcrossMedia: [], tasteProfile });
    }

    // Find user's most/least rated types
    const typeCounts: Record<string, number> = {};
    const highRatedTypes: Record<string, number> = {};
    for (const r of ratings) {
      typeCounts[r.item.type] = (typeCounts[r.item.type] || 0) + 1;
      if (r.score >= 4) {
        highRatedTypes[r.item.type] = (highRatedTypes[r.item.type] || 0) + 1;
      }
    }

    // Get dismissed items
    const dismissed = await prisma.dismissedItem.findMany({
      where: { userId: session.user.id },
      select: { itemId: true },
    });
    const dismissedIds = new Set(dismissed.map((d) => d.itemId));

    // Fetch candidate pool
    const candidates = await prisma.item.findMany({
      where: {
        isUpcoming: false,
        parentItemId: null,
      },
      select: ITEM_SELECT,
    });

    // Filter pool
    const pool = candidates.filter((c) => {
      if (ratedIds.has(c.id)) return false;
      if (dismissedIds.has(c.id)) return false;
      if (!c.cover || !c.cover.startsWith("http")) return false;
      if (!c.description || c.description.length < 20) return false;
      if (!meetsQualityFloor({ ...c, ext: (c.ext || {}) as Record<string, number> })) return false;
      return true;
    });

    // Score all candidates by taste similarity
    const scored = pool.map((c) => {
      const hasDimensions = !!(c.itemDimensions && Object.keys(c.itemDimensions as any).length > 0);
      let dimScore = 0;
      if (hasDimensions) {
        dimScore = tasteSimilarity(tasteProfile, c.itemDimensions as unknown as TasteDimensions);
      }

      const norm = normalizeScore(c.ext as any, c.type);
      const quality = norm > 0 ? norm : 0.5;

      // Items with no taste dimensions get a heavy penalty so genuine matches
      // surface first. Without dimensions, fall back to quality * 0.2 only.
      const score = hasDimensions ? (dimScore * 0.6 + quality * 0.4) : (quality * 0.2);
      return { item: c, score, dimScore };
    });

    scored.sort((a, b) => b.score - a.score);

    // ─── Section-based paginated response ───
    if (section === "personalPicks") {
      // Best taste matches across all types, tightened to 25% per type (max 5 for 20-item row)
      const personalPicks: any[] = [];
      const typeCountsPP: Record<string, number> = {};
      const maxPerType = Math.max(Math.ceil((offset + limit) * 0.25), 5);

      for (const s of scored) {
        const tc = typeCountsPP[s.item.type] || 0;
        if (tc >= maxPerType) continue;
        typeCountsPP[s.item.type] = tc + 1;
        personalPicks.push(s.item);
        if (personalPicks.length >= offset + limit) break;
      }

      const page = interleaveByType(personalPicks.slice(offset, offset + limit)).map(mapItem);
      const res = NextResponse.json(page);
      res.headers.set("Cache-Control", "private, s-maxage=0, max-age=60");
      return res;
    }

    if (section === "discoverAcrossMedia") {
      const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      // Collect from underexplored types, then fill with cross-type matches
      const allDiscover: any[] = [];
      const typeCountsDAM: Record<string, number> = {};
      const maxPerType = Math.max(Math.ceil((offset + limit) * 0.25), 6);

      // First pass: truly unexplored types
      for (const s of scored) {
        const typeRateCount = typeCounts[s.item.type] || 0;
        if (typeRateCount >= 3 || s.item.type === topType) continue;
        const tc = typeCountsDAM[s.item.type] || 0;
        if (tc >= maxPerType) continue;
        typeCountsDAM[s.item.type] = tc + 1;
        allDiscover.push(s.item);
        if (allDiscover.length >= offset + limit) break;
      }

      // Fill with cross-type high matches if not enough
      if (allDiscover.length < offset + limit) {
        const usedIds = new Set(allDiscover.map((i: any) => i.id));
        for (const s of scored) {
          if (usedIds.has(s.item.id)) continue;
          if (s.item.type === topType) continue;
          const tc = typeCountsDAM[s.item.type] || 0;
          if (tc >= maxPerType) continue;
          typeCountsDAM[s.item.type] = tc + 1;
          allDiscover.push(s.item);
          usedIds.add(s.item.id);
          if (allDiscover.length >= offset + limit) break;
        }
      }

      const page = allDiscover.slice(offset, offset + limit).map(mapItem);
      const res = NextResponse.json(page);
      res.headers.set("Cache-Control", "private, s-maxage=0, max-age=60");
      return res;
    }

    // ─── Legacy format: both sections + taste profile (no pagination) ───
    const usedIds = new Set<number>();
    const personalPicks: any[] = [];
    const typeCountsPP: Record<string, number> = {};
    const maxPerType = 5;

    for (const s of scored) {
      if (usedIds.has(s.item.id)) continue;
      const tc = typeCountsPP[s.item.type] || 0;
      if (tc >= maxPerType) continue;
      typeCountsPP[s.item.type] = tc + 1;
      personalPicks.push(s.item);
      usedIds.add(s.item.id);
      if (personalPicks.length >= 20) break;
    }

    // ─── Discover Across Media: types user hasn't explored much ───
    const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const unexplored = scored.filter((s) => {
      if (usedIds.has(s.item.id)) return false;
      // Prefer types user hasn't rated much
      const typeRateCount = typeCounts[s.item.type] || 0;
      return typeRateCount < 3 && s.item.type !== topType;
    });

    const discoverAcrossMedia: any[] = [];
    const typeCountsDAM: Record<string, number> = {};

    for (const s of unexplored) {
      const tc = typeCountsDAM[s.item.type] || 0;
      if (tc >= 4) continue;
      typeCountsDAM[s.item.type] = tc + 1;
      discoverAcrossMedia.push(s.item);
      usedIds.add(s.item.id);
      if (discoverAcrossMedia.length >= 15) break;
    }

    // If not enough from unexplored types, fill with high-match different types
    if (discoverAcrossMedia.length < 8) {
      for (const s of scored) {
        if (usedIds.has(s.item.id)) continue;
        if (s.item.type === topType) continue;
        const tc = typeCountsDAM[s.item.type] || 0;
        if (tc >= 4) continue;
        typeCountsDAM[s.item.type] = tc + 1;
        discoverAcrossMedia.push(s.item);
        usedIds.add(s.item.id);
        if (discoverAcrossMedia.length >= 15) break;
      }
    }

    const res = NextResponse.json({
      personalPicks: personalPicks.map(mapItem),
      discoverAcrossMedia: discoverAcrossMedia.map(mapItem),
      tasteProfile,
    });
    res.headers.set("Cache-Control", "private, s-maxage=0, max-age=60");
    return res;
  } catch (error: any) {
    console.error("For You API error:", error);
    if (section) return NextResponse.json([]);
    return NextResponse.json({ personalPicks: [], discoverAcrossMedia: [], tasteProfile: null });
  }
}

function mapItem(item: any) {
  return {
    id: item.id, title: item.title, type: item.type,
    genre: item.genre || [], vibes: item.vibes || [],
    year: item.year, cover: item.cover || "",
    desc: item.description || "", people: item.people || [],
    awards: item.awards || [], platforms: item.platforms || [],
    ext: item.ext || {}, totalEp: item.totalEp || 0,
    voteCount: item.voteCount || 0,
  };
}
