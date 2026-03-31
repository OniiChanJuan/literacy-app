import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";
import { searchTmdb, searchTmdbByPerson, tmdbItemId } from "@/lib/tmdb";
import { searchIgdb, igdbItemId } from "@/lib/igdb";
import { searchGoogleBooks, searchGoogleBooksByAuthor, gbookItemId } from "@/lib/google-books";
import { searchSpotify, spotifyItemId } from "@/lib/spotify";
import { searchJikanManga, searchJikanAnime, jikanItemId } from "@/lib/jikan";
import { searchComicVine, cvItemId } from "@/lib/comicvine";

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
  if (t.includes(q)) return 0.7; // Query is substring
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
    // All query words appear in name
    if (qWords.length > 0 && qWords.every((w) => name.includes(w))) { best = Math.max(best, 0.75); continue; }
    // At least one meaningful word matches (length > 3 to skip "the", "of", etc.)
    if (qWords.some((w) => w.length > 3 && name.includes(w))) { best = Math.max(best, 0.45); }
  }
  return best;
}

function computeSearchRank(item: any, query: string): number {
  const titleScore = titleMatchScore(item.title || "", query);
  const creatorScore = creatorMatchScore(item.people, query);
  const pop = Math.log10((item.popularityScore || item.voteCount || 0) + 1);
  const maxPop = 6; // ~1M votes
  const popNorm = Math.min(pop / maxPop, 1.0);

  // Quality from ext scores
  let qualityNorm = 0.5;
  if (item.ext && typeof item.ext === "object") {
    const scores = Object.values(item.ext) as number[];
    if (scores.length > 0) {
      const best = Math.max(...scores);
      qualityNorm = Math.min(best / 10, 1.0);
    }
  }

  // Weights: title=50, creator=25, popularity=30, quality=20
  return (titleScore * 50) + (creatorScore * 25) + (popNorm * 30) + (qualityNorm * 20);
}

