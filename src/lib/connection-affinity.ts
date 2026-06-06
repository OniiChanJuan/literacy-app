/**
 * Per-user personalization for Cross your shelf (Stage 4 of the
 * cross-connection algorithm work).
 *
 * Design intent — see: Stage 4 design proposal, Phase 1.
 *
 * ─── What this file does ───────────────────────────────────────────────
 *
 * Two pure functions consumed by /api/cross-connections/route.ts:
 *
 *   computeConnectionAffinity({ user, connection })
 *     Returns a personal-affinity number in [0.5, 1.5] expressing how
 *     well one specific connection matches one specific user's taste.
 *
 *   selectPersonalizedSlate(candidates, opts)
 *     Given the personalized-mode candidate pool with affinities
 *     already computed, returns the ordered slate of up to TARGET
 *     (default 6) connections: 5 ranked by final_score with
 *     distinct-source diversity, plus a serendipity slot (slot 6)
 *     picked by raw qualityScore from the remaining candidates.
 *
 * Plus two helpers exposed for the route: buildHighRatedTagBag
 * (one-shot per-request user tag aggregation) and the typed shapes
 * AffinityUser / AffinityConnection / PersonalizedCandidate.
 *
 * ─── The three components and their weights ─────────────────────────────
 *
 *   dim_match       Mean tasteSimilarity(user.tasteProfile, rec.dims)
 *                   over recommended items that have itemDimensions
 *                   populated. Uses the strength-weighted Euclidean
 *                   metric from src/lib/taste-dimensions.ts unchanged.
 *                   Returns null when no rec items have dimensions;
 *                   triggers the weight redistribution below.
 *
 *   tag_match       Jaccard overlap between two bags of lowercased,
 *                   trimmed tags:
 *                     conn bag = connection.theme_tags
 *                              ∪ union of rec.genres
 *                              ∪ union of rec.vibes
 *                     user bag = union of (genre ∪ vibes) over items
 *                                the user rated ≥ 4
 *                   Bridge metric across media types — especially
 *                   important given the catalog-wide dim-coverage
 *                   ceiling (only ~12% of items have populated dims).
 *                   Returns 0 when either bag is empty (treated as a
 *                   zero component, NOT as missing signal).
 *
 *   source_affinity From the user's own rating on the connection's
 *                   source item:
 *                     recommendTag=recommend OR score=5 → 1.0
 *                     score=4                            → 0.8
 *                     score=3                            → 0.5
 *                     recommendTag=skip OR score≤2       → 0.2
 *                     no rating                          → 0.5
 *                   In personalized mode the source is always rated
 *                   ≥4 (the gating filter on /api/cross-connections),
 *                   so the score=3/≤2/no-rating branches are dead
 *                   paths for live personalized candidates today.
 *
 * Default weights: W_dim=0.50, W_tag=0.30, W_source=0.20. Chosen with
 * the explicit understanding that dim coverage on the live catalog is
 * low; the auto-renormalization (below) keeps the metric meaningful
 * on the long tail of dim-less items.
 *
 * ─── Auto-renormalization when dim_match is absent ──────────────────────
 *
 * When no rec item in the connection has itemDimensions populated,
 * computeDimMatch returns null and we redistribute W_dim's 0.50 weight
 * proportionally onto the other two components, ratio 0.30:0.20:
 *
 *   W_dim → 0.00
 *   W_tag → 0.60
 *   W_source → 0.40
 *
 * Weights still sum to 1.0 so the [0.0, 1.0] raw-affinity range and the
 * [0.5, 1.5] final-affinity range remain mathematically exact. The
 * AffinityBreakdown.hasDimSignal flag tells callers (telemetry, admin
 * debug) which weight regime fired.
 *
 * ─── The [0.5, 1.5] range and why ───────────────────────────────────────
 *
 *   affinity_raw  ∈  [0.0, 1.0]   (weighted average of [0,1] components)
 *   affinity      =  0.5 + affinity_raw   ∈  [0.5, 1.5]
 *
 * Asymmetric around 1.0:
 *   - affinity < 1.0 demotes (a user with strong opposite taste sees
 *     the connection at half its global score)
 *   - affinity > 1.0 promotes (matching taste up to a 1.5× boost)
 *   - never zeroes out a high-quality connection
 *
 * Wider ranges (e.g., [0.2, 2.0]) would let personalization override
 * quality dominance, which inverts the design goal of "personalization
 * layered ON aggregate quality, not replacing it". The 0.3 quality
 * floor on the route still applies as a hard global gate BEFORE
 * personalization runs.
 *
 * ─── Multiplicative composition with quality_score ──────────────────────
 *
 * The route does:
 *
 *   final_score = qualityScore × personalAffinity
 *
 * Then sorts personalized candidates by final_score desc, runs the
 * distinct-source diversity pass over that sorted list, takes the top
 * PERSONALIZED_PRIMARY_SLOTS (default 5), and uses selectPersonalizedSlate
 * to mint the slot-6 serendipity pick.
 *
 * Why multiplicative (not additive, not filter, not rerank-within-N):
 *   - Additive would let personalization swing past [0, 2] caps and
 *     dominate quality at the extremes.
 *   - Filter (drop below affinity threshold) shrinks discovery for
 *     users with weak signal; most users have weak signal for a long
 *     time.
 *   - Rerank-within-top-N is brittle when the candidate pool is small.
 *   - Multiplicative composes the two scores in their natural
 *     dimensions: quality is the "is this generally good" axis and
 *     affinity is the "is this good for THIS user" axis; their
 *     product is "is this good for this user, weighted by general
 *     goodness".
 *
 * ─── The serendipity slot ───────────────────────────────────────────────
 *
 * Slot 6 in personalized mode is NOT personalized. selectPersonalizedSlate
 * picks it from the candidates outside the top-5 final_score ranking by
 * raw qualityScore desc (NOT final_score), preferring a source not
 * already represented in the primary 5. This is a deliberate
 * filter-bubble-prevention mechanism: even strongly-personalized users
 * always see one card surfaced because it's broadly loved across
 * CrossShelf, not because their taste profile said so. The client uses
 * the isSerendipitySlot flag to render a distinct framing
 * ("Also loved across CrossShelf" rather than "Because you rated X
 * highly") so the basis stays honest.
 *
 * If the personalized candidate pool was already ≤ PERSONALIZED_PRIMARY_SLOTS,
 * no serendipity slot is synthesized; the response just returns fewer
 * cards. Per the design: "don't synthesize one — return what's there."
 *
 * ─── Cold-start behavior ────────────────────────────────────────────────
 *
 * The system degrades gracefully on rating count, without any explicit
 * thresholds beyond what's already in /api/cross-connections/route.ts:
 *
 *   0 ratings → discovery mode (route fallback). Affinity never runs.
 *   1–2 ratings, sparse source coverage → trending mode. Affinity
 *                                          never runs; aff stays neutral
 *                                          (=1.0) on the response.
 *   3+ rated-highly source items → personalized mode kicks in.
 *
 * Inside personalized mode, the helper's behavior on a neutral
 * tasteProfile (all dimensions ≈ 0.5, which is what newly-rated users
 * have until updateTasteProfile has shifted them) produces affinity
 * values clustered near 1.0 because the strength-weighting in
 * tasteSimilarity means a neutral user has no preference axes to
 * differentiate candidates. This is by design — cold-start users get
 * essentially no-op reordering, falling back to the same aggregate-
 * quality order they would have seen without Stage 4 at all.
 *
 * ─── What this file does NOT do ─────────────────────────────────────────
 *
 *   - DB access: every input is pre-fetched by the caller
 *   - Cross-user signal: purely self-referential — no collaborative
 *     filtering, no neighbor lookups. Sub-session B's privacy flags
 *     don't apply because nothing here reads another user's data.
 *   - Mutate inputs: selectPersonalizedSlate copies the input array
 *     before sorting and does not modify candidate objects beyond
 *     adding isSerendipity to the returned shape.
 *   - Negative personalization (dismissal-pattern generalization): out
 *     of scope per Phase 1, deferred to Stage 4.5+ when there's enough
 *     dismissal data to train against. Per-connection dismissal
 *     remains in /api/cross-connections/[id]/dismiss/route.ts unchanged.
 *
 * ─── Unit tests ─────────────────────────────────────────────────────────
 *
 * scripts/_test-connection-affinity.ts covers every public export with
 * 50 assertions including weight-redistribution math, [0.5, 1.5]
 * bounding, the diversity + serendipity selection rules, and the
 * cold-start degradation behavior. Run with:
 *
 *   npx tsx scripts/_test-connection-affinity.ts
 */
