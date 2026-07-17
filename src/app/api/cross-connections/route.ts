import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import { adminEmails } from "@/lib/admin";
import type { TasteDimensions } from "@/lib/taste-dimensions";
import {
  computeConnectionAffinity,
  buildHighRatedTagBag,
  selectPersonalizedSlate,
  AFFINITY_NEUTRAL,
  type AffinityRecItem,
  type PersonalizedCandidate,
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
const PERSONALIZED_PRIMARY_SLOTS = 5;          // 5 affinity-ranked + 1 serendipity = TARGET
const MIN_PERSONALIZED_SOURCES = 3;
const RATED_HIGHLY_MIN_SCORE = 4;

// Provisional curated-strength → numeric base for read-side ordering. This is a
// READ-LAYER CONSTANT, not stored in the DB — tunable with no migration (decision 3).
// Curated strength (connection_recs.curated_strength) is the protected editorial
// grade; community_adjustment stays ignored until vote-weighting is enabled.
const STRENGTH_BASE: Record<string, number> = { tight: 1.5, medium: 1.0, attenuated: 0.6 };

// The cross-shelf row is a curated taste of the strongest connections, not an
// exhaustive list. Cap each card at the strongest N recs (desktop shows 4, mobile
// shows 3 via a display-only trim of the 4th). Capping here — before item
// hydration — means we never fetch covers/titles for recs we won't render
// (Supabase egress saver). The long tail stays in the corpus for a full
// connection view elsewhere.
const MAX_CARD_RECS = 4;

/**
 * Hydrate each card's recommendations from the normalized connection_recs table
 * (the corpus source of truth), strength-ordered (tight → attenuated). Mutates
 * each card in place: sets `recommendedItems` to the `{ item_id }[]` shape the
 * rest of the pipeline expects, and overrides the in-memory `qualityScore` with
 * the card's curated-strength base so ordering/affinity run on the editorial
 * grade — never on the deprecated mutable column. Pending recs (no rec_item_id)
 * are excluded from the rendered chain.
 */
async function attachConnectionRecs(prisma: typeof import("@/lib/prisma").prisma, cards: any[]) {
  if (cards.length === 0) return;
  const ids = cards.map((c) => c.id);
  const recs = await prisma.connectionRec.findMany({
    where: { connectionId: { in: ids }, recItemId: { not: null } },
    select: { id: true, connectionId: true, recItemId: true, curatedStrength: true, position: true },
  });
  const byCard = new Map<number, typeof recs>();
  for (const r of recs) (byCard.get(r.connectionId) ?? byCard.set(r.connectionId, []).get(r.connectionId)!).push(r);
  for (const c of cards) {
    const rs = (byCard.get(c.id) ?? []).slice().sort(
      (a, b) => (STRENGTH_BASE[b.curatedStrength] - STRENGTH_BASE[a.curatedStrength]) || a.position - b.position,
    ).slice(0, MAX_CARD_RECS); // strongest-first, capped — don't hydrate the rest
    // carry rec_id so the per-rec thumbs (mobile) can target connection_rec_votes
    c.recommendedItems = rs.map((r) => ({ item_id: r.recItemId, rec_id: r.id }));
    c.qualityScore = rs.length ? Math.max(...rs.map((r) => STRENGTH_BASE[r.curatedStrength])) : 0.6;
  }
}


type SectionMode = "personalized" | "trending" | "discovery";

interface ItemThumb {
  id: number;
  title: string;
  type: string;
  cover: string | null;
  slug: string | null;
  // Per-rec vote wiring (mobile per-card thumbs). recId = connection_recs.id;
  // userVote = the signed-in user's per-rec vote. Capture-only.
  recId?: number;
  userVote?: -1 | 0 | 1;
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
   * Per-user affinity in [0.5, 1.5]. Computed only for personalized-mode
   * connections; AFFINITY_NEUTRAL (1.0) for trending/discovery and for
   * signed-out users. Stage 4b multiplies this onto qualityScore to
   * produce the personalized sort order.
   */
  personalAffinity: number;
  /**
   * Stage 4b serendipity slot (the 6th and final card in personalized
   * mode). True only on the single connection that was picked by raw
   * qualityScore from the candidates NOT in the top-5 final_score
   * picks. The client uses this flag to drive a distinct framing
   * branch ("Also loved across CrossShelf" rather than "Because you
   * rated X highly") — honesty about the basis.
   *
   * Optional + omitted (undefined) on the 5 primary personalized cards
   * and on every trending / discovery card.
   */
  isSerendipitySlot?: boolean;
}

/**
 * Per-candidate row in the admin debug payload. Exposes every
 * intermediate computation so future-Juan can answer "why did this
 * card rank where it did?" without re-running the algorithm in
 * their head.
 */
interface DebugRow {
  id: number;
  sourceItemId: number;
  qualityScore: number;
  personalAffinity: number;
  finalScore: number;       // qualityScore × personalAffinity
  dimMatch: number;
  tagMatch: number;
  sourceAffinity: number;
  hasDimSignal: boolean;
  isInPrimary: boolean;
  isSerendipity: boolean;
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
      // Source the rec chain from connection_recs (strength-ordered) and override
      // the in-memory qualityScore with the curated-strength base before any
      // affinity/selection runs.
      await attachConnectionRecs(prisma, raw);
      // Filter already-rated recs OUT of each connection's rec list, rather
      // than discarding the whole connection when any single rec overlaps.
      // A connection is dropped only if per-rec filtering leaves it with zero
      // recs. Previously one overlapping rec threw away the other 4-6 valid
      // recommendations — which disproportionately pushed engaged users into
      // trending mode. Replacing recommendedItems on the row here means every
      // downstream step (affinity, pool hydration, output) uses the filtered
      // list automatically.
      personalized = raw
        .map((c) => {
          const recs = Array.isArray(c.recommendedItems) ? c.recommendedItems : [];
          return { ...c, recommendedItems: recs.filter((r: any) => !ratedIds.has(Number(r.item_id))) };
        })
        .filter((c) => (c.recommendedItems as any[]).length > 0);
    }

    // Count distinct rated-highly source items that survived filtering.
    // This is what gates personalized vs trending — having 10 connections
    // from one source isn't enough, we want variety.
    const distinctSources = new Set(personalized.map((c) => c.sourceItemId)).size;

    // ── Decide section mode ──────────────────────────────────────────
    let mode: SectionMode;
    let chosen: any[] = [];
    // Built during personalized mode; reused by output hydration so we
    // don't re-fetch the same rec items.
    const recMap = new Map<number, any>();
    // Populated during personalized mode. Includes EVERY candidate in
    // the pool (not just chosen) so the admin debug surface can answer
    // "why did this card NOT make it?" questions. Also feeds the
    // structured-log telemetry below.
    const debugRows: DebugRow[] = [];

    if (distinctSources >= MIN_PERSONALIZED_SOURCES) {
      mode = "personalized";

      // ── Stage 4b: personalized slate builder ───────────────────────
      //
      // 1. Pre-hydrate rec items for the full personalized pool so we
      //    have the columns affinity needs (itemDimensions, genre,
      //    vibes) before we sort. Trending/discovery skip this step.
      // 2. Compute affinity per candidate. Store on the row.
      // 3. Sort by final_score = qualityScore × personalAffinity desc
      //    (id asc as stable tie-break).
      // 4. Greedy distinct-source diversity pass over the now-sorted
      //    list to pick the top PERSONALIZED_PRIMARY_SLOTS (5).
      // 5. Serendipity slot: from the candidates NOT picked in (4),
      //    take the one with the highest RAW qualityScore (NOT
      //    final_score), preferring a source not already in the 5.
      //    Mark it `isSerendipitySlot: true`. If the pool was already
      //    < TARGET, no serendipity slot is synthesized.
      // 6. chosen = [...top5, serendipity?] in deterministic order.

      // (1) Pre-hydrate the personalized pool's rec items.
      const poolRecIds = Array.from(new Set(
        personalized.flatMap((c: any) =>
          Array.isArray(c.recommendedItems) ? c.recommendedItems.map((r: any) => Number(r.item_id)) : [],
        ),
      ));
      if (poolRecIds.length > 0) {
        const poolRecRows = await prisma.item.findMany({
          where: { id: { in: poolRecIds } },
          select: {
            id: true, title: true, type: true, cover: true, slug: true,
            itemDimensions: true, genre: true, vibes: true,
          },
        });
        for (const r of poolRecRows) recMap.set(r.id, r);
      }

      // (2) Compute affinity per candidate.
      for (const c of personalized) {
        const recsRaw = Array.isArray(c.recommendedItems) ? c.recommendedItems : [];
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
        c.personalAffinity = breakdown.affinity;
        c.__affBreakdown = breakdown; // private debug payload, stripped at output
      }

      // (3)–(5) Sort + diversity + serendipity pick — delegated to the
      // pure helper so unit tests exercise the exact same code path.
      // Map each candidate to the helper's expected shape, keeping a
      // by-id lookup so we can reattach the full row's fields.
      const candidateById = new Map<number, any>(personalized.map((c: any) => [c.id, c]));
      const inputCandidates: (PersonalizedCandidate & { __row: any })[] =
        personalized.map((c: any) => ({
          id: c.id,
          sourceItemId: c.sourceItemId,
          qualityScore: Number(c.qualityScore),
          personalAffinity: c.personalAffinity,
          __row: c,
        }));
      const slate = selectPersonalizedSlate(inputCandidates, {
        totalSlots: TARGET,
        primarySlots: PERSONALIZED_PRIMARY_SLOTS,
      });
      chosen = slate.chosen.map((entry) => {
        const row = candidateById.get(entry.id)!;
        if (entry.isSerendipity) row.__isSerendipity = true;
        return row;
      });

      // Build debug rows for every candidate in the pool. The admin
      // debug surface exposes these; telemetry derives rank-diff from
      // them. Order is final_score desc (matches the sort the slate
      // helper just ran).
      const primaryIdSet = new Set<number>(slate.primaryIds);
      for (const c of personalized) {
        const b = c.__affBreakdown;
        debugRows.push({
          id: c.id,
          sourceItemId: c.sourceItemId,
          qualityScore: Number(c.qualityScore),
          personalAffinity: c.personalAffinity,
          finalScore: Number(c.qualityScore) * c.personalAffinity,
          dimMatch: b.components.dimMatch,
          tagMatch: b.components.tagMatch,
          sourceAffinity: b.components.sourceAffinity,
          hasDimSignal: b.hasDimSignal,
          isInPrimary: primaryIdSet.has(c.id),
          isSerendipity: slate.serendipityId === c.id,
        });
      }
    } else if (totalRatings === 0) {
      // Cold-start: brand-new signed-out or never-rated user.
      mode = "discovery";
      chosen = await fetchEditorialFill(TARGET, "random", dismissedConnectionIds);
      await attachConnectionRecs(prisma, chosen);
    } else {
      // Sparse: user has ratings but fewer than MIN_PERSONALIZED_SOURCES
      // rated-highly items map to seed-connection sources. Offer honest
      // fallback instead of padding lies into personalized.
      mode = "trending";
      chosen = await fetchEditorialFill(TARGET, "top_quality", dismissedConnectionIds);
      await attachConnectionRecs(prisma, chosen);
    }

    // ── Hydrate any rec items not already in recMap ─────────────────
    // Personalized mode already pre-hydrated the entire pool above;
    // trending/discovery hits this fresh.
    const allRecIds = Array.from(
      new Set(
        chosen.flatMap((c: any) =>
          Array.isArray(c.recommendedItems) ? c.recommendedItems.map((r: any) => Number(r.item_id)) : []
        ),
      ),
    );
    const missingRecIds = allRecIds.filter((id) => !recMap.has(id));
    if (missingRecIds.length > 0) {
      const moreRecRows = await prisma.item.findMany({
        where: { id: { in: missingRecIds } },
        select: {
          id: true, title: true, type: true, cover: true, slug: true,
          itemDimensions: true, genre: true, vibes: true,
        },
      });
      for (const r of moreRecRows) recMap.set(r.id, r);
    }

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

    // Per-rec votes for the signed-in user, so each mobile card shows its
    // selected thumb state. Capture-only — read here, never feeds ranking.
    const votableRecIds = chosen.flatMap((c: any) =>
      (Array.isArray(c.recommendedItems) ? c.recommendedItems : []).map((r: any) => Number(r.rec_id)).filter(Boolean),
    );
    const recVoteMap = new Map<number, number>();
    if (userId && votableRecIds.length > 0) {
      const rv = await prisma.connectionRecVote.findMany({
        where: { userId, connectionRecId: { in: votableRecIds } },
        select: { connectionRecId: true, vote: true },
      });
      for (const v of rv) recVoteMap.set(v.connectionRecId, v.vote);
    }

    const out: ConnectionOut[] = chosen
      .filter((c: any) => c.sourceItem)
      .map((c: any) => {
        const recsRaw = Array.isArray(c.recommendedItems) ? c.recommendedItems : [];
        const recs: ItemThumb[] = recsRaw
          .map((r: any) => {
            const item = recMap.get(Number(r.item_id));
            if (!item) return null;
            return { ...item, recId: r.rec_id, userVote: (recVoteMap.get(Number(r.rec_id)) ?? 0) as -1 | 0 | 1 };
          })
          .filter(Boolean) as ItemThumb[];

        // Affinity was already computed during the personalized slate
        // builder above. Trending/discovery + signed-out users get the
        // neutral 1.0.
        const personalAffinity: number =
          mode === "personalized" && typeof c.personalAffinity === "number"
            ? c.personalAffinity
            : AFFINITY_NEUTRAL;

        const out: ConnectionOut = {
          id: c.id,
          sourceItem: c.sourceItem,
          recommendedItems: recs,
          reason: c.reason,
          themeTags: c.themeTags || c.theme_tags || [],
          qualityScore: Number(c.qualityScore ?? c.quality_score ?? 1),
          userVote: (voteMap.get(c.id) ?? 0) as -1 | 0 | 1,
          personalAffinity,
        };
        if (c.__isSerendipity === true) out.isSerendipitySlot = true;
        return out;
      });

    // ── Stage 4c telemetry ───────────────────────────────────────────
    // One structured log line per personalized-mode request. Captures
    // "is Stage 4 doing anything observable" at the aggregate, with
    // ZERO per-user identifiers and no per-item details. In-memory
    // only — no new tables, no rollups, no analytics warehouse. The
    // payload is JSON-serializable so log aggregators ingest cleanly.
    if (mode === "personalized" && debugRows.length > 0) {
      // Rank under the pre-4b ordering: raw qualityScore desc, id asc.
      const rawRank = new Map<number, number>();
      [...debugRows]
        .sort((a, b) => {
          const qd = b.qualityScore - a.qualityScore;
          if (qd !== 0) return qd;
          return a.id - b.id;
        })
        .forEach((d, i) => rawRank.set(d.id, i));

      // Rank under the new (4b) ordering: chosen array index.
      const newRank = new Map<number, number>();
      chosen.forEach((c: any, i: number) => newRank.set(c.id, i));

      // Sum of |new_position − old_position| over the chosen connections.
      // Simple "positions moved" metric per the design. 0 = no change.
      let rankDiffMagnitude = 0;
      let orderChangedVsRawQs = false;
      for (const [id, np] of newRank) {
        const op = rawRank.get(id);
        if (op === undefined) continue;
        const diff = Math.abs(np - op);
        rankDiffMagnitude += diff;
        if (diff > 0) orderChangedVsRawQs = true;
      }

      console.log(JSON.stringify({
        kind: "cross_connections.personalization",
        mode,
        candidatePoolSize: debugRows.length,
        primarySlotCount: debugRows.filter((d) => d.isInPrimary).length,
        serendipitySlotFilled: debugRows.some((d) => d.isSerendipity),
        orderChangedVsRawQs,
        rankDiffMagnitude,
      }));
    }

    // ── Stage 4c admin debug surface ──────────────────────────────────
    // Append the full per-candidate breakdown when (a) ?debug=1 is in
    // the query AND (b) the caller is an admin per the shared allowlist
    // in @/lib/admin. Strip for everyone else. Never leaks to non-admin
    // sessions.
    let debugPayload: { _debug?: DebugRow[] } = {};
    const wantsDebug = req.nextUrl.searchParams.get("debug") === "1";
    if (wantsDebug && claims?.email && adminEmails().has(claims.email.toLowerCase())) {
      debugPayload = { _debug: debugRows };
    }

    const res = NextResponse.json({ mode, connections: out, ...debugPayload });
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
