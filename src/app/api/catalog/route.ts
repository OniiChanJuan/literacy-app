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
      // Build base where without type — we handle types via per-type quotas below
      const baseWhere: any = { isUpcoming: false, parentItemId: null };
      if (genre) {
        const genres = genre.split(",").filter(Boolean);
        if (genres.length === 1) baseWhere.genre = { has: genres[0] };
        else if (genres.length > 1) baseWhere.genre = { hasSome: genres };
      }
      if (vibe) baseWhere.vibes = { has: vibe };
      if (excludeIds.length > 0) baseWhere.id = { notIn: excludeIds };

      // Single-type view: skip per-type quotas, quality-rank the full type directly
      // so the frontend can show 30-60+ results and paginate with load-more.
      if (type) {
        const minVotesMap: Record<string, number> = { movie: 50, tv: 50, game: 10, manga: 50, book: 5, music: 0, comic: 0, podcast: 0 };
        const minVotes = minVotesMap[type] ?? 0;
        const typeWhere: any = { ...baseWhere, type };
        if (minVotes > 0) typeWhere.voteCount = { gte: minVotes };
        const pool = await prisma.item.findMany({
          where: typeWhere,
          orderBy: { voteCount: "desc" },
          take: Math.min((offset + limit) * 5 + 100, 600),
          select: ITEM_SELECT,
        });
        const ranked = pool
          .filter(i => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }))
          .map(i => ({ ...i, rank: qualityRank({ ext: i.ext as any, type: i.type, year: i.year, voteCount: i.voteCount || 0 }) }))
          .sort((a, b) => b.rank - a.rank);
        const page = ranked.slice(offset, offset + limit);
        const hasMore = ranked.length > offset + limit;
        return jsonResponse(page.map(mapItem), hasMore);
      }

      // Cross-media view: per-type quotas guarantee diversity.
      // minVotes=0 for types without scoring sources (comic/podcast/music).
      const typeQuotas: Array<{ t: string; quota: number; minVotes: number }> = [
        { t: "movie",   quota: 10, minVotes: 50 },
        { t: "tv",      quota: 10, minVotes: 50 },
        { t: "game",    quota: 5,  minVotes: 10 },
        { t: "manga",   quota: 5,  minVotes: 50 },
        { t: "book",    quota: 3,  minVotes: 5  },
        { t: "music",   quota: 2,  minVotes: 0  },
        { t: "comic",   quota: 2,  minVotes: 0  },
        { t: "podcast", quota: 2,  minVotes: 0  },
      ];

      const perTypeItems = await Promise.all(
        typeQuotas.map(async ({ t, quota, minVotes }) => {
          const typeWhere: any = { ...baseWhere, type: t };
          if (minVotes > 0) typeWhere.voteCount = { gte: minVotes };

          const pool = await prisma.item.findMany({
            where: typeWhere,
            orderBy: { voteCount: "desc" },
            take: quota * 6,
            select: ITEM_SELECT,
          });

          return pool
            .filter(i => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }))
            .map(i => ({ ...i, rank: qualityRank({ ext: i.ext as any, type: i.type, year: i.year, voteCount: i.voteCount || 0 }) }))
            .sort((a, b) => b.rank - a.rank)
            .slice(0, quota);
        })
      );

      const merged = perTypeItems.flat().sort((a, b) => (b as any).rank - (a as any).rank);
      const interleaved = interleaveByType(merged);
      const page = interleaved.slice(offset, offset + limit);
      const hasMore = interleaved.length > offset + limit;

      return jsonResponse(page.map(mapItem), hasMore);
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

      const page = interleaveByType(popDiverse).slice(offset, offset + limit);
      const hasMore = popDiverse.length > offset + limit;
      return jsonResponse(page.map(mapItem), hasMore);
    }

    // ── Hidden gems ───────────────────────────────────────────────────
    if (curated === "hidden_gems") {
      // Build base where without type — per-type quotas handle diversity
      const baseWhere: any = { isUpcoming: false, parentItemId: null };
      if (genre) {
        const genres = genre.split(",").filter(Boolean);
        if (genres.length === 1) baseWhere.genre = { has: genres[0] };
        else if (genres.length > 1) baseWhere.genre = { hasSome: genres };
      }
      if (vibe) baseWhere.vibes = { has: vibe };
      if (excludeIds.length > 0) baseWhere.id = { notIn: excludeIds };

      // Score threshold 0.65 — niche items can be great without blockbuster scores
      const SCORE_THRESHOLD = 0.65;

      // Single-type view: skip per-type quotas, gem-rank the full type for pagination
      if (type) {
        const pool = await prisma.item.findMany({
          where: { ...baseWhere, type, voteCount: { gte: 10, lt: 5000 } },
          orderBy: { year: "desc" },
          take: Math.min((offset + limit) * 5 + 100, 600),
          select: ITEM_SELECT,
        });
        const ranked = pool
          .filter(i => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }) && normalizeScore(i.ext as any, i.type) >= SCORE_THRESHOLD)
          .map(i => {
            const norm = normalizeScore(i.ext as any, i.type);
            const gemScore = norm / Math.log10(Math.max(i.voteCount || 1, 10));
            return { ...i, gemScore };
          })
          .sort((a, b) => b.gemScore - a.gemScore);
        const page = ranked.slice(offset, offset + limit);
        const hasMore = ranked.length > offset + limit;
        return jsonResponse(page.map(mapItem), hasMore);
      }

      // Cross-media view: per-type quotas with lowered thresholds
      // Min voteCount 10 — a gem with 10-15 genuine ratings is still valid
      const gemTypes: Array<{ t: string; quota: number }> = [
        { t: "movie",  quota: 6 },
        { t: "tv",     quota: 6 },
        { t: "game",   quota: 5 },
        { t: "manga",  quota: 5 },
        { t: "book",   quota: 5 },
      ];

      const perTypeGems = await Promise.all(
        gemTypes.map(async ({ t, quota }) => {
          const pool = await prisma.item.findMany({
            where: { ...baseWhere, type: t, voteCount: { gte: 10, lt: 5000 } },
            orderBy: { year: "desc" },
            take: quota * 8,
            select: ITEM_SELECT,
          });

          return pool
            .filter(i => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }) && normalizeScore(i.ext as any, i.type) >= SCORE_THRESHOLD)
            .map(i => {
              const norm = normalizeScore(i.ext as any, i.type);
              const gemScore = norm / Math.log10(Math.max(i.voteCount || 1, 10));
              return { ...i, gemScore };
            })
            .sort((a, b) => b.gemScore - a.gemScore)
            .slice(0, quota);
        })
      );

      const merged = perTypeGems.flat().sort((a, b) => (b as any).gemScore - (a as any).gemScore);
      const interleaved = interleaveByType(merged);
      const page = interleaved.slice(offset, offset + limit);
      const hasMore = interleaved.length > offset + limit;

      return jsonResponse(page.map(mapItem), hasMore);
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

    const page = ranked.slice(offset, offset + limit);
    const hasMore = ranked.length > offset + limit;
    return jsonResponse(page.map(mapItem), hasMore);

  } catch (error: any) {
    console.error("Catalog API error:", error);
    return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 });
  }
}

function jsonResponse(data: any, hasMore = false) {
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.headers.set("X-Has-More", hasMore ? "1" : "0");
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