import { tasteSimilarity, type TasteDimensions } from "./taste-dimensions";

// ── Constants ──────────────────────────────────────────────────────────

export const AFFINITY_WEIGHTS = {
  dim: 0.50,
  tag: 0.30,
  source: 0.20,
} as const;

// When dim is unavailable, redistribute its 0.50 weight proportionally
// onto tag (0.30) and source (0.20). Ratio is 0.30 : 0.20 → 0.60 : 0.40.
export const AFFINITY_WEIGHTS_NO_DIM = {
  dim: 0,
  tag: 0.60,
  source: 0.40,
} as const;

export const AFFINITY_MIN = 0.5;
export const AFFINITY_MAX = 1.5;
export const AFFINITY_NEUTRAL = 1.0;

// ── Public input/output types ──────────────────────────────────────────

export interface AffinityRecItem {
  id: number;
  /** May be null — only ~12% of catalog items have populated dimensions today. */
  itemDimensions: TasteDimensions | null;
  /** Always non-null after Wave 1 NOT NULL tightening. */
  genre: string[];
  /** Always non-null after Wave 1 NOT NULL tightening. */
  vibes: string[];
}

export interface AffinityConnection {
  /** From cross_connections.theme_tags. */
  themeTags: string[];
  recommendedItems: AffinityRecItem[];
}

