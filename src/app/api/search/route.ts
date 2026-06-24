import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";
import { searchTmdb, searchTmdbByPerson, tmdbItemId } from "@/lib/tmdb";
import { searchIgdb, igdbItemId } from "@/lib/igdb";
import { searchGoogleBooks, searchGoogleBooksByAuthor, gbookItemId } from "@/lib/google-books";
import { searchSpotify, spotifyItemId } from "@/lib/spotify";
import { searchJikanManga, searchJikanAnime, jikanItemId } from "@/lib/jikan";
import { searchComicVine, cvItemId } from "@/lib/comicvine";

// Per-media-type display cap.
const MAX_RESULTS_PER_TYPE = 20;

// ── Title match scoring ─────────────────────────────────────────────────
function titleMatchScore(title: string, query: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase();

  if (t === q) return 1.0; // Exact match
  if (t.startsWith(q)) return 0.9; // Starts with
  // Handle variant spellings: 'spiderman' → 'spider-man', 'dragonball' → 'dragon ball'
  const tNorm = t.replace(/[^a-zA-Z0-9]+/g, "");
  const qNorm = q.replace(/[^a-zA-Z0-9]+/g, "");
  if (tNorm === qNorm) return 0.95;
  if (tNorm.startsWith(qNorm)) return 0.85;
  if (t.includes(q)) {
    // Coverage: a query that is most of the title (e.g. "dark knight" inside
    // "The Dark Knight") is a far stronger match than one that's a small
    // fragment of a longer title ("dark knight" inside "Time-Limited Genius
    // Dark Knight"). Scale 0.7→0.9 by how much of the title the query covers,
    // so the canonical title wins cross-type ties instead of relying on raw
    // popularity.
    return 0.7 + 0.2 * Math.min(1, q.length / Math.max(t.length, 1));
  }
  // All query words appear in title
  const qWords = q.split(/\s+/).filter((w) => w.length > 1);
  if (qWords.length > 1 && qWords.every((w) => t.includes(w))) return 0.6;
  if (qWords.some((w) => t.includes(w))) return 0.3;
  return 0.1; // Match was in description/people only
}

/** Score how well a creator/people field matches the query (0–1). */
function creatorMatchScore(people: any, query: string): number {
  if (!people || !Array.isArray(people)) return 0;
  const q = query.toLowerCase();
  const qWords = q.split(/\s+/).filter((w) => w.length > 2);
  let best = 0;
  for (const p of people) {
    const name = (p.name || "").toLowerCase();
    if (!name) continue;
    if (name === q) { best = 1.0; break; }
    if (name.includes(q) || q.includes(name)) { best = Math.max(best, 0.85); continue; }
    if (qWords.length > 0 && qWords.every((w) => name.includes(w))) { best = Math.max(best, 0.75); continue; }
    if (qWords.some((w) => w.length > 3 && name.includes(w))) { best = Math.max(best, 0.45); }
  }
  return best;
}

// Per-type popularity ceilings (log10 of a "popular" count for that medium).
// Raw counts aren't comparable across media — MAL `scored_by` runs to millions
// while TMDB votes run to tens of thousands — so without per-type normalization
// anime/manga over-rank everything in cross-type ties. Normalizing to "popular
// within its own type → ~1.0" fixes that (e.g. an obscure manga no longer
// out-pops The Dark Knight).
const POP_CEILING: Record<string, number> = {
  movie: 4.3, tv: 4.3, game: 3.6, book: 3.2,
  manga: 6.0, music: 2.5, podcast: 2.5, comic: 3.0,
};

function computeSearchRank(item: any, query: string): number {
  const titleScore = titleMatchScore(item.title || "", query);
  const creatorScore = creatorMatchScore(item.people, query);
  const pop = Math.log10((item.popularityScore || item.voteCount || 0) + 1);
  const ceiling = POP_CEILING[item.type] ?? 4.5;
  const popNorm = Math.min(pop / ceiling, 1.0);

  // Quality from ext scores
  let qualityNorm = 0.5;
  if (item.ext && typeof item.ext === "object") {
    // Only numeric ext values are scores (ext.nyt is a structured object).
    const scores = (Object.values(item.ext) as unknown[]).filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v)
    );
    if (scores.length > 0) {
      qualityNorm = Math.min(Math.max(...scores) / 10, 1.0);
    }
  }

  // Weights: title=50, creator=25, popularity=30, quality=20
  return (titleScore * 50) + (creatorScore * 25) + (popNorm * 30) + (qualityNorm * 20);
}

