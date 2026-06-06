/**
 * Per-user personal-affinity for a cross-shelf connection (Stage 4).
 *
 * Computes a single number in [0.5, 1.5] expressing how well a
 * particular connection matches a particular user's taste, intended
 * to be multiplied onto the aggregate quality_score in Stage 4b.
 *
 * Stage 4a: helper is computed and emitted in the API response but
 * NOT applied to ordering yet.
 *
 * Formula (per the approved Phase 1 design):
 *
 *   affinity_raw  =  W_dim    * dim_match
 *                +  W_tag    * tag_match
 *                +  W_source * source_affinity
 *   affinity      =  0.5 + affinity_raw         ∈ [0.5, 1.5]
 *
 * Default weights: W_dim=0.50, W_tag=0.30, W_source=0.20.
 *
 * When dim_match cannot be computed (no rec item has populated
 * itemDimensions — common today since coverage is ~12%), W_dim's
 * weight is redistributed proportionally onto the other two
 * components: W_tag→0.60, W_source→0.40. This keeps affinity
 * meaningful even on the long tail of dim-less items.
 *
 * Pure function — no DB access. All inputs are pre-fetched by the
 * caller. Trivially unit-testable.
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