export interface AffinityUser {
  /** users.taste_profile. Null when the user has too few ratings to build one. */
  tasteProfile: TasteDimensions | null;
  /** Lower-cased union of genre + vibe strings from items the user rated ≥ 4. */
  highRatedTags: Set<string>;
  /** The user's own rating + recommend_tag on the connection's source item, if any. */
  sourceRating: { score: number; recommendTag: string | null } | null;
}

export interface AffinityBreakdown {
  /** Final affinity in [0.5, 1.5]. */
  affinity: number;
  /** Whether dimensions were available + used (else fallback weights applied). */
  hasDimSignal: boolean;
  /** Component scores in [0, 1] — useful for debugging / telemetry. */
  components: {
    dimMatch: number;     // 0 when no rec dims present
    tagMatch: number;     // 0 when no overlap
    sourceAffinity: number;
  };
}

// ── Sub-metrics ────────────────────────────────────────────────────────

/**
 * Mean tasteSimilarity over the recommended items that have dimensions.
 * Returns null when no rec item has dimensions (so caller can apply the
 * weight-redistribution path).
 */
export function computeDimMatch(
  userProfile: TasteDimensions | null,
  recs: AffinityRecItem[],
): number | null {
  if (!userProfile) return null;
  const withDims = recs.filter((r) => r.itemDimensions !== null);
  if (withDims.length === 0) return null;
  let sum = 0;
  for (const r of withDims) {
    sum += tasteSimilarity(userProfile, r.itemDimensions as TasteDimensions);
  }
  return sum / withDims.length;
}

/**
 * Jaccard overlap between the connection's bag of tags and the user's.
 *
 *   connection bag = theme_tags ∪ (union of rec.genres) ∪ (union of rec.vibes)
 *   user bag       = union of (genre ∪ vibes) over the user's ≥4-rated items
 *
 * All comparisons lower-cased + trimmed. Returns 0 when either bag is
 * empty (no overlap is possible — caller treats it as a 0 component, not
 * "missing signal").
 */
