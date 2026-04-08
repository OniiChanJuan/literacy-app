import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import { normalizeScore, meetsQualityFloor, interleaveByType } from "@/lib/ranking";
import { tasteSimilarity, neutralDimensions, type TasteDimensions } from "@/lib/taste-dimensions";

/** Fisher-Yates shuffle — returns a new shuffled array sliced to `count` */
function shuffleAndPick<T>(arr: T[], count: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

const ITEM_SELECT = {
  id: true, title: true, type: true, genre: true, vibes: true,
  year: true, cover: true, description: true, people: true,
  ext: true, totalEp: true,
  popularityScore: true, voteCount: true, itemDimensions: true, malId: true,
} as const;

// Only the ext keys Card/HoverPreview actually read. Drops bulky API payload data.
const CARD_EXT_KEYS = [
  "imdb", "tmdb", "mal", "igdb", "igdb_critics", "google_books",
  "rt_critics", "metacritic", "pitchfork", "ign", "spotify_popularity",
  "aoty", "opencritic", "anilist",
  "steam", "steam_label",
  "igdb_count", "igdb_critics_count", // needed by scorePassesThreshold
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

// ── In-memory candidate pool cache ───────────────────────────────────────
// The top-3000 pool is the same for every user. Cache it for 120s so
// concurrent For You requests don't each hammer Postgres.
type Candidate = Awaited<ReturnType<typeof fetchCandidatesFromDb>>[number];
let CANDIDATE_CACHE: { data: Candidate[]; expires: number } | null = null;
let CANDIDATE_INFLIGHT: Promise<Candidate[]> | null = null;
const CANDIDATE_TTL_MS = 120_000;

async function fetchCandidatesFromDb() {
  return prisma.item.findMany({
    where: { isUpcoming: false, parentItemId: null },
    orderBy: { voteCount: "desc" },
    take: 3000,
    select: ITEM_SELECT,
  });
}

async function getCandidatePool(): Promise<Candidate[]> {
  const now = Date.now();
  if (CANDIDATE_CACHE && CANDIDATE_CACHE.expires > now) {
    return CANDIDATE_CACHE.data;
  }
  // Deduplicate concurrent refreshes — one DB query wins, others await it
  if (CANDIDATE_INFLIGHT) return CANDIDATE_INFLIGHT;
  CANDIDATE_INFLIGHT = fetchCandidatesFromDb()
    .then((data) => {
      CANDIDATE_CACHE = { data, expires: Date.now() + CANDIDATE_TTL_MS };
      return data;
    })
    .finally(() => { CANDIDATE_INFLIGHT = null; });
  return CANDIDATE_INFLIGHT;
}

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

  const claims = await getClaims();
  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  if (!claims?.sub) {
    if (section) return NextResponse.json([]);
    return NextResponse.json({ personalPicks: [], discoverAcrossMedia: [], tasteProfile: null });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { tasteProfile: true },
    });

    const tasteProfile = (user?.tasteProfile as unknown as TasteDimensions) || null;
    if (!tasteProfile) {
      if (section) return NextResponse.json([]);
      return NextResponse.json({ personalPicks: [], discoverAcrossMedia: [], tasteProfile: null });
    }

    // Get user's rated items to exclude + learn preferred types + top genres
    const ratings = await prisma.rating.findMany({
      where: { userId: claims.sub },
      select: { itemId: true, score: true, item: { select: { type: true, genre: true } } },
    });

    const ratedIds = new Set(ratings.map((r) => r.itemId));
    const ratingCount = ratings.length;

    // Compute top genres (weight higher-rated items double)
    const genreCounts: Record<string, number> = {};
    for (const r of ratings) {
      for (const g of (r.item.genre || [])) {
        genreCounts[g] = (genreCounts[g] || 0) + (r.score >= 4 ? 2 : 1);
      }
    }
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([g]) => g);

    if (ratingCount < 5) {
      if (section) return NextResponse.json([]);
      return NextResponse.json({ personalPicks: [], discoverAcrossMedia: [], tasteProfile, topGenres });
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
      where: { userId: claims.sub },
      select: { itemId: true },
    });
    const dismissedIds = new Set(dismissed.map((d) => d.itemId));

    // Fetch candidate pool — top 3,000 most-voted items, cached in-memory
    // for 120s across users (pool is the same for everyone; only scoring is per-user).
    const candidates = await getCandidatePool();

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
      // Meaningful dimensions: at least one value deviates > 0.05 from neutral 0.5
      const dims = c.itemDimensions as Record<string, number> | null;
      const hasMeaningfulDimensions = !!(dims && Object.values(dims).some((v) => Math.abs(v - 0.5) > 0.05));
      let dimScore = 0;
      if (hasMeaningfulDimensions) {
        dimScore = tasteSimilarity(tasteProfile, c.itemDimensions as unknown as TasteDimensions);
      }

      const norm = normalizeScore(c.ext as any, c.type, c.voteCount ?? 0);
      const quality = norm > 0 ? norm : 0.5;
      const votes = c.voteCount ?? 0;

      // False-positive penalty: perfect or near-perfect score from a tiny sample
      const isPerfectLowSample = norm >= 0.99 && votes < 500;
      const isSuspiciousHigh = norm > 0.9 && votes < 100;
      const adjustedQuality = (isPerfectLowSample || isSuspiciousHigh) ? quality * 0.5 : quality;

      // Items without meaningful taste dimensions get a heavy penalty so genuine
      // taste matches surface first. Default-0.5 dimensions carry no signal.
      const score = hasMeaningfulDimensions
        ? (dimScore * 0.6 + adjustedQuality * 0.4)
        : (adjustedQuality * 0.2);
      return { item: c, score, dimScore };
    });

    scored.sort((a, b) => b.score - a.score);

    // ─── Section-based paginated response ───
    if (section === "personalPicks") {
      // Build quality pool of top 80 (max 25% per type), then shuffle for freshness
      const POOL_SIZE = 80;
      const pool: any[] = [];
      const poolTypeCounts: Record<string, number> = {};
      const maxPerTypePool = Math.ceil(POOL_SIZE * 0.25);

      for (const s of scored) {
        const tc = poolTypeCounts[s.item.type] || 0;
        if (tc >= maxPerTypePool) continue;
        poolTypeCounts[s.item.type] = tc + 1;
        pool.push(s.item);
        if (pool.length >= POOL_SIZE) break;
      }

      // Shuffle pool then pick `limit` items respecting type diversity (max 20% per type)
      const shuffled = shuffleAndPick(pool, POOL_SIZE);
      const picked: any[] = [];
      const pickedTypeCounts: Record<string, number> = {};
      const maxPerTypePick = Math.max(Math.ceil(limit * 0.20), 3);

      for (const item of shuffled) {
        const tc = pickedTypeCounts[item.type] || 0;
        if (tc >= maxPerTypePick) continue;
        pickedTypeCounts[item.type] = tc + 1;
        picked.push(item);
        if (picked.length >= limit) break;
      }

      const page = interleaveByType(picked).map(mapItem);
      const res = NextResponse.json(page);
      res.headers.set("Cache-Control", "private, no-store");
      res.headers.set("X-Has-More", "0");
      return res;
    }

    if (section === "discoverAcrossMedia") {
      const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      // Build pool of 60: 70%+ from unexplored types (rated < 3 times), rest from any non-topType
      const POOL_SIZE = 60;
      const unexploredTarget = Math.ceil(POOL_SIZE * 0.70);
      const pool: any[] = [];
      const poolTypeCounts: Record<string, number> = {};
      const maxPerTypePool = Math.ceil(POOL_SIZE * 0.25);

      // First pass: unexplored types only
      for (const s of scored) {
        const typeRateCount = typeCounts[s.item.type] || 0;
        if (typeRateCount >= 3 || s.item.type === topType) continue;
        const tc = poolTypeCounts[s.item.type] || 0;
        if (tc >= maxPerTypePool) continue;
        poolTypeCounts[s.item.type] = tc + 1;
        pool.push(s.item);
        if (pool.length >= unexploredTarget) break;
      }

      // Fill remainder from any non-topType (not already in pool)
      if (pool.length < POOL_SIZE) {
        const usedIds = new Set(pool.map((i: any) => i.id));
        for (const s of scored) {
          if (usedIds.has(s.item.id)) continue;
          if (s.item.type === topType) continue;
          const tc = poolTypeCounts[s.item.type] || 0;
          if (tc >= maxPerTypePool) continue;
          poolTypeCounts[s.item.type] = tc + 1;
          pool.push(s.item);
          usedIds.add(s.item.id);
          if (pool.length >= POOL_SIZE) break;
        }
      }

      // Shuffle pool then pick `limit` items with type diversity (max 25% per type)
      const shuffled = shuffleAndPick(pool, POOL_SIZE);
      const picked: any[] = [];
      const pickedTypeCounts: Record<string, number> = {};
      const maxPerTypePick = Math.max(Math.ceil(limit * 0.25), 4);

      for (const item of shuffled) {
        const tc = pickedTypeCounts[item.type] || 0;
        if (tc >= maxPerTypePick) continue;
        pickedTypeCounts[item.type] = tc + 1;
        picked.push(item);
        if (picked.length >= limit) break;
      }

      const page = interleaveByType(picked).map(mapItem);
      const res = NextResponse.json(page);
      res.headers.set("Cache-Control", "private, no-store");
      res.headers.set("X-Has-More", "0");
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
      topGenres,
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
    desc: truncateDesc(item.description),
    people: (item.people || []).slice(0, 3),
    awards: [], platforms: [],
    ext: slimExt(item.ext), totalEp: item.totalEp || 0,
    voteCount: item.voteCount || 0,
    malId: item.malId ?? null,
  };
}
