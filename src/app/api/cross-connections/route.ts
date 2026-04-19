import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

/**
 * GET /api/cross-connections
 *
 * Three distinct section modes, each with its own framing. Modes are
 * never mixed — the whole section is either personalized, trending,
 * or discovery. No per-card variance.
 *
 *   personalized — user has ≥ MIN_PERSONALIZED_SOURCES distinct
 *     rated-highly (score ≥ 4) items that appear as source_item_id
 *     in our curated connections, AND those connections' recs aren't
 *     already rated by the user. "Because you rated [X] highly."
 *
 *   trending — user has at least one rating but falls below the
 *     personalized threshold. Returns the TARGET highest-quality
 *     editorial connections. "Popular cross-media picks."
 *
 *   discovery — user is signed out or has no ratings at all.
 *     Returns TARGET random editorial connections. "Cross-media
 *     picks from our editors."
 *
 * Connections below qualityScore 0.3 are hidden from every mode.
 */

const TARGET = 6;
const MIN_PERSONALIZED_SOURCES = 3;
const RATED_HIGHLY_MIN_SCORE = 4;

type SectionMode = "personalized" | "trending" | "discovery";

interface ItemThumb {
  id: number;
  title: string;
  type: string;
  cover: string | null;
  slug: string | null;
}
interface ConnectionOut {
  id: number;
  sourceItem: ItemThumb;
  recommendedItems: ItemThumb[];
  reason: string;
  themeTags: string[];
  qualityScore: number;
  userVote: -1 | 0 | 1;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`cross-connections:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const claims = await getClaims();
  const userId = claims?.sub ?? null;

  try {
    // ── Load user signals ────────────────────────────────────────────
    const ratedIds = new Set<number>();
    let ratedHighlyIds: number[] = [];
    let totalRatings = 0;
    if (userId) {
      const ratings = await prisma.rating.findMany({
        where: { userId },
        select: { itemId: true, score: true },
      });
      totalRatings = ratings.length;
      for (const r of ratings) ratedIds.add(r.itemId);
      ratedHighlyIds = ratings
        .filter((r) => r.score >= RATED_HIGHLY_MIN_SCORE)
        .map((r) => r.itemId);
    }

    const userVotes = userId
      ? await prisma.crossConnectionVote.findMany({
          where: { userId },
          select: { connectionId: true, vote: true },
        })
      : [];
    const voteMap = new Map<number, number>(userVotes.map((v) => [v.connectionId, v.vote]));

    // ── Attempt personalized selection ───────────────────────────────
    let personalized: any[] = [];
    if (ratedHighlyIds.length > 0) {
      const raw = await prisma.crossConnection.findMany({
        where: {
          sourceItemId: { in: ratedHighlyIds },
          qualityScore: { gte: 0.3 },
        },
        orderBy: [{ qualityScore: "desc" }, { id: "asc" }],
        include: {
          sourceItem: { select: { id: true, title: true, type: true, cover: true, slug: true } },
        },
        take: 20,
      });
      // Drop connections whose recs overlap with items the user already rated.
      personalized = raw.filter((c) => {
        const recs = Array.isArray(c.recommendedItems) ? c.recommendedItems : [];
        return !recs.some((r: any) => ratedIds.has(Number(r.item_id)));
      });
    }

    // Count distinct rated-highly source items that survived filtering.
    // This is what gates personalized vs trending — having 10 connections
    // from one source isn't enough, we want variety.
    const distinctSources = new Set(personalized.map((c) => c.sourceItemId)).size;

    // ── Decide section mode ──────────────────────────────────────────
    let mode: SectionMode;
    let chosen: any[] = [];

    if (distinctSources >= MIN_PERSONALIZED_SOURCES) {
      mode = "personalized";
      // Take up to TARGET connections, preferring variety across distinct
      // sources. Greedy: walk personalized in qualityScore order, skip a
      // connection if we already have one from that source — but only
      // until we've hit every distinct source once.
      const seenSources = new Set<number>();
      const firstPass: any[] = [];
      const secondPass: any[] = [];
      for (const c of personalized) {
        if (!seenSources.has(c.sourceItemId)) {
          firstPass.push(c);
          seenSources.add(c.sourceItemId);
        } else {
          secondPass.push(c);
        }
      }
      chosen = [...firstPass, ...secondPass].slice(0, TARGET);
    } else if (totalRatings === 0) {
      // Cold-start: brand-new signed-out or never-rated user.
      mode = "discovery";
      chosen = await fetchEditorialFill(TARGET, "random");
    } else {
      // Sparse: user has ratings but fewer than MIN_PERSONALIZED_SOURCES
      // rated-highly items map to seed-connection sources. Offer honest
      // fallback instead of padding lies into personalized.
      mode = "trending";
      chosen = await fetchEditorialFill(TARGET, "top_quality");
    }

    // ── Hydrate recommended items with current cover + slug ─────────
    const allRecIds = Array.from(
      new Set(
        chosen.flatMap((c: any) =>
          Array.isArray(c.recommendedItems) ? c.recommendedItems.map((r: any) => Number(r.item_id)) : []
        ),
      ),
    );
    const recRows = allRecIds.length > 0
      ? await prisma.item.findMany({
          where: { id: { in: allRecIds } },
          select: { id: true, title: true, type: true, cover: true, slug: true },
        })
      : [];
    const recMap = new Map(recRows.map((r) => [r.id, r]));

    // For fallback modes, sourceItem isn't on the row yet — fetch in bulk.
    const needSourceLookup = chosen.filter((c: any) => !c.sourceItem);
    if (needSourceLookup.length > 0) {
      const srcIds = needSourceLookup.map((c: any) => c.sourceItemId);
      const srcRows = await prisma.item.findMany({
        where: { id: { in: srcIds } },
        select: { id: true, title: true, type: true, cover: true, slug: true },
      });
      const srcMap = new Map(srcRows.map((s) => [s.id, s]));
      for (const c of needSourceLookup) {
        c.sourceItem = srcMap.get(c.sourceItemId) ?? null;
      }
    }

    const out: ConnectionOut[] = chosen
      .filter((c: any) => c.sourceItem)
      .map((c: any) => {
        const recsRaw = Array.isArray(c.recommendedItems) ? c.recommendedItems : [];
        const recs: ItemThumb[] = recsRaw
          .map((r: any) => recMap.get(Number(r.item_id)))
          .filter(Boolean) as ItemThumb[];
        return {
          id: c.id,
          sourceItem: c.sourceItem,
          recommendedItems: recs,
          reason: c.reason,
          themeTags: c.themeTags || c.theme_tags || [],
          qualityScore: Number(c.qualityScore ?? c.quality_score ?? 1),
          userVote: (voteMap.get(c.id) ?? 0) as -1 | 0 | 1,
        };
      });

    const res = NextResponse.json({ mode, connections: out });
    res.headers.set("Cache-Control", "private, max-age=60");
    return res;
  } catch (err) {
    console.error("cross-connections error:", err);
    return NextResponse.json({ mode: "discovery" as SectionMode, connections: [] });
  }
}

/**
 * Pull editorial connections for fallback modes. For trending we use
 * qualityScore as the ordering signal (editorially curated + community
 * up/down votes). For discovery we pick at random for freshness.
 */
async function fetchEditorialFill(
  limit: number,
  order: "top_quality" | "random",
): Promise<any[]> {
  const orderClause = order === "top_quality"
    ? "ORDER BY quality_score DESC, id ASC"
    : "ORDER BY RANDOM()";
  return prisma.$queryRawUnsafe<any[]>(`
    SELECT id,
           source_item_id AS "sourceItemId",
           recommended_items AS "recommendedItems",
           reason,
           theme_tags AS "themeTags",
           quality_score AS "qualityScore"
    FROM cross_connections
    WHERE quality_score >= 0.3
    ${orderClause}
    LIMIT ${limit}
  `);
}