export function computeTagMatch(
  connection: AffinityConnection,
  userHighRatedTags: Set<string>,
): number {
  if (userHighRatedTags.size === 0) return 0;
  const connBag = new Set<string>();
  for (const t of connection.themeTags) {
    const s = t.toLowerCase().trim();
    if (s) connBag.add(s);
  }
  for (const r of connection.recommendedItems) {
    for (const g of r.genre) {
      const s = g.toLowerCase().trim();
      if (s) connBag.add(s);
    }
    for (const v of r.vibes) {
      const s = v.toLowerCase().trim();
      if (s) connBag.add(s);
    }
  }
  if (connBag.size === 0) return 0;
  let intersection = 0;
  for (const t of connBag) if (userHighRatedTags.has(t)) intersection++;
  const unionSize = connBag.size + userHighRatedTags.size - intersection;
  if (unionSize === 0) return 0;
  return intersection / unionSize;
}

/**
 * Affinity derived from the user's own rating on the connection's source.
 *
 *   recommendTag="recommend" OR score=5 → 1.0
 *   score=4                              → 0.8
 *   score=3                              → 0.5
 *   recommendTag="skip" OR score≤2       → 0.2
 *   no rating                            → 0.5 (neutral)
 *
 * Note: in personalized mode the source is always rated ≥4 (it's the
 * gating filter), so the score=3 / ≤2 / no-rating branches are dead
 * paths for personalized candidates today. They exist so the helper
 * stays sound if applied outside that mode in a future stage.
 */
export function computeSourceAffinity(
  rating: { score: number; recommendTag: string | null } | null,
): number {
  if (!rating) return 0.5;
  if (rating.recommendTag === "recommend" || rating.score === 5) return 1.0;
  if (rating.recommendTag === "skip" || rating.score <= 2) return 0.2;
  if (rating.score === 4) return 0.8;
  if (rating.score === 3) return 0.5;
  // Defensive fallback — shouldn't hit; all valid 1-5 scores are covered.
  return 0.5;
}

// ── Composition ────────────────────────────────────────────────────────

/**
 * Compose component scores into the final affinity using the design's
 * weight table (and the proportional redistribution path when
 * dim_match is unavailable).
 */
export function computeConnectionAffinity(args: {
  user: AffinityUser;
  connection: AffinityConnection;
}): AffinityBreakdown {
  const { user, connection } = args;

  const dimMatchRaw = computeDimMatch(user.tasteProfile, connection.recommendedItems);
  const hasDimSignal = dimMatchRaw !== null;
  const dimMatch = hasDimSignal ? (dimMatchRaw as number) : 0;
  const tagMatch = computeTagMatch(connection, user.highRatedTags);
  const sourceAffinity = computeSourceAffinity(user.sourceRating);

  const W = hasDimSignal ? AFFINITY_WEIGHTS : AFFINITY_WEIGHTS_NO_DIM;
  const raw = W.dim * dimMatch + W.tag * tagMatch + W.source * sourceAffinity;
  // raw ∈ [0, 1] (each component is in [0, 1] and weights sum to 1.0).
  // Map to [0.5, 1.5] with simple offset.
  const affinity = AFFINITY_MIN + raw;

  return {
    affinity,
    hasDimSignal,
    components: { dimMatch, tagMatch, sourceAffinity },
  };
}

// ── Helper for the API route — build the user's high-rated tag bag ─────

/**
 * Construct the lower-cased Set of (genre ∪ vibe) strings from items
 * the user rated ≥ 4. Called once per request, then reused across every
 * candidate connection.
 */
export function buildHighRatedTagBag(
  ratedItems: { score: number; item: { genre: string[]; vibes: string[] } }[],
): Set<string> {
  const out = new Set<string>();
  for (const r of ratedItems) {
    if (r.score < 4) continue;
    for (const g of r.item.genre) {
      const s = g.toLowerCase().trim();
      if (s) out.add(s);
    }
    for (const v of r.item.vibes) {
      const s = v.toLowerCase().trim();
      if (s) out.add(s);
    }
  }
  return out;
}

// ── Stage 4b: slate selection (sort + diversity + serendipity) ─────────