/**
 * A live-API result is kept only if it actually matches the query by title or
 * creator. Live APIs (especially Jikan) return *popular* items even when they
 * barely match — this stops a trending anime being injected into a book query
 * (e.g. "the overstory" pulling in Haikyu!!).
 */
function externalRelevant(item: any, query: string): boolean {
  return titleMatchScore(item.title || "", query) >= 0.35
      || creatorMatchScore(item.people, query) >= 0.6;
}

const ITEM_SELECT = {
  id: true, title: true, type: true, genre: true, vibes: true,
  year: true, cover: true, description: true, ext: true, totalEp: true,
  people: true, awards: true, platforms: true, isUpcoming: true,
  popularityScore: true, voteCount: true, slug: true,
} as const;

// GET /api/search?q=query&grouped=true&scope=local|external|all
//
// scope=local    → indexed DB results only (instant; the common case).
// scope=external → live third-party APIs only (the non-blocking follow-up the
//                  client merges in, so the genuinely-obscure is still reachable).
// scope=all      → both in one blocking response (default; backward-compatible).
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`search:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const grouped = req.nextUrl.searchParams.get("grouped") === "true";
  const scope = (req.nextUrl.searchParams.get("scope") || "all") as "local" | "external" | "all";
  const doLocal = scope !== "external";
  const doExternal = scope !== "local";

  if (!q || q.length < 2) {
    return NextResponse.json(grouped ? { groups: {}, franchise: null, suggestions: [] } : []);
  }

  const queryLower = q.toLowerCase();

  // ── People query (creator detection) ────────────────────────────────
  // Runs for any search so creator-specific external calls fire correctly even
  // in external-only scope. Its local items are only added to results in a
  // local pass (the external pass returns API items only).
  let peopleItems: any[] = [];

  // ── Local DB search: exact + fuzzy + people ─────────────────────────
  let dbResults: any[] = [];
  let franchiseMatch: { id: number; name: string; icon: string; itemCount: number; typeCount: number } | null = null;
  try {
    let exact: any[] = [];
    let fuzzyItems: any[] = [];

    if (doLocal) {
      // First: exact/substring (index-accelerated via the title trgm GIN index).
      exact = await prisma.item.findMany({
        where: { parentItemId: null, title: { contains: q, mode: "insensitive" } },
        select: ITEM_SELECT,
        take: 40,
        orderBy: [{ popularityScore: "desc" }],
      });

      // Second: fuzzy (pg_trgm). Short queries are the noise hotspot: a <6-char
      // query that already resolved via exact skips fuzzy entirely; otherwise a
      // tight threshold. The `title % $1` predicate uses the trgm index (default
      // 0.3 threshold) and the explicit `similarity > $3` (always ≥0.3) refines.
      const shortQuery = q.length < 6;
      const fuzzyThreshold = shortQuery ? 0.45 : Math.max(0.30, 0.50 - q.length * 0.02);
      const skipFuzzy = shortQuery && exact.length > 0;
      let fuzzyIds: number[] = [];
      if (exact.length < 10 && !skipFuzzy) {
        try {
          const fuzzy: any[] = await prisma.$queryRawUnsafe(
            `SELECT id FROM items
             WHERE parent_item_id IS NULL
               AND title % $1
               AND similarity(title, $1) > $3
               AND id NOT IN (SELECT unnest($2::int[]))
             ORDER BY similarity(title, $1) DESC
             LIMIT 15`,
            q, exact.map((e) => e.id), fuzzyThreshold,
          );
          fuzzyIds = fuzzy.map((f: any) => f.id);
        } catch { /* pg_trgm unavailable — skip fuzzy */ }
      }
      if (fuzzyIds.length > 0) {
        fuzzyItems = await prisma.item.findMany({
          where: { id: { in: fuzzyIds }, parentItemId: null },
          select: ITEM_SELECT,
        });
      }
    }

    // People-name search (author/director/artist/studio). Runs in local and
    // external scope (for creator detection); single-word names must work.
    const alreadyFound = new Set([...exact.map((e) => e.id), ...fuzzyItems.map((f) => f.id)]);
    try {
      const pResults: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM items
         WHERE parent_item_id IS NULL
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(people) pe WHERE pe->>'name' ILIKE $1)
           AND id != ALL($2::int[])
         ORDER BY popularity_score DESC
         LIMIT 30`,
        `%${q}%`, [...alreadyFound],
      );
      const pIds = pResults.map((r: any) => r.id);
      if (pIds.length > 0) {
        peopleItems = await prisma.item.findMany({
          where: { id: { in: pIds }, parentItemId: null },
          select: ITEM_SELECT,
        });
      }
    } catch { /* skip */ }

    if (doLocal) {
      const seenIds = new Set<number>();
      dbResults = [...exact, ...fuzzyItems, ...peopleItems]
        .filter((item) => { if (seenIds.has(item.id)) return false; seenIds.add(item.id); return true; })
        .map((item) => ({
          ...item, desc: item.description, source: "local",
          routeId: String(item.id), sourceLabel: "Your catalog",
          searchRank: computeSearchRank(item, q),
        }));

      // Franchise detection (DB)
      try {
        const franchises = await prisma.franchise.findMany({
          where: { name: { contains: q, mode: "insensitive" } },
          select: { id: true, name: true, icon: true, items: { select: { item: { select: { type: true } } } } },
          take: 3,
        });
        if (franchises.length > 0) {
          const f = franchises[0];
          franchiseMatch = { id: f.id, name: f.name, icon: f.icon, itemCount: f.items.length, typeCount: new Set(f.items.map((fi) => fi.item.type)).size };
        }
      } catch { /* skip */ }
    }
  } catch { /* DB error — continue */ }

  // ── Genre/vibe suggestions (static, cheap) ──────────────────────────
  const suggestions: { type: "genre" | "vibe"; value: string; label: string }[] = [];
  const genres = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Thriller", "Romance", "Fantasy", "Mystery", "Crime", "Animation", "Documentary", "RPG", "Adventure", "Platformer", "Strategy"];
  const vibes = ["Dark", "Atmospheric", "Epic", "Mind-Bending", "Wholesome", "Intense", "Slow Burn", "Emotional", "Gritty", "Surreal"];
  for (const g of genres) if (g.toLowerCase().includes(queryLower) || queryLower.includes(g.toLowerCase())) suggestions.push({ type: "genre", value: g, label: `Browse all ${g} titles` });
  for (const v of vibes) if (v.toLowerCase().includes(queryLower) || queryLower.includes(v.toLowerCase())) suggestions.push({ type: "vibe", value: v, label: `Browse ${v} titles` });

  // ── External API searches (parallel) ────────────────────────────────
  const localTitles = new Set(dbResults.map((r: any) => `${(r.title || "").toLowerCase()}-${r.year}`));
  let apiResults: any[] = [];
  if (doExternal) {
    const localByType: Record<string, number> = {};
    dbResults.forEach((r: any) => { localByType[r.type] = (localByType[r.type] || 0) + 1; });
    const relevantLocalBooks = dbResults.filter((r: any) => r.type === "book" && titleMatchScore(r.title || "", q) >= 0.5).length;
    const isCreatorSearch = peopleItems.length > 0;
    const peopleTypes = new Set(peopleItems.map((i: any) => i.type));
    // In external-only scope localByType is empty, so all gates fire (we want a
    // wide net); the relevance filter below trims the noise.

    const apiPromises: Promise<any[]>[] = [];
    apiPromises.push(searchTmdb(q).then((items) => items.map((item) => ({ ...item, source: "tmdb", routeId: tmdbItemId(item.type as "movie" | "tv", item.id), sourceLabel: "TMDB" }))).catch(() => []));
    if (isCreatorSearch && (peopleTypes.has("movie") || peopleTypes.has("tv") || (localByType["movie"] || 0) < 3)) {
      apiPromises.push(searchTmdbByPerson(q).then((items) => items.map((item) => ({ ...item, source: "tmdb", routeId: tmdbItemId(item.type as "movie" | "tv", item.id), sourceLabel: "TMDB" }))).catch(() => []));
    }
    if ((localByType["game"] || 0) < 3) apiPromises.push(searchIgdb(q).then((items) => items.map((item) => ({ ...item, source: "igdb", routeId: igdbItemId(item.id), sourceLabel: "IGDB" }))).catch(() => []));
    if (relevantLocalBooks < 3) apiPromises.push(searchGoogleBooks(q).then((items) => items.filter((i) => i.cover).map((item) => ({ ...item, source: "gbook", routeId: gbookItemId(item.volumeId), sourceLabel: "Google Books" }))).catch(() => []));
    if (isCreatorSearch && (peopleTypes.has("book") || relevantLocalBooks < 3)) {
      apiPromises.push(searchGoogleBooksByAuthor(q).then((items) => items.filter((i) => i.cover).map((item) => ({ ...item, source: "gbook", routeId: gbookItemId(item.volumeId), sourceLabel: "Google Books" }))).catch(() => []));
    }
    apiPromises.push(searchSpotify(q).then((items) => items.filter((i) => i.cover).map((item) => ({ ...item, source: "spotify", routeId: spotifyItemId(item.spotifyType, item.spotifyId), sourceLabel: "Spotify" }))).catch(() => []));
    if ((localByType["manga"] || 0) < 3) apiPromises.push(searchJikanManga(q).then((items) => items.filter((i) => i.cover).map((item) => ({ ...item, source: "jikan", routeId: jikanItemId("manga", item.malId), sourceLabel: "MAL" }))).catch(() => []));
    // Jikan anime — gated on local tv coverage (no longer fired on EVERY query;
    // its trending-anime results were the main cross-type noise source).
    if ((localByType["tv"] || 0) < 3) apiPromises.push(searchJikanAnime(q).then((items) => items.filter((i) => i.cover).map((item) => ({ ...item, source: "jikan", routeId: jikanItemId("anime", item.malId), sourceLabel: "MAL" }))).catch(() => []));
    if ((localByType["comic"] || 0) < 3) apiPromises.push(searchComicVine(q).then((items) => items.filter((i) => i.cover).map((item) => ({ ...item, source: "comicvine", routeId: cvItemId(item.cvId), sourceLabel: "Comic Vine" }))).catch(() => []));

    const apiResultArrays = await Promise.all(apiPromises);
    apiResults = apiResultArrays.flat()
      .filter((item) => !localTitles.has(`${(item.title || "").toLowerCase()}-${item.year}`))
      .filter((item) => externalRelevant(item, q)) // drop popular-but-irrelevant API noise
      .map((item) => ({ ...item, searchRank: computeSearchRank(item, q) }));
  }

  // ── Combine and sort ────────────────────────────────────────────────
  const all = [...dbResults, ...apiResults].sort((a, b) => b.searchRank - a.searchRank);

  if (!grouped) {
    const res = NextResponse.json(all.slice(0, 50));
    res.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res;
  }

  // ── Grouped response ────────────────────────────────────────────────
  const bestMatch = all[0] || null;
  const groups: Record<string, any[]> = {};
  const groupTotals: Record<string, number> = {};
  const typeLabels: Record<string, string> = {
    movie: "Movies", tv: "TV Shows", book: "Books", manga: "Manga",
    comic: "Comics", game: "Games", music: "Music", podcast: "Podcasts",
  };

  for (const item of all) {
    const type = item.type || "other";
    if (!groups[type]) groups[type] = [];
    groupTotals[type] = (groupTotals[type] || 0) + 1;
    if (groups[type].length < MAX_RESULTS_PER_TYPE) groups[type].push(item);
  }

  // Order groups by RELEVANCE (the rank of each type's best item — `all` is
  // already sorted, so groups[type][0] is that type's top hit), not by raw
  // result count, so the type holding the best match leads.
  const sortedGroups: Record<string, { label: string; items: any[]; totalResults: number }> = {};
  Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .sort(([, a], [, b]) => (b[0]?.searchRank ?? 0) - (a[0]?.searchRank ?? 0))
    .forEach(([type, items]) => {
      sortedGroups[type] = { label: typeLabels[type] || type, items, totalResults: groupTotals[type] ?? items.length };
    });

  // ── Creator match detection ─────────────────────────────────────────
  let creatorMatch: { name: string; role: string; itemCount: number } | null = null;
  {
    const qLower = q.toLowerCase();
    const creatorCounts = new Map<string, { count: number; role: string }>();
    for (const item of all) {
      if (!item.people || !Array.isArray(item.people)) continue;
      for (const p of item.people) {
        const name = (p.name || "").toLowerCase();
        if (!name || name.length < 2) continue;
        if (name.includes(qLower) || qLower.includes(name)) {
          const existing = creatorCounts.get(p.name) || { count: 0, role: p.role || "" };
          creatorCounts.set(p.name, { count: existing.count + 1, role: existing.role });
        }
      }
    }
    if (creatorCounts.size > 0) {
      const [topName, topData] = [...creatorCounts.entries()].sort(([, a], [, b]) => b.count - a.count)[0];
      if (topData.count >= 3) creatorMatch = { name: topName, role: topData.role, itemCount: topData.count };
    }
  }

  const res = NextResponse.json({
    bestMatch,
    groups: sortedGroups,
    franchise: franchiseMatch,
    creatorMatch,
    suggestions: suggestions.slice(0, 3),
    totalResults: all.length,
  });
  res.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  return res;
}