// GET /api/search?q=query&grouped=true
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`search:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const grouped = req.nextUrl.searchParams.get("grouped") === "true";

  if (!q || q.length < 2) {
    return NextResponse.json(grouped ? { groups: {}, franchise: null, suggestions: [] } : []);
  }

  const queryLower = q.toLowerCase();
  const queryNorm = q.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();

  // ── Local DB search: exact + fuzzy ──────────────────────────────────
  let dbResults: any[] = [];
  let peopleItems: any[] = []; // hoisted so isCreatorSearch can reference it below
  try {
    // First: exact/substring matches (fast)
    const exact = await prisma.item.findMany({
      where: {
        parentItemId: null,
        title: { contains: q, mode: "insensitive" },
      },
      select: {
        id: true, title: true, type: true, genre: true, vibes: true,
        year: true, cover: true, description: true, ext: true, totalEp: true,
        people: true, awards: true, platforms: true, isUpcoming: true,
        popularityScore: true, voteCount: true,
      },
      take: 40,
      orderBy: [{ popularityScore: "desc" }],
    });

    // Second: fuzzy matches using pg_trgm (catches typos)
    let fuzzyIds: number[] = [];
    if (exact.length < 10) {
      try {
        const fuzzy: any[] = await prisma.$queryRawUnsafe(
          `SELECT id FROM items
           WHERE parent_item_id IS NULL
           AND similarity(lower(title), lower($1)) > 0.3
           AND id NOT IN (SELECT unnest($2::int[]))
           ORDER BY similarity(lower(title), lower($1)) DESC
           LIMIT 15`,
          q,
          exact.map((e) => e.id),
        );
        fuzzyIds = fuzzy.map((f: any) => f.id);
      } catch {
        // pg_trgm might not be available — skip fuzzy
      }
    }

    let fuzzyItems: any[] = [];
    if (fuzzyIds.length > 0) {
      fuzzyItems = await prisma.item.findMany({
        where: { id: { in: fuzzyIds }, parentItemId: null },
        select: {
          id: true, title: true, type: true, genre: true, vibes: true,
          year: true, cover: true, description: true, ext: true, totalEp: true,
          people: true, awards: true, platforms: true, isUpcoming: true,
          popularityScore: true, voteCount: true, slug: true,
        },
      });
    }

    // Also check people names (author/director/artist/studio search)
    // Uses jsonb to match only the 'name' field, not role strings.
    // No word-count guard — single-word creator names like "MAPPA", "Radiohead", "Ghibli" must work.
    const alreadyFound = new Set([...exact.map((e) => e.id), ...fuzzyItems.map((f) => f.id)]);
    try {
      const pResults: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM items
         WHERE parent_item_id IS NULL
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(people) pe
             WHERE pe->>'name' ILIKE $1
           )
           AND id != ALL($2::int[])
         ORDER BY popularity_score DESC
         LIMIT 30`,
        `%${q}%`,
        [...alreadyFound],
      );
      const pIds = pResults.map((r: any) => r.id);
      if (pIds.length > 0) {
        peopleItems = await prisma.item.findMany({
          where: { id: { in: pIds }, parentItemId: null },
          select: {
            id: true, title: true, type: true, genre: true, vibes: true,
            year: true, cover: true, description: true, ext: true, totalEp: true,
            people: true, awards: true, platforms: true, isUpcoming: true,
            popularityScore: true, voteCount: true,
          },
        });
      }
    } catch { /* skip */ }

    const seenIds = new Set<number>();
    dbResults = [...exact, ...fuzzyItems, ...peopleItems]
      .filter((item) => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      })
      .map((item) => ({
        ...item,
        desc: item.description,
        source: "local",
        routeId: String(item.id),
        sourceLabel: "Your catalog",
        searchRank: computeSearchRank(item, q),
      }));
  } catch { /* DB error — continue with API results */ }

  // ── Franchise detection ─────────────────────────────────────────────
  let franchiseMatch: { id: number; name: string; icon: string; itemCount: number; typeCount: number } | null = null;
  try {
    const franchises = await prisma.franchise.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, icon: true, items: { select: { item: { select: { type: true } } } } },
      take: 3,
    });
    if (franchises.length > 0) {
      const f = franchises[0];
      const types = new Set(f.items.map((fi) => fi.item.type));
      franchiseMatch = { id: f.id, name: f.name, icon: f.icon, itemCount: f.items.length, typeCount: types.size };
    }
  } catch { /* skip */ }

  // ── Genre/vibe suggestion ───────────────────────────────────────────
  const suggestions: { type: "genre" | "vibe"; value: string; label: string }[] = [];
  const genres = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Thriller", "Romance", "Fantasy", "Mystery", "Crime", "Animation", "Documentary", "RPG", "Adventure", "Platformer", "Strategy"];
  const vibes = ["Dark", "Atmospheric", "Epic", "Mind-Bending", "Wholesome", "Intense", "Slow Burn", "Emotional", "Gritty", "Surreal"];
  for (const g of genres) {
    if (g.toLowerCase().includes(queryLower) || queryLower.includes(g.toLowerCase())) {
      suggestions.push({ type: "genre", value: g, label: `Browse all ${g} titles` });
    }
  }
  for (const v of vibes) {
    if (v.toLowerCase().includes(queryLower) || queryLower.includes(v.toLowerCase())) {
      suggestions.push({ type: "vibe", value: v, label: `Browse ${v} titles` });
    }
  }

  // ── Build dedup set ─────────────────────────────────────────────────
  const localTitles = new Set(dbResults.map((r: any) => `${(r.title || "").toLowerCase()}-${r.year}`));

  // ── Detect creator search: did the people query return results? ──────
  // Used to decide whether to fire creator-specific external API calls.
  const isCreatorSearch = peopleItems.length > 0;
  const peopleTypes = new Set(peopleItems.map((i: any) => i.type));

  // ── External API searches (parallel) ────────────────────────────────
  const localByType: Record<string, number> = {};
  dbResults.forEach((r: any) => { localByType[r.type] = (localByType[r.type] || 0) + 1; });

  // Count local books that actually match the query well (title score >= 0.5).
  const relevantLocalBooks = dbResults.filter(
    (r: any) => r.type === "book" && titleMatchScore(r.title || "", q) >= 0.5
  ).length;

  const apiPromises: Promise<any[]>[] = [];

  // Standard title-based TMDB search (movies + TV)
  apiPromises.push(
    searchTmdb(q).then((items) => items.map((item) => ({
      ...item, source: "tmdb", routeId: tmdbItemId(item.type as "movie" | "tv", item.id), sourceLabel: "TMDB",
    }))).catch(() => [])
  );

  // Creator-specific: TMDB person search (director/creator filmography)
  // Fire when people search found movie/TV matches, or when DB has few movie/TV results
  if (isCreatorSearch && (peopleTypes.has("movie") || peopleTypes.has("tv") || (localByType["movie"] || 0) < 3)) {
    apiPromises.push(
      searchTmdbByPerson(q).then((items) => items.map((item) => ({
        ...item, source: "tmdb", routeId: tmdbItemId(item.type as "movie" | "tv", item.id), sourceLabel: "TMDB",
      }))).catch(() => [])
    );
  }

  if ((localByType["game"] || 0) < 3) {
    apiPromises.push(
      searchIgdb(q).then((items) => items.map((item) => ({
        ...item, source: "igdb", routeId: igdbItemId(item.id), sourceLabel: "IGDB",
      }))).catch(() => [])
    );
  }

  // Title-based Google Books search
  if (relevantLocalBooks < 3) {
    apiPromises.push(
      searchGoogleBooks(q).then((items) => items.filter((i) => i.cover).map((item) => ({
        ...item, source: "gbook", routeId: gbookItemId(item.volumeId), sourceLabel: "Google Books",
      }))).catch(() => [])
    );
  }

  // Creator-specific: inauthor: Google Books search
  // Fire when people search found books, or title search returned few books
  if (isCreatorSearch && (peopleTypes.has("book") || relevantLocalBooks < 3)) {
    apiPromises.push(
      searchGoogleBooksByAuthor(q).then((items) => items.filter((i) => i.cover).map((item) => ({
        ...item, source: "gbook", routeId: gbookItemId(item.volumeId), sourceLabel: "Google Books",
      }))).catch(() => [])
    );
  }

  apiPromises.push(
    searchSpotify(q).then((items) => items.filter((i) => i.cover).map((item) => ({
      ...item, source: "spotify", routeId: spotifyItemId(item.spotifyType, item.spotifyId), sourceLabel: "Spotify",
    }))).catch(() => [])
  );

  if ((localByType["manga"] || 0) < 3) {
    apiPromises.push(
      searchJikanManga(q).then((items) => items.filter((i) => i.cover).map((item) => ({
        ...item, source: "jikan", routeId: jikanItemId("manga", item.malId), sourceLabel: "MAL",
      }))).catch(() => [])
    );
  }

  apiPromises.push(
    searchJikanAnime(q).then((items) => items.filter((i) => i.cover).map((item) => ({
      ...item, source: "jikan", routeId: jikanItemId("anime", item.malId), sourceLabel: "MAL",
    }))).catch(() => [])
  );

  if ((localByType["comic"] || 0) < 3) {
    apiPromises.push(
      searchComicVine(q).then((items) => items.filter((i) => i.cover).map((item) => ({
        ...item, source: "comicvine", routeId: cvItemId(item.cvId), sourceLabel: "Comic Vine",
      }))).catch(() => [])
    );
  }

  const apiResultArrays = await Promise.all(apiPromises);
  const apiResults = apiResultArrays.flat()
    .filter((item) => !localTitles.has(`${(item.title || "").toLowerCase()}-${item.year}`))
    .map((item) => ({ ...item, searchRank: computeSearchRank(item, q) }));

  // ── Combine and sort ────────────────────────────────────────────────
  const all = [...dbResults, ...apiResults].sort((a, b) => b.searchRank - a.searchRank);

  if (!grouped) {
    // Flat response for backward compatibility
    const res = NextResponse.json(all.slice(0, 50));
    res.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res;
  }

  // ── Grouped response ────────────────────────────────────────────────
  const bestMatch = all[0] || null;

  const groups: Record<string, any[]> = {};
  const typeLabels: Record<string, string> = {
    movie: "Movies", tv: "TV Shows", book: "Books", manga: "Manga",
    comic: "Comics", game: "Games", music: "Music", podcast: "Podcasts",
  };

  for (const item of all) {
    const type = item.type || "other";
    if (!groups[type]) groups[type] = [];
    if (groups[type].length < 12) {
      groups[type].push(item);
    }
  }

  // Remove empty groups and sort by result count
  const sortedGroups: Record<string, { label: string; items: any[] }> = {};
  Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([type, items]) => {
      sortedGroups[type] = { label: typeLabels[type] || type, items };
    });

  // ── Creator match detection ──────────────────────────────────────────
  // If 3+ results share the same creator whose name matches the query,
  // surface that as a header so the UI can label those results.
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
      const [topName, topData] = [...creatorCounts.entries()]
        .sort(([, a], [, b]) => b.count - a.count)[0];
      if (topData.count >= 3) {
        creatorMatch = { name: topName, role: topData.role, itemCount: topData.count };
      }
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
