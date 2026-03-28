import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";
import { qualityRank, meetsQualityFloor, normalizeScore, applyDiversity, interleaveByType } from "@/lib/ranking";

const ITEM_SELECT = {
  id: true, title: true, type: true, genre: true, vibes: true,
  year: true, cover: true, description: true, people: true,
  awards: true, platforms: true, ext: true, totalEp: true,
  popularityScore: true, voteCount: true,
} as const;

/**
 * GET /api/catalog — Fetch items with quality ranking + diversity + dedup
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`catalog:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");
  const sort = searchParams.get("sort") || "quality";
  const genre = searchParams.get("genre");
  const vibe = searchParams.get("vibe");
  const tag = searchParams.get("tag");
  const curated = searchParams.get("curated");
  const excludeIds = searchParams.get("exclude")?.split(",").map(Number).filter(Boolean) || [];

  try {
    // If tag filter is active, get matching item IDs via raw SQL first
    let tagFilterIds: number[] | null = null;
    if (tag) {
      let tagItems: { id: number }[];
      if (type) {
        tagItems = await prisma.$queryRaw<{ id: number }[]>`
          SELECT id FROM items
          WHERE item_tags IS NOT NULL
          AND item_tags::jsonb ? ${tag}
          AND is_upcoming = false AND parent_item_id IS NULL
          AND type = ${type}
          ORDER BY (item_tags::jsonb -> ${tag} ->> 'weight')::float DESC
          LIMIT 200
        `.catch(() => []);
      } else {
        tagItems = await prisma.$queryRaw<{ id: number }[]>`
          SELECT id FROM items
          WHERE item_tags IS NOT NULL
          AND item_tags::jsonb ? ${tag}
          AND is_upcoming = false AND parent_item_id IS NULL
          ORDER BY (item_tags::jsonb -> ${tag} ->> 'weight')::float DESC
          LIMIT 200
        `.catch(() => []);
      }
      tagFilterIds = tagItems.map(i => i.id);
      if (tagFilterIds.length === 0) {
        return NextResponse.json([]);
      }
    }

    const where: any = { isUpcoming: false, parentItemId: null };
    if (type) where.type = type;
    if (genre) {
      const genres = genre.split(",").filter(Boolean);
      if (genres.length === 1) where.genre = { has: genres[0] };
      else if (genres.length > 1) where.genre = { hasSome: genres };
    }
    if (vibe) where.vibes = { has: vibe };
    if (tagFilterIds) {
      where.id = { in: tagFilterIds };
    }
    if (excludeIds.length > 0) {
      where.id = where.id ? { ...where.id, notIn: excludeIds } : { notIn: excludeIds };
    }

    // Fetch pool of items (larger than needed for ranking/diversity)
    // Scale pool with offset so deep pagination still has items to rank
    const poolSize = Math.max((offset + limit) * 5, 200);

    // ── Critically acclaimed ──────────────────────────────────────────
    if (curated === "top_rated") {
      const items = await prisma.item.findMany({
        where: { ...where, voteCount: { gte: 50 } },
        orderBy: { voteCount: "desc" },
        take: poolSize,
        select: ITEM_SELECT,
      });

      const ranked = items
        .filter((i) => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }) && normalizeScore(i.ext as any, i.type) >= 0.75)
        .map((i) => ({ ...i, rank: qualityRank({ ext: i.ext as any, type: i.type, year: i.year, voteCount: i.voteCount }) }))
        .sort((a, b) => b.rank - a.rank);

      // Enforce max 30% per type for diversity
      const typeCounts = new Map<string, number>();
      const maxPerType = Math.ceil(limit * 0.3);
      const diverse = ranked.filter((i) => {
        const c = typeCounts.get(i.type) || 0;
        if (c >= maxPerType) return false;
        typeCounts.set(i.type, c + 1);
        return true;
      });

      return jsonResponse(interleaveByType(diverse).slice(offset, offset + limit).map(mapItem));
    }

    // ── Popular right now ─────────────────────────────────────────────
    if (curated === "popular") {
      const currentYear = new Date().getFullYear();
      const items = await prisma.item.findMany({
        where: { ...where, year: { gte: currentYear - 2 }, voteCount: { gte: 10 } },
        orderBy: { popularityScore: "desc" },
        take: poolSize,
        select: ITEM_SELECT,
      });

      const filtered = items.filter((i) => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }));

      // Enforce max 30% per type for diversity (same cap as top_rated)
      const popTypeCounts = new Map<string, number>();
      const popMaxPerType = Math.ceil(limit * 0.3);
      const popDiverse = filtered.filter((i) => {
        const c = popTypeCounts.get(i.type) || 0;
        if (c >= popMaxPerType) return false;
        popTypeCounts.set(i.type, c + 1);
        return true;
      });

      return jsonResponse(interleaveByType(popDiverse).slice(offset, offset + limit).map(mapItem));
    }

    // ── Hidden gems ───────────────────────────────────────────────────
    if (curated === "hidden_gems") {
      // Min 20 votes: "hidden" means not mainstream, not literally unknown
      const items = await prisma.item.findMany({
        where: { ...where, voteCount: { gte: 20, lt: 5000 } },
        orderBy: { year: "desc" },
        take: poolSize,
        select: ITEM_SELECT,
      });

      const gems = items
        .filter((i) => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }) && normalizeScore(i.ext as any, i.type) >= 0.75)
        .map((i) => {
          const norm = normalizeScore(i.ext as any, i.type);
          const gemScore = norm / Math.log10(Math.max(i.voteCount, 20));
          return { ...i, gemScore };
        })
        .sort((a, b) => b.gemScore - a.gemScore);

      // Enforce max 30% per type for diversity
      const gemTypeCounts = new Map<string, number>();
      const gemMaxPerType = Math.ceil(limit * 0.3);
      const gemDiverse = gems.filter((i) => {
        const c = gemTypeCounts.get(i.type) || 0;
        if (c >= gemMaxPerType) return false;
        gemTypeCounts.set(i.type, c + 1);
        return true;
      });

      return jsonResponse(interleaveByType(gemDiverse).slice(offset, offset + limit).map(mapItem));
    }

    // ── Standard query ────────────────────────────────────────────────
    let orderBy: any;
    switch (sort) {
      case "newest": orderBy = { year: "desc" }; break;
      case "oldest": orderBy = { year: "asc" }; break;
      case "az": orderBy = { title: "asc" }; break;
      case "popular": orderBy = { popularityScore: "desc" }; break;
      default: orderBy = [{ voteCount: "desc" }, { year: "desc" }]; break;
    }

    const items = await prisma.item.findMany({
      where,
      orderBy,
      take: poolSize,
      select: ITEM_SELECT,
    });

    // Apply quality ranking and floor for browse/filter views
    const ranked = items
      .filter((i) => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }))
      .map((i) => ({
        ...i,
        rank: qualityRank({ ext: i.ext as any, type: i.type, year: i.year, voteCount: i.voteCount }),
      }));

    // Re-sort by quality rank if using default sort
    if (sort === "quality") {
      ranked.sort((a, b) => b.rank - a.rank);
    }

    return jsonResponse(ranked.slice(offset, offset + limit).map(mapItem));
  } catch (error: any) {
    console.error("Catalog API error:", error);
    return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 });
  }
}

function jsonResponse(data: any) {
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res;
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
