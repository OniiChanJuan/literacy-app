/**
 * Shared ext-score formatting for Card + HoverPreview + (optionally) the
 * detail-page ExternalScoresPanel.
 *
 * Rules this file enforces, single-source-of-truth:
 *
 *   • `igdb_count`, `igdb_critics_count`, `google_books_count`, `steam_label`
 *     are NEVER rendered as scores.
 *   • IGDB collapses to a single "Critic Score": prefer `igdb_critics`
 *     (aggregated press score), fall back to `igdb` labeled "User Score".
 *     The literal label "IGDB" is never shown.
 *   • Steam is rendered as its text label ("Very Positive", etc.) on both
 *     card/hover and detail — NEVER as a raw 0-100 number. Uses
 *     `ext.steam_label` if present, otherwise computes one from `ext.steam`.
 *   • Every score is range-thresholded via scorePassesThreshold() so
 *     tiny-sample scores never surface.
 */

import { scorePassesThreshold } from "./score-thresholds";

export type ExtScoreKind = "numeric" | "steam-text";

export interface FormattedExtScore {
  /** Stable key used for React lists. */
  key: string;
  /** Internal source id from ext, useful for routing/debugging. */
  source: string;
  /** Human-readable label shown next to the value, e.g. "IMDb", "Critic Score", "Steam". */
  label: string;
  /** "numeric" = show value + suffix; "steam-text" = show textLabel only. */
  kind: ExtScoreKind;
  /** Raw value (present on numeric kind). */
  value: number;
  /** Max possible value (10, 100, 5, etc.). */
  max: number;
  /** Display string without label, e.g. "8.4" or "92". */
  valueStr: string;
  /** "/10", "/100", "%", or "" — whatever matches the source convention. */
  suffix: string;
  /** For Steam only: the text label ("Very Positive" etc.). */
  textLabel?: string;
  /** Hex color for positive/mid/negative bands. Always set. */
  color: string;
}

const COLOR_GOOD = "#2EC4B6";
const COLOR_MID = "#F9A620";
const COLOR_POOR = "#E84855";

/** Keys in ext that must never appear as a rendered score. */
const HIDDEN_KEYS = new Set([
  "igdb_count",
  "igdb_critics_count",
  "google_books_count",
  "steam_label",
]);

interface SourceMeta {
  label: string;
  max: number;
  suffix: string;
}
const SOURCE_META: Record<string, SourceMeta> = {
  imdb:               { label: "IMDb",        max: 10,  suffix: "/10"  },
  tmdb:               { label: "TMDB",        max: 10,  suffix: "/10"  },
  mal:                { label: "MAL",         max: 10,  suffix: "/10"  },
  google_books:       { label: "Books",       max: 5,   suffix: "/5"   },
  rt_critics:         { label: "RT",          max: 100, suffix: "%"    },
  metacritic:         { label: "Metacritic",  max: 100, suffix: ""     },
  pitchfork:          { label: "Pitchfork",   max: 10,  suffix: "/10"  },
  ign:                { label: "IGN",         max: 10,  suffix: "/10"  },
  spotify_popularity: { label: "Spotify",     max: 100, suffix: "/100" },
  aoty:               { label: "AOTY",        max: 100, suffix: "/100" },
  opencritic:         { label: "OpenCritic",  max: 100, suffix: "/100" },
  anilist:            { label: "AniList",     max: 100, suffix: "/100" },
};

/** Priority when picking the single "best" score for a compact card badge. */
const COMPACT_PRIORITY = [
  "imdb",
  "tmdb",
  "mal",
  "igdb_critics",
  "igdb",
  "google_books",
  "rt_critics",
  "metacritic",
  "pitchfork",
  "ign",
  "steam",
  "spotify_popularity",
  "aoty",
  "opencritic",
  "anilist",
];

function scoreColor(value: number, max: number): string {
  const pct = value / max;
  if (pct >= 0.75) return COLOR_GOOD;
  if (pct >= 0.5) return COLOR_MID;
  return COLOR_POOR;
}

/** Steam's public review thresholds, 0-100. */
export function steamLabelFor(score: number): string {
  if (score >= 95) return "Overwhelmingly Positive";
  if (score >= 80) return "Very Positive";
  if (score >= 70) return "Mostly Positive";
  if (score >= 40) return "Mixed";
  if (score >= 20) return "Mostly Negative";
  return "Overwhelmingly Negative";
}

