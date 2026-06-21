/**
 * The CrossShelf Score — the single source of truth for blending external,
 * community, and recommend signals into one 0–10 number.
 *
 * Locked design (June 2026, design/mockups/crossshelf-score-mockup-v2.html):
 *   score = external 50% + community 35% + recommend 15%
 *   — auto-renormalized over whichever legs are actually present, so a title
 *     with only external data scores on external alone (external → 100%).
 *   — community leg gates at >=10 ratings (below that it renormalizes out).
 *   — recommend leg gates at >=5 *tagged* ratings (tagged-only denominator).
 *   — no external source AND no qualifying community → null → the UI shows a
 *     dash. We never fabricate a number.
 *
 * External-leg source policy (applies to ALL types, not games-only):
 *   The external leg is the EQUAL-weighted average of whichever external
 *   sources have good data for the item, each normalized to 0–10. Three
 *   sources → average all three; one → that source is the leg. A player score
 *   (Steam, IGDB user) and a critic score (Metacritic, RT) count equally.
 *   spotify_popularity is EXCLUDED (popularity ≠ quality). Comics have no
 *   external rating source anywhere → permanent dash.
 *
 * This module is pure (no DB / no fetch). Callers supply the item's `ext`,
 * `type`, and external `voteCount`, plus a CommunityAggregate (or null).
 */

import { scorePassesThreshold } from "./score-thresholds";

// ── Canonical 0–10 scale table ───────────────────────────────────────────
/**
 * Native maximum of each source's stored value. THE single scale table —
 * `ranking.ts` and `format-ext-score.ts` import from here so there is exactly
 * one place that knows a source's scale. Normalize to 0–10 by `value * 10 / max`
 * (so /10 sources pass through, /100 ÷10, /5 ×2).
 */
export const SOURCE_SCALE: Record<string, number> = {
  // /10 native
  imdb: 10, tmdb: 10, mal: 10, google_books: 10, pitchfork: 10, ign: 10,
  // /100 native
  anilist: 100, rt_critics: 100, rt_audience: 100, metacritic: 100,
  igdb: 100, igdb_critics: 100, steam: 100, spotify_popularity: 100,
  aoty: 100, opencritic: 100,
  // /5 native
  comicvine: 5, rym: 5, letterboxd: 5, storygraph: 5,
};

/** Normalize a raw source value to the canonical 0–10 scale. */
export function normalizeTo10(source: string, value: number): number {
  const max = SOURCE_SCALE[source] ?? 10;
  return (value * 10) / max;
}

// ── Canonical external quality-source set (feeds the external leg) ────────
export type ExternalSourceKind = "critic" | "player" | "audience";

interface ExternalSourceMeta {
  /** Human label for the "what goes into this" pill. */
  label: string;
  /** critic = press aggregate; player = storefront/user store score; audience = broad public rating. */
  kind: ExternalSourceKind;
  /** Pill value suffix, e.g. "/10", "%", "/100". */
  suffix: string;
}

/**
 * The ONLY external sources that feed the score, with their display metadata.
 * Order here is the canonical source order (replaces the two prior, disagreeing
 * lists: ranking.ts per-type chains and format-ext-score COMPACT_PRIORITY).
 * Anything not in this map never contributes to the score:
 *   - spotify_popularity → excluded (popularity, surfaced separately if at all)
 *   - comicvine → excluded (metadata DB, not a rating source)
 *   - igdb_count / igdb_critics_count / steam_label / pages / nyt → not scores
 */
