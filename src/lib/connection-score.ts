/**
 * Centralized constants + helpers for cross_connection quality_score
 * mutations. Every place that writes quality_score should go through
 * SCORE_DELTAS and applyQualityDelta() so the score model has a single
 * source of truth and a single place to change deltas.
 *
 * Score model:
 *   - default 1.0
 *   - clamp [0.0, 2.0]
 *   - hide threshold (read-side): 0.3
 */

/** Per-signal delta applied to quality_score. See Section 3 of the
 *  Phase 1 design doc. Conservative — easier to tune up later. */
export const SCORE_DELTAS = {
  // Explicit votes (unchanged from existing behavior)
  voteUp: 0.1,
  voteDown: -0.1,

  // Connection-level dismiss (Stage 2a)
  dismissConnection: -0.15,

  // Downstream signals (Stage 2b) — tier ladder per (user, connection, item).
  // The credit table records the highest tier reached; firing a higher
  // tier later applies only the DIFFERENCE.
  //
  //   tier 1 — cover_click           : +0.02
  //   tier 2 — library add           : +0.15
  //   tier 3 — status completed/caught_up : +0.20  (i.e. +0.05 on top of tier 2)
  //   tier 4 — rating >= 4 stars     : +0.30  (replaces tier 2/3 credit)
  //   tier 5 — rating == 5 OR recommendTag = "recommend" : +0.40
  //
  // Reversals (tier going DOWN to 0 from the library_add lane only):
  //   library entry deleted          : -0.10 net (revert +0.15 then -0.10 penalty)
  //
  // Rating change reversals are handled as (newTierCredit - oldTierCredit).
  downstreamTierCredits: {
    1: 0.02,
    2: 0.15,
    3: 0.20,
    4: 0.30,
    5: 0.40,
  } as Record<1 | 2 | 3 | 4 | 5, number>,

  // Negative rating signal (rating <= 2 OR recommendTag = "skip") —
  // single-shot per (user, connection, item). Cannot be combined with
  // a positive tier credit for the same triple (the credit row is
  // updated, not appended).
  ratingNegative: -0.30,

  // Library-row deleted after being credited
  libraryDeletePenalty: -0.10,
} as const;

/** Clamp helper used by both Prisma and raw SQL paths. */
export function clampScore(s: number): number {
  if (Number.isNaN(s)) return 1.0;
  if (s < 0) return 0;
  if (s > 2) return 2;
  return s;
}

/** Early-data dampener — apply 50% delta until a connection has
 *  accumulated at least N signal events from real users. This keeps
 *  a 2-user bootstrap from swinging scores wildly. */
export const EARLY_DATA_THRESHOLD = 10;
export function dampener(eventCount: number): number {
  return eventCount < EARLY_DATA_THRESHOLD ? 0.5 : 1.0;
}

/** Attribution windows (days). */
export const ATTRIBUTION_WINDOWS = {
  /** library-add / cover-click attribution window */
  libraryDays: 14,
  /** rating attribution window — wider because people delay rating */
  ratingDays: 30,
} as const;