/** Color to use for a Steam text label — matches detail-page styling. */
export function steamColorFor(label: string): string {
  if (label.includes("Overwhelmingly Positive") || label === "Very Positive") return COLOR_GOOD;
  if (label.includes("Positive")) return "rgba(46,196,182,0.85)";
  if (label === "Mixed") return COLOR_MID;
  return COLOR_POOR;
}

/** Format a single source+value pair. Returns null if it should be hidden. */
function formatOne(source: string, rawValue: unknown, ext: Record<string, unknown>, voteCount: number): FormattedExtScore | null {
  if (HIDDEN_KEYS.has(source)) return null;
  if (typeof rawValue !== "number" || !isFinite(rawValue)) return null;
  if (!scorePassesThreshold(source, ext as Record<string, number>, voteCount)) return null;

  // ── Steam: show as text label, never as a raw number ─────────────────
  if (source === "steam") {
    const label =
      (typeof ext.steam_label === "string" && ext.steam_label) ||
      steamLabelFor(rawValue);
    return {
      key: "steam",
      source: "steam",
      label: "Steam",
      kind: "steam-text",
      value: rawValue,
      max: 100,
      valueStr: label,
      suffix: "",
      textLabel: label,
      color: steamColorFor(label),
    };
  }

  // ── IGDB critics (aggregated press): label "Critic Score" ────────────
  if (source === "igdb_critics") {
    const max = 100;
    return {
      key: "igdb_critics",
      source: "igdb_critics",
      label: "Critic Score",
      kind: "numeric",
      value: rawValue,
      max,
      valueStr: String(Math.round(rawValue)),
      suffix: "/100",
      color: scoreColor(rawValue, max),
    };
  }

  // ── IGDB user rating (only shown if aggregated_rating missing) ───────
  if (source === "igdb") {
    const max = 100;
    return {
      key: "igdb",
      source: "igdb",
      label: "User Score",
      kind: "numeric",
      value: rawValue,
      max,
      valueStr: String(Math.round(rawValue)),
      suffix: "/100",
      color: scoreColor(rawValue, max),
    };
  }

  // ── Everything else: lookup in SOURCE_META ───────────────────────────
  const meta = SOURCE_META[source];
  if (!meta) return null; // unknown source — hide, don't render a raw key name
  const valueStr = meta.max <= 10 ? rawValue.toFixed(1) : String(Math.round(rawValue));
  return {
    key: source,
    source,
    label: meta.label,
    kind: "numeric",
    value: rawValue,
    max: meta.max,
    valueStr,
    suffix: meta.suffix,
    color: scoreColor(rawValue, meta.max),
  };
}

/**
 * Format every renderable ext score for an item, applying the IGDB collapse
 * rule (prefer critics, fall back to user).
 *
 * @param limit Optional cap on how many scores to return (hover preview shows ~3).
 */
export function formatExtScores(
  ext: unknown,
  voteCount: number,
  limit?: number,
): FormattedExtScore[] {
  if (!ext || typeof ext !== "object") return [];
  const e = ext as Record<string, unknown>;

  const results: FormattedExtScore[] = [];
  // Walk in priority order so the compact limit picks the "best" ones.
  for (const key of COMPACT_PRIORITY) {
    if (!(key in e)) continue;
    // IGDB collapse: if igdb_critics is present AND renderable, skip the
    // igdb entry entirely so we never show both.
    if (key === "igdb" && e.igdb_critics !== undefined && e.igdb_critics !== null) {
      const critics = formatOne("igdb_critics", e.igdb_critics, e, voteCount);
      if (critics) continue; // critics already accounted for when it was processed
    }
    const formatted = formatOne(key, e[key], e, voteCount);
    if (formatted) results.push(formatted);
    if (limit && results.length >= limit) break;
  }
  return results;
}

/**
 * Convenience for compact displays (Card corner badge) — the single
 * highest-priority score, or null if nothing qualifies.
 */
export function getBestExtScore(ext: unknown, voteCount: number): FormattedExtScore | null {
  const list = formatExtScores(ext, voteCount, 1);
  return list[0] ?? null;
}