/**
 * Minimal candidate shape consumed by selectPersonalizedSlate. The full
 * candidate row in the route carries more fields; we only need these.
 */
export interface PersonalizedCandidate {
  id: number;
  sourceItemId: number;
  qualityScore: number;
  personalAffinity: number;
}

export interface PersonalizedSlate<C extends PersonalizedCandidate> {
  /** Final ordered output, ≤ totalSlots in length. */
  chosen: C[];
  /** IDs that ended up in slots 1 .. primarySlots. */
  primaryIds: number[];
  /** ID of the serendipity pick, or null if the pool was already small. */
  serendipityId: number | null;
}

/**
 * Stage 4b core: take the full personalized candidate pool (with
 * per-candidate affinity already computed) and produce the ordered
 * slate of up to `totalSlots` (default 6) connections.
 *
 *   1. Sort all candidates by final_score = quality × affinity, desc;
 *      stable tie-break by id asc.
 *   2. Greedy distinct-source pass picks the top `primarySlots` (default
 *      5): first occurrence of each source first, then refill with
 *      seconds.
 *   3. Pick the serendipity slot (slot 6) from the remaining candidates
 *      by RAW qualityScore desc (NOT final_score), preferring a source
 *      not already in the primary 5. If no remaining candidates exist
 *      (pool was already small), no serendipity is synthesized.
 *
 * Pure function — easy to unit-test against synthetic candidate arrays.
 *
 * Note: the function does NOT mutate inputs other than potentially
 * adding `isSerendipity` to the returned shape. Use this from the
 * route to keep candidate sorting logic identical to what tests
 * exercise.
 */
export function selectPersonalizedSlate<C extends PersonalizedCandidate>(
  candidates: C[],
  opts: { totalSlots?: number; primarySlots?: number } = {},
): PersonalizedSlate<C & { isSerendipity?: boolean }> {
  const totalSlots = opts.totalSlots ?? 6;
  const primarySlots = opts.primarySlots ?? 5;
  if (primarySlots > totalSlots) {
    throw new Error("primarySlots must be ≤ totalSlots");
  }

  // (1) Sort by final_score = quality × affinity, descending; id asc tiebreak.
  const sorted = [...candidates].sort((a, b) => {
    const fa = a.qualityScore * a.personalAffinity;
    const fb = b.qualityScore * b.personalAffinity;
    if (fb !== fa) return fb - fa;
    return a.id - b.id;
  });

  // (2) Greedy distinct-source diversity pass for the primary slots.
  const seenSources = new Set<number>();
  const firstPass: C[] = [];
  const secondPass: C[] = [];
  for (const c of sorted) {
    if (!seenSources.has(c.sourceItemId)) {
      firstPass.push(c);
      seenSources.add(c.sourceItemId);
    } else {
      secondPass.push(c);
    }
  }
  const primary = [...firstPass, ...secondPass].slice(0, primarySlots);

  // (3) Serendipity pick: highest RAW qualityScore from candidates not
  // chosen for primary slots; prefer a source not already in primary.
  const primaryIdSet = new Set<number>(primary.map((c) => c.id));
  const primarySrcSet = new Set<number>(primary.map((c) => c.sourceItemId));
  const remaining = sorted
    .filter((c) => !primaryIdSet.has(c.id))
    .sort((a, b) => {
      const qd = b.qualityScore - a.qualityScore;
      if (qd !== 0) return qd;
      return a.id - b.id;
    });

  let serendipityRow: C | undefined =
    remaining.find((c) => !primarySrcSet.has(c.sourceItemId)) ?? remaining[0];

  if (primary.length + 1 > totalSlots) {
    // Defensive: don't exceed the slot budget.
    serendipityRow = undefined;
  }

  const chosen: (C & { isSerendipity?: boolean })[] = [...primary];
  if (serendipityRow) {
    chosen.push({ ...serendipityRow, isSerendipity: true });
  }
  return {
    chosen,
    primaryIds: primary.map((c) => c.id),
    serendipityId: serendipityRow?.id ?? null,
  };
}
