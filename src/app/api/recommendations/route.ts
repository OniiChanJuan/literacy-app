import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";
import { normalizeScore } from "@/lib/ranking";
import { tasteSimilarity, type TasteDimensions } from "@/lib/taste-dimensions";
import { tagSimilarity, type ItemTags } from "@/lib/tags";

/**
 * GET /api/recommendations?itemId=123
 * Returns 4 recommendation sections for a detail page:
 *   moreSameType, acrossMedia, fansAlsoLoved, trySomethingDifferent
 *
 * Cached for 10 minutes (same for all users — not personalized yet).
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`recommendations:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  try {
    // Fetch the source item
    const sourceItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true, title: true, type: true, genre: true, vibes: true,
        year: true, cover: true, description: true, ext: true, totalEp: true,
        voteCount: true, popularityScore: true, itemDimensions: true, itemTags: true,
        parentItemId: true, people: true,
        franchiseItems: { select: { franchiseId: true } },
      },
    });

    if (!sourceItem) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const sourceDims = sourceItem.itemDimensions as TasteDimensions | null;
    const sourceTags = sourceItem.itemTags as ItemTags | null;
    const sourceFranchiseIds = sourceItem.franchiseItems.map((fi) => fi.franchiseId);

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
        voteCount: true, popularityScore: true, itemDimensions: true, itemTags: true,
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
    const moreSameType = buildMoreSameType(sourceItem, pool, sourceDims, sourceTags, usedIds);

    // ─── SECTION 2: Across Media ─────────────────────────────────────
    const acrossMedia = buildAcrossMedia(sourceItem, pool, sourceDims, sourceTags, sourceFranchiseIds, usedIds);

    // ─── SECTION 3: Fans Also Loved ──────────────────────────────────
    const fansAlsoLoved = buildFansAlsoLoved(sourceItem, pool, sourceDims, sourceTags, sourceFranchiseIds, usedIds);

    // ─── SECTION 4: Try Something Different ──────────────────────────
    const trySomethingDifferent = buildTrySomethingDifferent(sourceItem, pool, sourceDims, usedIds);

    const res = NextResponse.json({
      moreSameType: moreSameType.map(toClientItem),
      acrossMedia: acrossMedia.map(toClientItem),
      fansAlsoLoved: fansAlsoLoved.map(toClientItem),
      trySomethingDifferent: trySomethingDifferent.map(toClientItem),
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
  voteCount: number; popularityScore: number; itemDimensions: any; itemTags: any;
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
  source: any, pool: PoolItem[], sourceDims: TasteDimensions | null, sourceTags: ItemTags | null, usedIds: Set<number>,
): PoolItem[] {
  const sameType = pool.filter((c) => c.type === source.type);

  const scored = sameType.map((c) => {
    const gOverlap = genreOverlap(source.genre, c.genre);
    const vOverlap = vibeOverlap(source.vibes, c.vibes);
    const genreVibeScore = (gOverlap * 2 + vOverlap) / Math.max(1, source.genre.length + source.vibes.length);

    let dimScore = 0;
    if (sourceDims && c.itemDimensions) {
      dimScore = tasteSimilarity(sourceDims, c.itemDimensions as TasteDimensions);
    }

    const tSim = sourceTags ? tagSimilarity(sourceTags, c.itemTags as ItemTags) : 0;
    const norm = normalizeScore(c.ext || {}, c.type);
    const quality = norm > 0 ? norm : 0.5;

    // Blended score: tags 0.30, taste 0.25, genre/vibe 0.25, quality 0.20
    const finalScore = tSim * 0.30 + dimScore * 0.25 + genreVibeScore * 0.25 + quality * 0.20;
    return { item: c, score: finalScore };
  });

  scored.sort((a, b) => b.score - a.score);
  const diverse = applyDiversityLimits(scored.map((s) => s.item));
  return pickAndMark(diverse, usedIds, 30);
}

function buildAcrossMedia(
  source: any, pool: PoolItem[], sourceDims: TasteDimensions | null,
  sourceTags: ItemTags | null, sourceFranchiseIds: number[], usedIds: Set<number>,
): PoolItem[] {
  // Strictly exclude the same media type as the source
  const diffType = pool.filter((c) => c.type !== source.type);

  const scored = diffType.map((c) => {
    const gOverlap = genreOverlap(source.genre, c.genre);
    const vOverlap = vibeOverlap(source.vibes, c.vibes);

    let dimScore = 0;
    if (sourceDims && c.itemDimensions) {
      dimScore = tasteSimilarity(sourceDims, c.itemDimensions as TasteDimensions);
    }

    // Tag similarity — critical for cross-media (tags are the bridge)
    const tSim = sourceTags ? tagSimilarity(sourceTags, c.itemTags as ItemTags) : 0;

    // Cross-media: tags 0.35 (higher weight — tags bridge media types), taste 0.25, genre/vibe 0.20
    let score = tSim * 0.35 + dimScore * 0.25 + (gOverlap + vOverlap) * 0.05;

    // Boosts for meaningful overlap
    if (gOverlap >= 2) score *= 1.2;
    if (vOverlap >= 2) score *= 1.2;

    // Franchise bonus (same franchise, different type)
    const cFranchiseIds = c.franchiseItems.map((fi) => fi.franchiseId);
    const sharedFranchise = sourceFranchiseIds.some((fid) => cFranchiseIds.includes(fid));
    if (sharedFranchise) score *= 1.5;

    return { item: c, score, isFranchise: sharedFranchise };
  });

  scored.sort((a, b) => b.score - a.score);

  // Cap franchise items at 2 to keep variety
  let franchiseCount = 0;
  const filtered = scored.filter((s) => {
    if (s.isFranchise) {
      franchiseCount++;
      if (franchiseCount > 2) return false;
    }
    return true;
  });

  // Ensure at least 3 different media types in the result
  const result = ensureMediaDiversity(filtered.map((s) => s.item), 30, 4);
  return pickAndMark(result, usedIds, 30);
}

function buildFansAlsoLoved(
  source: any, pool: PoolItem[], sourceDims: TasteDimensions | null,
  sourceTags: ItemTags | null, sourceFranchiseIds: number[], usedIds: Set<number>,
): PoolItem[] {
  const scored = pool.map((c) => {
    const gOverlap = genreOverlap(source.genre, c.genre);
    const vOverlap = vibeOverlap(source.vibes, c.vibes);

    let dimScore = 0;
    if (sourceDims && c.itemDimensions) {
      dimScore = tasteSimilarity(sourceDims, c.itemDimensions as TasteDimensions);
    }

    const tSim = sourceTags ? tagSimilarity(sourceTags, c.itemTags as ItemTags) : 0;

    let score = tSim * 0.30 + (gOverlap + vOverlap) * 0.1 + dimScore * 0.30;

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
  return pickAndMark(diverse, usedIds, 30);
}

// Vibes that are considered "opposite" to each input vibe
const OPPOSITE_VIBES: Record<string, string[]> = {
  "dark":           ["Wholesome", "Funny", "Uplifting", "Cozy", "Heartfelt", "Light"],
  "intense":        ["Cozy", "Relaxing", "Slow Burn", "Wholesome", "Calm"],
  "gritty":         ["Wholesome", "Uplifting", "Funny", "Cozy", "Heartfelt"],
  "brutal":         ["Wholesome", "Heartfelt", "Funny", "Uplifting", "Cozy"],
  "melancholic":    ["Uplifting", "Funny", "Wholesome", "Feel-Good", "Heartfelt"],
  "heartbreaking":  ["Funny", "Uplifting", "Wholesome", "Lighthearted"],
  "slow burn":      ["Fast-Paced", "Chaotic", "Action-Packed"],
  "epic":           ["Intimate", "Cozy", "Small-Scale"],
  "cerebral":       ["Funny", "Fast-Paced", "Lighthearted", "Action-Packed"],
  "atmospheric":    ["Fast-Paced", "Chaotic", "Lighthearted"],
  "surreal":        ["Grounded", "Realistic", "Cozy"],
  "mind-bending":   ["Straightforward", "Cozy", "Lighthearted"],
  "satirical":      ["Sincere", "Heartfelt", "Earnest"],
  "chaotic":        ["Calm", "Cozy", "Slow Burn", "Atmospheric"],
  "action-packed":  ["Slow Burn", "Cozy", "Cerebral", "Atmospheric"],
};

function buildTrySomethingDifferent(
  source: any, pool: PoolItem[], sourceDims: TasteDimensions | null, usedIds: Set<number>,
): PoolItem[] {
  // Build the set of "preferred" vibes (opposites of source vibes)
  const sourceVibesLower = (source.vibes as string[]).map((v: string) => v.toLowerCase());
  const preferredVibes = new Set<string>();
  for (const vibe of sourceVibesLower) {
    const opposites = OPPOSITE_VIBES[vibe] || [];
    for (const opp of opposites) preferredVibes.add(opp.toLowerCase());
  }

  // Filter: high quality, low genre overlap with source, not already used
  const candidates = pool.filter((c) => {
    const norm = normalizeScore(c.ext || {}, c.type);
    if (norm < 0.70) return false; // Only quality items

    const gOverlap = genreOverlap(source.genre, c.genre);
    if (gOverlap >= 2) return false; // Must be genuinely different (0-1 genre overlap)

    return true;
  });

  const scored = candidates.map((c) => {
    const norm = normalizeScore(c.ext || {}, c.type);

    // Count how many of this item's vibes are "preferred" (opposite of source vibes)
    const cVibesLower = c.vibes.map((v) => v.toLowerCase());
    const oppositeVibeCount = cVibesLower.filter((v) => preferredVibes.has(v)).length;

    // Bonus for different media type
    const typeDiff = c.type !== source.type ? 0.1 : 0;

    // Score: quality + opposite vibes bonus + type difference bonus
    const score = norm * 0.6 + (oppositeVibeCount / Math.max(1, c.vibes.length)) * 0.3 + typeDiff;

    return { item: c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Ensure variety: max 3 per media type, at least 4 different types represented
  const result = ensureMediaDiversity(scored.map((s) => s.item), 30, 3);
  return pickAndMark(result, usedIds, 30);
}

function ensureMediaDiversity(items: PoolItem[], limit: number, maxPerType = 4): PoolItem[] {
  const typeCounts: Record<string, number> = {};
  const result: PoolItem[] = [];
  const deferred: PoolItem[] = [];

  for (const item of items) {
    const count = typeCounts[item.type] || 0;
    if (count < maxPerType) {
      typeCounts[item.type] = count + 1;
      result.push(item);
    } else {
      deferred.push(item);
    }
    if (result.length >= limit) break;
  }

  // If we still have room and deferred items, fill up to limit
  if (result.length < limit) {
    for (const item of deferred) {
      if (result.length >= limit) break;
      result.push(item);
    }
  }

  // Ensure at least 3 different types represented
  const types = new Set(result.map((r) => r.type));
  if (types.size < 3 && deferred.length > 0) {
    for (const item of deferred) {
      if (!types.has(item.type)) {
        result.push(item);
        types.add(item.type);
        if (types.size >= 3) break;
      }
    }
  }

  return result.slice(0, limit);
}