export const EXTERNAL_SOURCES: Record<string, ExternalSourceMeta> = {
  imdb:         { label: "IMDb",            kind: "audience", suffix: "/10"  },
  tmdb:         { label: "TMDB",            kind: "audience", suffix: "/10"  },
  mal:          { label: "MyAnimeList",     kind: "audience", suffix: "/10"  },
  anilist:      { label: "AniList",         kind: "audience", suffix: "/100" },
  google_books: { label: "Google Books",    kind: "audience", suffix: "/10"  },
  rt_critics:   { label: "Rotten Tomatoes", kind: "critic",   suffix: "%"    },
  rt_audience:  { label: "RT Audience",     kind: "audience", suffix: "%"    },
  metacritic:   { label: "Metacritic",      kind: "critic",   suffix: "/100" },
  igdb_critics: { label: "Critic Score",    kind: "critic",   suffix: "/100" },
  igdb:         { label: "Player Score",    kind: "player",   suffix: "/100" },
  steam:        { label: "Steam",           kind: "player",   suffix: "%"    },
  pitchfork:    { label: "Pitchfork",       kind: "critic",   suffix: "/10"  },
  ign:          { label: "IGN",             kind: "critic",   suffix: "/10"  },
  opencritic:   { label: "OpenCritic",      kind: "critic",   suffix: "/100" },
  aoty:         { label: "AOTY",            kind: "critic",   suffix: "/100" },
};

/** Types that have no external rating source anywhere → permanent dash. */
const NO_EXTERNAL_TYPES = new Set(["comic"]);

// ── Public shapes ─────────────────────────────────────────────────────────
export const CROSSSHELF_WEIGHTS = { external: 0.5, community: 0.35, recommend: 0.15 } as const;
export const COMMUNITY_MIN_RATINGS = 10;
export const RECOMMEND_MIN_TAGS = 5;

export interface CommunityAggregate {
  /** Number of star ratings on the item. */
  count: number;
  /** Mean star rating, 0–5. */
  avg5: number;
  /** Star distribution, index 0 = 1★ … index 4 = 5★. Optional (display only). */
  dist?: [number, number, number, number, number];
  /** Number of ratings carrying a recommend/mixed/skip tag (the recPct denominator). */
  taggedCount: number;
  /** Number of those tagged "recommend". */
  recommendCount: number;
}

export interface ExternalSourcePill {
  source: string;
  label: string;
  kind: ExternalSourceKind;
  /** Raw stored value (native scale). */
  value: number;
  /** Value normalized to 0–10. */
  normalized10: number;
  /** Pre-formatted display value, e.g. "8.4", "91". */
  valueStr: string;
  /** Suffix to render after valueStr, e.g. "/10", "%". */
  suffix: string;
}

export interface LegBreakdown {
  /** Leg contribution on the 0–10 scale. */
  score10: number;
  /** Weight after renormalization (fraction of the final score; segments of the composition bar). */
  weight: number;
}

export interface CrossShelfScore {
  /** Final blended score 0–10, or null when there is nothing real to show (→ dash). */
  score10: number | null;
  external: (LegBreakdown & { sources: ExternalSourcePill[] }) | null;
  community: (LegBreakdown & { count: number; avg5: number }) | null;
  recommend: (LegBreakdown & { recPct: number; taggedCount: number }) | null;
  /**
   * Legs that this item COULD have but that are gated out today (too few
   * ratings/tags) — rendered as dashed "pending" pills, never as a score.
   */
  pending: { community: boolean; recommend: boolean };
  /**
   * Segment fractions for the composition bar (sum to 1 when score10 != null,
   * all 0 when null). Mirrors each leg's `weight`.
   */
  composition: { external: number; community: number; recommend: number };
  /** Why the score is null, for empty-state copy/debugging. */
  reason: "comic" | "no-external-or-community" | null;
}

// ── External leg ──────────────────────────────────────────────────────────
/**
 * Equal-weighted average of every qualifying external source for the item,
 * each normalized to 0–10. Returns null when no source qualifies (→ the leg
 * is absent and the score renormalizes onto the other legs, or dashes).
 */
