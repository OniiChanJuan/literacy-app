import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";
import { qualityRank, meetsQualityFloor, normalizeScore, applyDiversity, interleaveByType } from "@/lib/ranking";
import { isAnime } from "@/lib/anime";

function filterAnime(items: any[]): any[] {
  return items.filter((i) => isAnime(i));
}

/** Fisher-Yates shuffle — returns a new shuffled array sliced to `count` */
function shuffleAndPick<T>(arr: T[], count: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

/** Response with no caching — used for randomized For You rows */
function jsonResponseNoCache(data: any) {
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Has-More", "0");
  return res;
}

const ITEM_SELECT = {
  id: true, title: true, type: true, genre: true, vibes: true,
  year: true, cover: true, description: true, people: true,
  ext: true, totalEp: true,
  popularityScore: true, voteCount: true, malId: true,
} as const;

// Only ext keys Card/HoverPreview render. Drops bulky raw API payload data.
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

/**
 * Genre synonym expansion.
 * TMDB uses compound/alternate genre names that don't match the UI filter pills.
 * Expanding the query means "TV + Thriller" also matches shows stored as Crime/Mystery.
 */
const GENRE_SYNONYMS: Record<string, string[]> = {
  "Thriller":    ["Crime", "Mystery"],         // TMDB TV has no Thriller genre; Crime+Mystery = thrillers
  "Sci-Fi":      ["Science Fiction", "Sci-Fi & Fantasy"],
  "Fantasy":     ["Sci-Fi & Fantasy"],
  "Action":      ["Action & Adventure"],
  "Adventure":   ["Action & Adventure"],
  "War":         ["War & Politics"],
  "Animation":   ["Animated"],
  "Crime":       ["Thriller"],                 // Crime filter also surfaces tagged thrillers
  "Mystery":     ["Thriller"],
};

function expandGenres(genres: string[]): string[] {
  const expanded = new Set(genres);
  for (const g of genres) {
    for (const synonym of (GENRE_SYNONYMS[g] || [])) {
      expanded.add(synonym);
    }
  }
  return [...expanded];
}

function buildGenreFilter(genre: string): object {
  const expanded = expandGenres(genre.split(",").filter(Boolean));
  return { hasSome: expanded };
}

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
  const forYou = searchParams.get("forYou") === "1";
  const excludeAnime = searchParams.get("excludeAnime") === "1";

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
    const isAnimeFilter = type === "anime";
    if (isAnimeFilter) {
      where.type = { in: ["tv", "movie"] };
    } else if (type) {
      where.type = type;
    }
    if (genre) where.genre = buildGenreFilter(genre);
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
      if (genre) baseWhere.genre = buildGenreFilter(genre);
      if (vibe) baseWhere.vibes = { has: vibe };
      if (excludeIds.length > 0) baseWhere.id = { notIn: excludeIds };

      // Single-type view: skip per-type quotas, quality-rank the full type directly
      // so the frontend can show 30-60+ results and paginate with load-more.
      if (type) {
        const minVotesMap: Record<string, number> = { movie: 1000, tv: 1000, game: 500, manga: 1000, book: 100, music: 10, comic: 1000, podcast: 1000 };
        const minVotes = isAnimeFilter ? 100 : (minVotesMap[type] ?? 100);
        const typeWhere: any = isAnimeFilter
          ? { ...baseWhere, type: { in: ["tv", "movie"] } }
          : { ...baseWhere, type };
        if (minVotes > 0) typeWhere.voteCount = { gte: minVotes };
        const pool = await prisma.item.findMany({
          where: typeWhere,
          orderBy: { voteCount: "desc" },
          take: Math.min((offset + limit) * 5 + 100, 600),
          select: ITEM_SELECT,
        });
        let ranked = pool
          .filter(i => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }))
          .filter(i => normalizeScore(i.ext as any, i.type, i.voteCount || 0) >= 0.80)
          .map(i => ({ ...i, rank: qualityRank({ ext: i.ext as any, type: i.type, year: i.year, voteCount: i.voteCount || 0 }) }))
          .sort((a, b) => b.rank - a.rank);
        if (isAnimeFilter) ranked = ranked.filter((i: any) => isAnime(i));
        const page = ranked.slice(offset, offset + limit);
        const hasMore = ranked.length > offset + limit;
        return jsonResponse(page.map(mapItem), hasMore);
      }

      // Cross-media view: per-type quotas guarantee diversity.
      // minVotes raised — critically acclaimed items are by definition widely reviewed.
      // Podcast/comic minVotes=500 effectively excludes them (real rating counts are ~0 after cleanup).
      // Comics and podcasts excluded — no meaningful vote/score data in DB
      const typeQuotas: Array<{ t: string; quota: number; minVotes: number }> = [
        { t: "movie",   quota: 10, minVotes: 1000 },
        { t: "tv",      quota: 10, minVotes: 1000 },
        { t: "game",    quota: 5,  minVotes: 500  },
        { t: "manga",   quota: 5,  minVotes: 1000 },
        { t: "book",    quota: 3,  minVotes: 100  },
        { t: "music",   quota: 2,  minVotes: 10   },
      ];

      const ACCLAIMED_THRESHOLD = 0.80; // normalizeScore — critically acclaimed means exceptional

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
            .filter(i => normalizeScore(i.ext as any, i.type, i.voteCount || 0) >= ACCLAIMED_THRESHOLD)
            .map(i => ({ ...i, rank: qualityRank({ ext: i.ext as any, type: i.type, year: i.year, voteCount: i.voteCount || 0 }) }))
            .sort((a, b) => b.rank - a.rank)
            .slice(0, quota);
        })
      );

      const merged = perTypeItems.flat();
      // Shuffle the quality pool for freshness on each request
      const shuffledMerged = offset === 0 ? shuffleAndPick(merged, merged.length) : merged.sort((a, b) => (b as any).rank - (a as any).rank);
      const interleaved = interleaveByType(shuffledMerged);
      const page = interleaved.slice(offset, offset + limit);
      const hasMore = interleaved.length > offset + limit;

      return jsonResponse(page.map(mapItem), hasMore);
    }

    // ── Popular right now ─────────────────────────────────────────────
    if (curated === "popular") {
      const currentYear = new Date().getFullYear();
      // FIX 5: year >= currentYear - 1 (was -2), higher vote thresholds
      const popVoteMin = type && ["movie", "tv"].includes(type) ? 50
                       : type && ["podcast", "comic"].includes(type) ? 1
                       : 10;
      const items = await prisma.item.findMany({
        where: { ...where, year: { gte: currentYear - 1 }, voteCount: { gte: popVoteMin } },
        orderBy: { popularityScore: "desc" },
        take: poolSize,
        select: ITEM_SELECT,
      });

      const filtered = items.filter((i) => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }));
      if (filtered.length === 0) return jsonResponse([], false);

      // FIX 4: blend TMDB trending score (70%) + recent CrossShelf rating activity (30%)
      const itemIds = filtered.map((i) => i.id);
      const recentCounts = await prisma.$queryRawUnsafe<{ item_id: number; cnt: number }[]>(`
        SELECT item_id, COUNT(*)::int AS cnt
        FROM ratings
        WHERE item_id = ANY(ARRAY[${itemIds.join(",")}]::int[])
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY item_id
      `);
      const recentMap = new Map(recentCounts.map((r) => [Number(r.item_id), r.cnt]));

      const scored = filtered
        .map((i) => ({
          ...i,
          blendScore: (i.popularityScore || 0) * 0.7 + (recentMap.get(i.id) || 0) * 50 * 0.3,
        }))
        .sort((a, b) => b.blendScore - a.blendScore);

      // Enforce max 30% per type for diversity
      const popTypeCounts = new Map<string, number>();
      const popMaxPerType = Math.ceil(limit * 0.45);
      const popDiverse = scored.filter((i) => {
        const c = popTypeCounts.get(i.type) || 0;
        if (c >= popMaxPerType) return false;
        popTypeCounts.set(i.type, c + 1);
        return true;
      });

      // Shuffle for freshness on each visit (only on first page)
      const popFinal = offset === 0 ? shuffleAndPick(popDiverse, popDiverse.length) : popDiverse;
      const page = interleaveByType(popFinal).slice(offset, offset + limit);
      const hasMore = popDiverse.length > offset + limit;
      return jsonResponse(page.map(mapItem), hasMore);
    }

    // ── Hidden gems ───────────────────────────────────────────────────
    if (curated === "hidden_gems") {
      const gemBaseWhere: any = { isUpcoming: false, parentItemId: null };
      if (genre) gemBaseWhere.genre = buildGenreFilter(genre);
      if (vibe) gemBaseWhere.vibes = { has: vibe };
      if (excludeIds.length > 0) gemBaseWhere.id = { notIn: excludeIds };

      // FIX 4: Sequel/numbered-entry penalty
      const SEQUEL_RE = /\b(ii|iii|iv|vi|vii|viii)\b|\s(2|3|4|5|remastered|remake)\b/i;
      const CURRENT_YEAR = new Date().getFullYear();
      const excludeClause = excludeIds.length > 0 ? `AND id NOT IN (${excludeIds.join(",")})` : "";

      // FIX 1: Score-ordered raw SQL for manga/books so high-scoring items are never missed.
      // FIX 3: Year-based voteCount ceiling for movie/TV/game to exclude hyped upcoming releases.
      // Pools are always fetched at the relaxed 0.60 floor so FIX 5 can re-rank without re-querying.
      async function fetchGemPool(t: string, quota: number): Promise<any[]> {
        if (t === "manga") {
          // Raw SQL ordered by gem-score formula — prevents recent low-scored imports crowding out older gems
          const mangaIds = await prisma.$queryRawUnsafe<{ id: unknown }[]>(`
            SELECT id FROM items
            WHERE type = 'manga'
            AND is_upcoming = false AND parent_item_id IS NULL
            AND vote_count >= 100 AND vote_count < 5000
            AND (ext->>'mal') IS NOT NULL
            AND (ext->>'mal')::float >= 6.0
            ${excludeClause}
            ORDER BY (ext->>'mal')::float / log(greatest(vote_count::float, 10)) DESC
            LIMIT ${quota * 20}
          `);
          if (mangaIds.length === 0) return [];
          const mangaNumIds = mangaIds.map(r => Number(r.id));
          const mangaItems = await prisma.item.findMany({
            where: {
              id: { in: mangaNumIds },
              ...(genre ? { genre: buildGenreFilter(genre) } : {}),
              ...(vibe ? { vibes: { has: vibe } } : {}),
            },
            select: ITEM_SELECT,
          });
          const mangaOrder = new Map(mangaNumIds.map((id, i) => [id, i]));
          return mangaItems.sort((a, b) => (mangaOrder.get(a.id) ?? 999) - (mangaOrder.get(b.id) ?? 999));
        }

        if (t === "book") {
          // Require vc >= 50 and score < 5.0 to exclude inflated academic/self-published ratings
          const bookIds = await prisma.$queryRawUnsafe<{ id: unknown }[]>(`
            SELECT id FROM items
            WHERE type = 'book'
            AND is_upcoming = false AND parent_item_id IS NULL
            AND vote_count >= 50 AND vote_count < 5000
            AND (ext->>'google_books') IS NOT NULL
            AND (ext->>'google_books')::float >= 3.0
            AND (ext->>'google_books')::float < 5.0
            ${excludeClause}
            ORDER BY (ext->>'google_books')::float / log(greatest(vote_count::float, 10)) DESC
            LIMIT ${quota * 20}
          `);
          if (bookIds.length === 0) return [];
          const bookNumIds = bookIds.map(r => Number(r.id));
          const bookItems = await prisma.item.findMany({
            where: {
              id: { in: bookNumIds },
              ...(genre ? { genre: buildGenreFilter(genre) } : {}),
              ...(vibe ? { vibes: { has: vibe } } : {}),
            },
            select: ITEM_SELECT,
          });
          const bookOrder = new Map(bookNumIds.map((id, i) => [id, i]));
          return bookItems.sort((a, b) => (bookOrder.get(a.id) ?? 999) - (bookOrder.get(b.id) ?? 999));
        }

        // Movie / TV / Game: dual-pool by year — recent items get a tighter voteCount ceiling
        // so highly-anticipated releases (vc 200+) are excluded while true 2025 indie gems pass
        const [recentItems, olderItems] = await Promise.all([
          prisma.item.findMany({
            where: { ...gemBaseWhere, type: t, year: { gte: CURRENT_YEAR - 1 }, voteCount: { gte: 10, lt: 200 } },
            orderBy: { voteCount: "desc" },
            take: quota * 5,
            select: ITEM_SELECT,
          }),
          prisma.item.findMany({
            where: { ...gemBaseWhere, type: t, year: { lt: CURRENT_YEAR - 1 }, voteCount: { gte: 10, lt: 5000 } },
            orderBy: { voteCount: "desc" },
            take: quota * 15,
            select: ITEM_SELECT,
          }),
        ]);
        const seen = new Set<number>();
        const combined: typeof recentItems = [];
        for (const item of [...recentItems, ...olderItems]) {
          if (!seen.has(item.id)) { seen.add(item.id); combined.push(item); }
        }
        return combined;
      }

      function adjustGemScore(title: string, score: number): number {
        return SEQUEL_RE.test(title) ? score * 0.7 : score;
      }

      function rankGems(pool: any[], scoreThreshold: number, quota: number): any[] {
        return pool
          .filter(i =>
            meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }) &&
            normalizeScore(i.ext as any, i.type, i.voteCount || 0) >= scoreThreshold
          )
          .map(i => {
            const norm = normalizeScore(i.ext as any, i.type, i.voteCount || 0);
            const raw = norm / Math.log10(Math.max(i.voteCount || 1, 10));
            return { ...i, gemScore: adjustGemScore(i.title, raw) };
          })
          .sort((a, b) => b.gemScore - a.gemScore)
          .slice(0, quota);
      }

      // Single-type view (paginated)
      if (type) {
        const pool = await fetchGemPool(type, 50);
        let ranked = rankGems(pool, 0.65, offset + limit + 50);
        if (ranked.length < 8) ranked = rankGems(pool, 0.60, offset + limit + 50);
        const page = ranked.slice(offset, offset + limit);
        return jsonResponse(page.map(mapItem), ranked.length > offset + limit);
      }

      // Cross-media view
      const gemTypes: Array<{ t: string; quota: number }> = [
        { t: "movie",  quota: 9 },
        { t: "tv",     quota: 9 },
        { t: "game",   quota: 7 },
        { t: "manga",  quota: 7 },
        { t: "book",   quota: 7 },
      ];

      // Fetch all pools once at the relaxed threshold floor
      const pools = await Promise.all(gemTypes.map(({ t, quota }) => fetchGemPool(t, quota)));

      // FIX 5: try strict threshold first, fall back to relaxed, hide row if still < 8
      let perTypeGems = gemTypes.map(({ quota }, i) => rankGems(pools[i], 0.65, quota));
      if (perTypeGems.flat().length < 8) {
        perTypeGems = gemTypes.map(({ quota }, i) => rankGems(pools[i], 0.60, quota));
        if (perTypeGems.flat().length < 8) {
          return jsonResponse([], false);
        }
      }

      // Shuffle quality pool so hidden gems feel fresh on every visit
      const merged = shuffleAndPick(perTypeGems.flat(), perTypeGems.flat().length);
      const interleaved = interleaveByType(merged);
      const page = interleaved.slice(offset, offset + limit);
      return jsonResponse(page.map(mapItem), interleaved.length > offset + limit);
    }

    // ── For You lazy rows (type-specific, vote-floored, randomized) ───
    if (forYou && type) {
      // Comics have no votes/scores — hide entirely
      if (type === "comic") return jsonResponseNoCache([]);

      // Podcasts: voteCount is always 0; use spotify_popularity instead
      if (type === "podcast") {
        const excludeClausePod = excludeIds.length > 0 ? `AND id NOT IN (${excludeIds.join(",")})` : "";
        const podIds = await prisma.$queryRawUnsafe<{ id: number }[]>(`
          SELECT id FROM items
          WHERE type = 'podcast'
          AND is_upcoming = false AND parent_item_id IS NULL
          AND (ext->>'spotify_popularity') IS NOT NULL
          AND (ext->>'spotify_popularity')::float >= 50
          ${excludeClausePod}
          ORDER BY (ext->>'spotify_popularity')::float DESC
          LIMIT 80
        `);
        if (podIds.length === 0) return jsonResponseNoCache([]);
        const podItems = await prisma.item.findMany({
          where: { id: { in: podIds.map(r => r.id) } },
          select: ITEM_SELECT,
        });
        return jsonResponseNoCache(shuffleAndPick(podItems, Math.min(limit, podItems.length)).map(mapItem));
      }

      // Vote floors per type (data-driven from audit)
      const VOT_FLOOR: Record<string, number> = {
        movie: 1000, tv: 100, game: 500, anime: 1000, manga: 1000, book: 100, music: 10,
      };
      const typeKey = isAnimeFilter ? "anime" : type;
      const minVotes = VOT_FLOOR[typeKey] ?? 50;

      async function fetchForYouPool(voteFloor: number) {
        const fyWhere: any = { ...where };
        if (voteFloor > 0) fyWhere.voteCount = { gte: voteFloor };
        return prisma.item.findMany({ where: fyWhere, orderBy: { voteCount: "desc" }, take: 150, select: ITEM_SELECT });
      }

      let pool = await fetchForYouPool(minVotes);
      let qualified = pool.filter(i => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }));
      if (isAnimeFilter) qualified = qualified.filter(i => isAnime(i as any));
      if (excludeAnime) qualified = qualified.filter(i => !isAnime(i as any));

      // Relax threshold if not enough items
      if (qualified.length < 15 && minVotes > 50) {
        const relaxedFloor = Math.max(Math.floor(minVotes / 5), 10);
        pool = await fetchForYouPool(relaxedFloor);
        let relaxedQ = pool.filter(i => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }));
        if (isAnimeFilter) relaxedQ = relaxedQ.filter(i => isAnime(i as any));
        if (excludeAnime) relaxedQ = relaxedQ.filter(i => !isAnime(i as any));
        if (relaxedQ.length > qualified.length) qualified = relaxedQ;
      }

      if (qualified.length < 5) return jsonResponseNoCache([]);

      // Sort: anime/manga by MAL score, everything else by normalizeScore
      if (isAnimeFilter || type === "manga") {
        qualified.sort((a, b) => ((b.ext as any)?.mal ?? 0) - ((a.ext as any)?.mal ?? 0));
      } else {
        qualified.sort((a, b) =>
          normalizeScore(b.ext as any, b.type, b.voteCount || 0) -
          normalizeScore(a.ext as any, a.type, a.voteCount || 0)
        );
      }

      // Take top 50 quality items then shuffle — fresh each visit
      const topPool = qualified.slice(0, 50);
      const picked = shuffleAndPick(topPool, Math.min(limit, topPool.length));
      return jsonResponseNoCache(picked.map(mapItem));
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
    let ranked = items
      .filter((i) => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }))
      .map((i) => ({
        ...i,
        rank: qualityRank({ ext: i.ext as any, type: i.type, year: i.year, voteCount: i.voteCount }),
      }));

    // Re-sort by quality rank if using default sort
    if (sort === "quality") {
      ranked.sort((a, b) => b.rank - a.rank);
    }

    if (isAnimeFilter) ranked = ranked.filter((i: any) => isAnime(i));

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
    desc: truncateDesc(item.description),
    people: (item.people || []).slice(0, 3),
    awards: [], platforms: [],
    ext: slimExt(item.ext), totalEp: item.totalEp || 0,
    voteCount: item.voteCount || 0,
    malId: item.malId ?? null,
  };
}
