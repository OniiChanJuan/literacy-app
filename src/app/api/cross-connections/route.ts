import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import type { TasteDimensions } from "@/lib/taste-dimensions";
import {
  computeConnectionAffinity,
  buildHighRatedTagBag,
  AFFINITY_NEUTRAL,
  type AffinityRecItem,
} from "@/lib/connection-affinity";

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
  /**
   * Stage 4a: per-user affinity in [0.5, 1.5]. Computed only for
   * personalized-mode connections; AFFINITY_NEUTRAL (1.0) for
   * trending/discovery and for signed-out users. NOT applied to
   * ordering in this stage — exposed for telemetry + dev observation.
   */
  personalAffinity: number;
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
    // Stage 4a: also load taste_profile + the high-rated items' tag bag
    // so we can compute per-user affinity for personalized candidates.
    let tasteProfile: TasteDimensions | null = null;
    let highRatedTagBag: Set<string> = new Set();
    // (userId, itemId) → { score, recommendTag } for source-affinity lookup.
    const ratingByItemId = new Map<number, { score: number; recommendTag: string | null }>();
    if (userId) {
      const [ratings, userRow] = await Promise.all([
        prisma.rating.findMany({
          where: { userId },
          select: {
            itemId: true,
            score: true,
            recommendTag: true,
            item: { select: { genre: true, vibes: true } },
          },
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { tasteProfile: true },
        }),
      ]);
      totalRatings = ratings.length;
      for (const r of ratings) {
        ratedIds.add(r.itemId);
        ratingByItemId.set(r.itemId, { score: r.score, recommendTag: r.recommendTag });
      }
      ratedHighlyIds = ratings
        .filter((r) => r.score >= RATED_HIGHLY_MIN_SCORE)
        .map((r) => r.itemId);
      tasteProfile = (userRow?.tasteProfile as TasteDimensions | null) ?? null;
      highRatedTagBag = buildHighRatedTagBag(ratings);
    }

    const [userVotes, userDismissals] = await Promise.all([
      userId
        ? prisma.crossConnectionVote.findMany({
            where: { userId },
            select: { connectionId: true, vote: true },
          })
        : Promise.resolve([] as { connectionId: number; vote: number }[]),
      userId
        ? prisma.connectionDismissal.findMany({
            where: { userId },
            select: { connectionId: true },
          })
        : Promise.resolve([] as { connectionId: number }[]),
    ]);
    const voteMap = new Map<number, number>(userVotes.map((v) => [v.connectionId, v.vote]));
    const dismissedConnectionIds = new Set<number>(userDismissals.map((d) => d.connectionId));

    // ── Attempt personalized selection ───────────────────────────────
    let personalized: any[] = [];
    if (ratedHighlyIds.length > 0) {
      const raw = await prisma.crossConnection.findMany({
        where: {
          sourceItemId: { in: ratedHighlyIds },
          qualityScore: { gte: 0.3 },
          ...(dismissedConnectionIds.size > 0
            ? { id: { notIn: Array.from(dismissedConnectionIds) } }
            : {}),
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
      chosen = await fetchEditorialFill(TARGET, "random", dismissedConnectionIds);
    } else {
      // Sparse: user has ratings but fewer than MIN_PERSONALIZED_SOURCES
      // rated-highly items map to seed-connection sources. Offer honest
      // fallback instead of padding lies into personalized.
      mode = "trending";
      chosen = await fetchEditorialFill(TARGET, "top_quality", dismissedConnectionIds);
    }

    // ── Hydrate recommended items with current cover + slug ─────────
    const allRecIds = Array.from(
      new Set(
        chosen.flatMap((c: any) =>
          Array.isArray(c.recommendedItems) ? c.recommendedItems.map((r: any) => Number(r.item_id)) : []
        ),
      ),
    );
    // Hydration now also pulls itemDimensions / genre / vibes used by
    // the Stage 4a affinity computation. Trending/discovery candidates
    // still hydrate them (cheap), but only personalized candidates
    // actually feed them into the affinity helper.
    const recRows = allRecIds.length > 0
      ? await prisma.item.findMany({
          where: { id: { in: allRecIds } },
          select: {
            id: true, title: true, type: true, cover: true, slug: true,
            itemDimensions: true, genre: true, vibes: true,
          },
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

    // ── Stage 4a: compute per-user affinity for personalized candidates ──
    // The number rides along on the response shape but does NOT influence
    // ordering yet. Stage 4b will multiply it onto qualityScore.
    const affinityDebug: Array<{ id: number; affinity: number; dim: number; tag: number; src: number; dimSig: boolean }> = [];

    const out: ConnectionOut[] = chosen
      .filter((c: any) => c.sourceItem)
      .map((c: any) => {
        const recsRaw = Array.isArray(c.recommendedItems) ? c.recommendedItems : [];
        const recs: ItemThumb[] = recsRaw
          .map((r: any) => recMap.get(Number(r.item_id)))
          .filter(Boolean) as ItemThumb[];

        // Affinity is only meaningful in personalized mode (where the
        // user has rated the source and has a populated taste profile).
        // Trending/discovery + signed-out users get the neutral 1.0.
        let personalAffinity = AFFINITY_NEUTRAL;
        if (mode === "personalized" && userId) {
          const recItems: AffinityRecItem[] = recsRaw
            .map((r: any) => recMap.get(Number(r.item_id)))
            .filter(Boolean)
            .map((row: any) => ({
              id: row.id as number,
              itemDimensions: (row.itemDimensions as TasteDimensions | null) ?? null,
              genre: (row.genre as string[]) ?? [],
              vibes: (row.vibes as string[]) ?? [],
            }));
          const breakdown = computeConnectionAffinity({
            user: {
              tasteProfile,
              highRatedTags: highRatedTagBag,
              sourceRating: ratingByItemId.get(c.sourceItemId) ?? null,
            },
            connection: {
              themeTags: (c.themeTags || c.theme_tags || []) as string[],
              recommendedItems: recItems,
            },
          });
          personalAffinity = breakdown.affinity;
          affinityDebug.push({
            id: c.id,
            affinity: breakdown.affinity,
            dim: breakdown.components.dimMatch,
            tag: breakdown.components.tagMatch,
            src: breakdown.components.sourceAffinity,
            dimSig: breakdown.hasDimSignal,
          });
        }

        return {
          id: c.id,
          sourceItem: c.sourceItem,
          recommendedItems: recs,
          reason: c.reason,
          themeTags: c.themeTags || c.theme_tags || [],
          qualityScore: Number(c.qualityScore ?? c.quality_score ?? 1),
          userVote: (voteMap.get(c.id) ?? 0) as -1 | 0 | 1,
          personalAffinity,
        };
      });

    // Dev-only debug emission. Lets us watch the numbers as we navigate
    // the live app during 4a's dark-launch window.
    if (process.env.NODE_ENV !== "production" && affinityDebug.length > 0) {
      console.log(`[cross-connections affinity] mode=${mode} user=${userId} candidates=${affinityDebug.length}`);
      for (const d of affinityDebug) {
        console.log(
          `  id=${String(d.id).padStart(3)} aff=${d.affinity.toFixed(3)} ` +
          `dim=${d.dim.toFixed(3)} tag=${d.tag.toFixed(3)} src=${d.src.toFixed(3)} ` +
          `dimSig=${d.dimSig}`,
        );
      }
    }

    const res = NextResponse.json({ mode, connections: out });
    // Per-user state (userVote, dismissed filter) makes this response
    // unsafe to cache even for 60s — a fresh vote or dismiss must be
    // reflected on the next render. Was previously max-age=60 which
    // caused stale userVote/qualityScore for 60s after every action.
    res.headers.set("Cache-Control", "no-store");
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
  excludeIds: Set<number> = new Set(),
): Promise<any[]> {
  const orderClause = order === "top_quality"
    ? "ORDER BY quality_score DESC, id ASC"
    : "ORDER BY RANDOM()";
  if (excludeIds.size === 0) {
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
  // Parameterize the NOT IN list via Prisma.sql to avoid injection.
  const excludeArr = Array.from(excludeIds);
  return prisma.$queryRawUnsafe<any[]>(
    `
      SELECT id,
             source_item_id AS "sourceItemId",
             recommended_items AS "recommendedItems",
             reason,
             theme_tags AS "themeTags",
             quality_score AS "qualityScore"
      FROM cross_connections
      WHERE quality_score >= 0.3
        AND id <> ALL($1::int[])
      ${orderClause}
      LIMIT ${limit}
    `,
    excludeArr,
  );
}
