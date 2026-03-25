import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { normalizeScore, meetsQualityFloor } from "@/lib/ranking";
import { tasteSimilarity, type TasteDimensions } from "@/lib/taste-dimensions";

/**
 * GET /api/recommendations?itemId=123
 * Returns 4 recommendation sections for a detail page:
 *   moreSameType, acrossMedia, fansAlsoLoved, hiddenGems
 *
 * Cached for 10 minutes (same for all users — not personalized yet).
 */
export async function GET(req: NextRequest) {
  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  try {
    // Fetch the source item
    const sourceItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true, title: true, type: true, genre: true, vibes: true,
        year: true, cover: true, description: true, ext: true, totalEp: true,
        voteCount: true, popularityScore: true, itemDimensions: true,
        parentItemId: true, people: true,
        franchiseItems: { select: { franchiseId: true } },
      },
    });

    if (!sourceItem) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const sourceDims = sourceItem.itemDimensions as TasteDimensions | null;
    const sourceFranchiseIds = sourceItem.franchiseItems.map((fi) => fi.franchiseId);
    const sourcePeople = (sourceItem.people as any[] || []);
    const sourceCreator = sourcePeople[0]?.name?.toLowerCase() || "";

    // Get user-specific exclusions (dropped items, low-rated, dismissed)
    const session = await auth();
    const excludeIds = new Set<number>();
    if (session?.user?.id) {
      const [lowRated, dropped, dismissed] = await Promise.all([
        prisma.rating.findMany({
          where: { userId: session.user.id, score: { lte: 2 } },
          select: { itemId: true },
        }),
        prisma.libraryEntry.findMany({
          where: { userId: session.user.id, status: "dropped" },
          select: { itemId: true },
        }),
        prisma.dismissedItem.findMany({
          where: { userId: session.user.id },
          select: { itemId: true },
        }),
      ]);
      for (const r of lowRated) excludeIds.add(r.itemId);
      for (const d of dropped) excludeIds.add(d.itemId);
      for (const d of dismissed) excludeIds.add(d.itemId);
    }

    // Fetch candidate pool — all eligible items (excluding DLC, upcoming, current item)
    const candidates = await prisma.item.findMany({
      where: {
        id: { not: itemId },
        parentItemId: null,
        isUpcoming: false,
      },
      select: {
        id: true, title: true, type: true, genre: true, vibes: true,
        year: true, cover: true, description: true, ext: true, totalEp: true,
        voteCount: true, popularityScore: true, itemDimensions: true,
        people: true,
        franchiseItems: { select: { franchiseId: true } },
      },
    });

    // Pre-filter: must have cover and description, exclude user negatives
    const pool = candidates.filter((c) => {
      if (!c.cover || !c.cover.startsWith("http")) return false;
      if (!c.description || c.description.length < 20) return false;
      if (excludeIds.has(c.id)) return false;
      return true;
    });

    // Track used item IDs across sections for deduplication
    const usedIds = new Set<number>();

    // ─── SECTION 1: More [Type] ──────────────────────────────────────
    const moreSameType = buildMoreSameType(sourceItem, pool, sourceDims, usedIds);

    // ─── SECTION 2: Across Media ─────────────────────────────────────
    const acrossMedia = buildAcrossMedia(sourceItem, pool, sourceDims, sourceFranchiseIds, usedIds);

    // ─── SECTION 3: Fans Also Loved ──────────────────────────────────
    const fansAlsoLoved = buildFansAlsoLoved(sourceItem, pool, sourceDims, sourceFranchiseIds, usedIds);

    // ─── SECTION 4: Hidden Gems ──────────────────────────────────────
    const hiddenGems = buildHiddenGems(sourceItem, pool, sourceDims, usedIds);

    const res = NextResponse.json({
      moreSameType: moreSameType.map(toClientItem),
      acrossMedia: acrossMedia.map(toClientItem),
      fansAlsoLoved: fansAlsoLoved.map(toClientItem),
      hiddenGems: hiddenGems.map(toClientItem),
    });
    // Cache publicly if no user session, privately otherwise
    if (session?.user?.id) {
      res.headers.set("Cache-Control", "private, max-age=120");
    } else {
      res.headers.set("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    }
    return res;
  } catch (error: any) {
    console.error("Recommendations API error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

type PoolItem = {
  id: number; title: string; type: string; genre: string[]; vibes: string[];
  year: number; cover: string; description: string; ext: any; totalEp: number;
  voteCount: number; popularityScore: number; itemDimensions: any;
  people: any; franchiseItems: { franchiseId: number }[];
};

function toClientItem(item: PoolItem) {
  return {
    id: item.id, title: item.title, type: item.type,
    genre: item.genre, vibes: item.vibes, year: item.year,
    cover: item.cover, desc: item.description,
    people: item.people || [], awards: [], platforms: [],
    ext: item.ext || {}, totalEp: item.totalEp,
  };
}

function genreOverlap(a: string[], b: string[]): number {
  const setB = new Set(b.map((s) => s.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase())).length;
}

function vibeOverlap(a: string[], b: string[]): number {
  const setB = new Set(b.map((s) => s.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase())).length;
}

function applyDiversityLimits(items: PoolItem[], maxPerFranchise = 3, maxPerCreator = 2): PoolItem[] {
  const franchiseCount: Record<number, number> = {};
  const creatorCount: Record<string, number> = {};

  return items.filter((item) => {
    // Franchise limit
    for (const fi of item.franchiseItems) {
      franchiseCount[fi.franchiseId] = (franchiseCount[fi.franchiseId] || 0) + 1;
      if (franchiseCount[fi.franchiseId] > maxPerFranchise) return false;
    }

    // Creator limit
    const people = item.people as any[] || [];
    const creator = people[0]?.name?.toLowerCase();
    if (creator) {
      creatorCount[creator] = (creatorCount[creator] || 0) + 1;
      if (creatorCount[creator] > maxPerCreator) return false;
    }

    return true;
  });
}

function pickAndMark(items: PoolItem[], usedIds: Set<number>, limit: number): PoolItem[] {
  const result = items.filter((i) => !usedIds.has(i.id)).slice(0, limit);
  result.forEach((i) => usedIds.add(i.id));
  return result;
}

// ─── Section builders ───────────────────────────────────────────────

function buildMoreSameType(
  source: any, pool: PoolItem[], sourceDims: TasteDimensions | null, usedIds: Set<number>,
): PoolItem[] {
  const sameType = pool.filter((c) => c.type === source.type);

  const scored = sameType.map((c) => {
    const gOverlap = genreOverlap(source.genre, c.genre);
    const vOverlap = vibeOverlap(source.vibes, c.vibes);
    const genreVibeScore = gOverlap * 2 + vOverlap;

    let dimScore = 0;
    if (sourceDims && c.itemDimensions) {
      dimScore = tasteSimilarity(sourceDims, c.itemDimensions as TasteDimensions);
    }

    // Quality factor — prefer higher quality items
    const norm = normalizeScore(c.ext || {}, c.type);
    const quality = norm > 0 ? norm : 0.5;

    const finalScore = genreVibeScore * 0.4 + dimScore * 0.35 + quality * 0.25;
    return { item: c, score: finalScore };
  });

  scored.sort((a, b) => b.score - a.score);
  const diverse = applyDiversityLimits(scored.map((s) => s.item));
  return pickAndMark(diverse, usedIds, 12);
}

function buildAcrossMedia(
  source: any, pool: PoolItem[], sourceDims: TasteDimensions | null,
  sourceFranchiseIds: number[], usedIds: Set<number>,
): PoolItem[] {
  const diffType = pool.filter((c) => c.type !== source.type);

  const scored = diffType.map((c) => {
    const gOverlap = genreOverlap(source.genre, c.genre);
    const vOverlap = vibeOverlap(source.vibes, c.vibes);

    let dimScore = 0;
    if (sourceDims && c.itemDimensions) {
      dimScore = tasteSimilarity(sourceDims, c.itemDimensions as TasteDimensions);
    }

    let score = dimScore;

    // Boosts
    if (gOverlap >= 2) score *= 1.3;
    if (vOverlap >= 2) score *= 1.3;

    // Franchise bonus (same franchise, different type)
    const cFranchiseIds = c.franchiseItems.map((fi) => fi.franchiseId);
    const sharedFranchise = sourceFranchiseIds.some((fid) => cFranchiseIds.includes(fid));
    if (sharedFranchise) score *= 1.5;

    return { item: c, score, isFranchise: sharedFranchise };
  });

  scored.sort((a, b) => b.score - a.score);

  // Cap franchise items at 2
  let franchiseCount = 0;
  const filtered = scored.filter((s) => {
    if (s.isFranchise) {
      franchiseCount++;
      if (franchiseCount > 2) return false;
    }
    return true;
  });

  // Ensure at least 3 different media types
  const result = ensureMediaDiversity(filtered.map((s) => s.item), 12);
  return pickAndMark(result, usedIds, 12);
}

function buildFansAlsoLoved(
  source: any, pool: PoolItem[], sourceDims: TasteDimensions | null,
  sourceFranchiseIds: number[], usedIds: Set<number>,
): PoolItem[] {
  // For now (before we have enough user data): genre + vibe overlap approach
  // Include franchise items of different types first

  const scored = pool.map((c) => {
    const gOverlap = genreOverlap(source.genre, c.genre);
    const vOverlap = vibeOverlap(source.vibes, c.vibes);

    let dimScore = 0;
    if (sourceDims && c.itemDimensions) {
      dimScore = tasteSimilarity(sourceDims, c.itemDimensions as TasteDimensions);
    }

    let score = (gOverlap + vOverlap) * 0.4 + dimScore * 0.4;

    // Franchise items of different type get big boost
    const cFranchiseIds = c.franchiseItems.map((fi) => fi.franchiseId);
    const sharedFranchise = sourceFranchiseIds.some((fid) => cFranchiseIds.includes(fid));
    if (sharedFranchise && c.type !== source.type) score *= 1.5;

    // Quality boost
    const norm = normalizeScore(c.ext || {}, c.type);
    if (norm > 0.75) score *= 1.2;

    return { item: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const diverse = applyDiversityLimits(scored.map((s) => s.item));
  return pickAndMark(diverse, usedIds, 12);
}

function buildHiddenGems(
  source: any, pool: PoolItem[], sourceDims: TasteDimensions | null, usedIds: Set<number>,
): PoolItem[] {
  // Must have high quality + low popularity + genre/vibe overlap
  const gems = pool.filter((c) => {
    const norm = normalizeScore(c.ext || {}, c.type);
    if (norm < 0.6) return false; // Minimum quality

    // Check high quality threshold by type
    const ext = c.ext as Record<string, number> || {};
    const isHighQuality = checkHighQuality(c.type, ext, norm);
    if (!isHighQuality) return false;

    // Check low popularity
    const isLowPop = checkLowPopularity(c.type, c.voteCount, ext);
    if (!isLowPop) return false;

    // Must share at least 2 genres OR 2 vibes
    const gOverlap = genreOverlap(source.genre, c.genre);
    const vOverlap = vibeOverlap(source.vibes, c.vibes);
    if (gOverlap < 2 && vOverlap < 2) return false;

    return true;
  });

  // Score by dimension similarity + quality
  const scored = gems.map((c) => {
    let dimScore = 0;
    if (sourceDims && c.itemDimensions) {
      dimScore = tasteSimilarity(sourceDims, c.itemDimensions as TasteDimensions);
    }
    const norm = normalizeScore(c.ext || {}, c.type);
    // Reward low vote count (more hidden)
    const hiddenBonus = c.voteCount < 500 ? 0.2 : c.voteCount < 2000 ? 0.1 : 0;
    return { item: c, score: dimScore * 0.5 + norm * 0.3 + hiddenBonus };
  });

  scored.sort((a, b) => b.score - a.score);

  // If fewer than 4, relax thresholds
  if (scored.length < 4) {
    const relaxed = pool.filter((c) => {
      if (usedIds.has(c.id)) return false;
      const norm = normalizeScore(c.ext || {}, c.type);
      if (norm < 0.6) return false;
      const gOverlap = genreOverlap(source.genre, c.genre);
      const vOverlap = vibeOverlap(source.vibes, c.vibes);
      return gOverlap >= 1 || vOverlap >= 1;
    });

    const relaxedScored = relaxed.map((c) => {
      let dimScore = 0;
      if (sourceDims && c.itemDimensions) {
        dimScore = tasteSimilarity(sourceDims, c.itemDimensions as TasteDimensions);
      }
      return { item: c, score: dimScore };
    });
    relaxedScored.sort((a, b) => b.score - a.score);

    // Merge: originals first, then relaxed fills
    const existingIds = new Set(scored.map((s) => s.item.id));
    for (const r of relaxedScored) {
      if (!existingIds.has(r.item.id)) scored.push(r);
    }
  }

  const diverse = applyDiversityLimits(scored.map((s) => s.item));
  return pickAndMark(diverse, usedIds, 10);
}

function checkHighQuality(type: string, ext: Record<string, number>, norm: number): boolean {
  switch (type) {
    case "movie": case "tv": return (ext.imdb >= 7.5) || (ext.rt >= 85) || (ext.meta >= 75) || norm >= 0.75;
    case "book": return (ext.goodreads >= 4.0) || norm >= 0.75;
    case "manga": return (ext.mal >= 8.0) || norm >= 0.75;
    case "game": return (ext.meta >= 80) || (ext.ign >= 8.0) || norm >= 0.75;
    case "music": return (ext.pitchfork >= 7.5) || norm >= 0.75;
    default: return norm >= 0.7;
  }
}

function checkLowPopularity(type: string, voteCount: number, ext: Record<string, number>): boolean {
  switch (type) {
    case "movie": return voteCount < 50000;
    case "tv": return voteCount < 20000;
    case "game": return voteCount < 5000;
    case "book": return voteCount < 50000;
    case "manga": return voteCount < 30000;
    case "music": return (ext.spotify_popularity ?? 100) < 50;
    case "comic": return voteCount < 1000;
    default: return voteCount < 10000;
  }
}

function ensureMediaDiversity(items: PoolItem[], limit: number): PoolItem[] {
  const typeCounts: Record<string, number> = {};
  const result: PoolItem[] = [];
  const deferred: PoolItem[] = [];

  for (const item of items) {
    const count = typeCounts[item.type] || 0;
    // Allow up to 4 per type initially
    if (count < 4) {
      typeCounts[item.type] = count + 1;
      result.push(item);
    } else {
      deferred.push(item);
    }
    if (result.length >= limit) break;
  }

  // Ensure at least 3 types
  const types = new Set(result.map((r) => r.type));
  if (types.size < 3 && result.length < limit) {
    for (const item of deferred) {
      if (!types.has(item.type)) {
        // Swap out the last item of the most represented type
        result.push(item);
        types.add(item.type);
        if (types.size >= 3 || result.length >= limit) break;
      }
    }
  }

  return result.slice(0, limit);
}