export function computeExternalLeg(
  ext: Record<string, unknown> | null | undefined,
  type: string,
  voteCount: number,
): { score10: number; sources: ExternalSourcePill[] } | null {
  if (NO_EXTERNAL_TYPES.has(type)) return null;
  if (!ext || typeof ext !== "object") return null;

  const sources: ExternalSourcePill[] = [];
  for (const source of Object.keys(EXTERNAL_SOURCES)) {
    const raw = (ext as Record<string, unknown>)[source];
    if (typeof raw !== "number" || !isFinite(raw)) continue;
    // Same confidence gate as display/ranking (small-sample community sources
    // are suppressed; editorial sources are threshold 0 = always count).
    if (!scorePassesThreshold(source, ext as Record<string, number>, voteCount)) continue;

    const meta = EXTERNAL_SOURCES[source];
    const normalized10 = normalizeTo10(source, raw);
    const nativeMax = SOURCE_SCALE[source] ?? 10;
    sources.push({
      source,
      label: meta.label,
      kind: meta.kind,
      value: raw,
      normalized10,
      valueStr: nativeMax <= 10 ? raw.toFixed(1) : String(Math.round(raw)),
      suffix: meta.suffix,
    });
  }

  if (sources.length === 0) return null;
  const score10 = sources.reduce((a, s) => a + s.normalized10, 0) / sources.length;
  return { score10, sources };
}

// ── Full blend ────────────────────────────────────────────────────────────
export function computeCrossShelfScore(
  item: { ext: Record<string, unknown> | null | undefined; type: string; voteCount: number },
  community: CommunityAggregate | null,
): CrossShelfScore {
  const external = computeExternalLeg(item.ext, item.type, item.voteCount);

  // Community leg — gated at >=10 ratings.
  const hasCommunityData = !!community && community.count > 0;
  const communityQualifies = !!community && community.count >= COMMUNITY_MIN_RATINGS;
  const communityScore10 = communityQualifies ? clamp10(community!.avg5 * 2) : null;

  // Recommend leg — gated at >=5 tagged ratings, tagged-only denominator.
  const recommendQualifies = !!community && community.taggedCount >= RECOMMEND_MIN_TAGS;
  const recPct = recommendQualifies
    ? (community!.recommendCount / community!.taggedCount) * 100
    : null;
  const recommendScore10 = recPct != null ? clamp10(recPct / 10) : null;

  // Renormalize weights over present legs.
  const present: { leg: "external" | "community" | "recommend"; weight: number; score10: number }[] = [];
  if (external) present.push({ leg: "external", weight: CROSSSHELF_WEIGHTS.external, score10: external.score10 });
  if (communityScore10 != null) present.push({ leg: "community", weight: CROSSSHELF_WEIGHTS.community, score10: communityScore10 });
  if (recommendScore10 != null) present.push({ leg: "recommend", weight: CROSSSHELF_WEIGHTS.recommend, score10: recommendScore10 });

  const totalW = present.reduce((a, p) => a + p.weight, 0);
  const composition = { external: 0, community: 0, recommend: 0 };
  let score10: number | null = null;
  if (totalW > 0) {
    score10 = present.reduce((a, p) => a + p.score10 * (p.weight / totalW), 0);
    for (const p of present) composition[p.leg] = p.weight / totalW;
  }

  const norm = (leg: "external" | "community" | "recommend") =>
    composition[leg];

  return {
    score10: score10 == null ? null : round1(score10),
    external: external
      ? { score10: round1(external.score10), weight: norm("external"), sources: external.sources }
      : null,
    community: communityScore10 != null
      ? { score10: round1(communityScore10), weight: norm("community"), count: community!.count, avg5: community!.avg5 }
      : null,
    recommend: recommendScore10 != null
      ? { score10: round1(recommendScore10), weight: norm("recommend"), recPct: Math.round(recPct!), taggedCount: community!.taggedCount }
      : null,
    pending: {
      // "Pending" = the item could earn this leg but hasn't yet (has some
      // ratings/tags, just below threshold). A comic with no community data
      // shows neither pending pill.
      community: !communityQualifies && hasCommunityData,
      recommend: !recommendQualifies && !!community && community.taggedCount > 0,
    },
    composition,
    reason: score10 == null
      ? (NO_EXTERNAL_TYPES.has(item.type) ? "comic" : "no-external-or-community")
      : null,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────
function clamp10(n: number): number {
  return Math.max(0, Math.min(10, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
