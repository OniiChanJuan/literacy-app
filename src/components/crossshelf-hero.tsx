"use client";

/**
 * CrossShelfHero — the single most prominent score on the item detail page.
 *
 * Renders the locked CrossShelf Score treatment
 * (design/mockups/crossshelf-score-mockup-v2.html):
 *   - teal "CrossShelf" wordmark + 0–10 number (the hero),
 *   - a segmented composition bar (External teal / Community violet /
 *     Recommend gold) whose widths are each leg's renormalized contribution,
 *   - "what goes into this" pills (every real external source labeled at its
 *     real value; dashed "pending" pills for legs not active yet),
 *   - progressive disclosure: a quiet "How this score works" chevron expands to
 *     the plain-language explanation, the 50/35/15 weights, and the community
 *     rating-distribution bars (gated >=10).
 *
 * Score math is the single source of truth in lib/crossshelf-score.ts. The
 * component is rendered twice per page (a `desktop` and a `mobile` variant) but
 * only the variant matching the viewport mounts content + fetches — mirroring
 * the existing ItemSubBanner / MobileItemTop split so the aggregate is fetched
 * exactly once per breakpoint.
 */

import { useState, useEffect } from "react";
import type { Item } from "@/lib/data";
import { useIsMobile } from "@/lib/use-is-mobile";
import { computeCrossShelfScore, type CommunityAggregate } from "@/lib/crossshelf-score";
import { RatingDistribution } from "./aggregate-score";

interface AggResp {
  avg: string;
  count: number;
  dist: [number, number, number, number, number];
  recPct: number;
  recCount?: number;
  taggedCount?: number;
}

const TEAL = "#2EC4B6";
const VIOLET = "#9B5DE5";
const GOLD = "#DAA520";

const LEG_COLOR = { external: TEAL, community: VIOLET, recommend: GOLD } as const;
const LEG_LABEL = { external: "External", community: "Community", recommend: "Recommend" } as const;

export default function CrossShelfHero({
  item,
  variant,
}: {
  item: Item;
  variant: "desktop" | "mobile";
}) {
  const isMobile = useIsMobile();
  const active = variant === "mobile" ? isMobile : !isMobile;
  const [agg, setAgg] = useState<AggResp | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!active || typeof item.id !== "number") return;
    let cancelled = false;
    fetch(`/api/items/${item.id}/aggregate`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAgg(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active, item.id]);

  // Gate to the active breakpoint (after hooks, per rules of hooks).
  if (!active) return null;

  const community: CommunityAggregate | null = agg && agg.count > 0 ? {
    count: agg.count,
    avg5: parseFloat(agg.avg),
    dist: agg.dist,
    taggedCount: agg.taggedCount ?? 0,
    recommendCount: agg.recCount ?? 0,
  } : null;

  const score = computeCrossShelfScore(
    { ext: item.ext, type: item.type, voteCount: item.voteCount ?? 0 },
    community,
  );

  const isDash = score.score10 == null;
  const scoreStr = isDash ? "—" : score.score10!.toFixed(1);

  // Composition bar segments — only present legs, in fixed order.
  const segs = (["external", "community", "recommend"] as const)
    .map((leg) => ({ leg, w: score.composition[leg] }))
    .filter((s) => s.w > 0);

  // Real pills (collapsed + expanded): every external source at its real value,
  // plus an active community/recommend leg if one exists.
  const realPills: { key: string; label: string; value: string }[] = [];
  if (score.external) {
    for (const s of score.external.sources) realPills.push({ key: s.source, label: s.label, value: `${s.valueStr}${s.suffix}` });
  }
  if (score.community) realPills.push({ key: "community", label: "Community", value: `${score.community.avg5.toFixed(1)}/5` });
  if (score.recommend) realPills.push({ key: "recommend", label: "Recommend", value: `${score.recommend.recPct}%` });

  // Pending pills (expanded only): legs the title could earn but hasn't yet.
  const pendingPills: { key: string; label: string; note: string }[] = [];
  if (!score.community) pendingPills.push({ key: "community-pending", label: "Community", note: "at 10 ratings" });
  if (!score.recommend) pendingPills.push({ key: "recommend-pending", label: "Recommend", note: "at 5 tags" });

  // Plain-language explanation (honest about the external-heavy reality).
  let explanation: string;
  if (isDash) {
    explanation = score.reason === "comic"
      ? "Comics have no external critic source, so the score waits on community ratings. It blends external critics (50%), community ratings (35%), and recommendations (15%) — none are available here yet."
      : "Not enough data to score this yet. The CrossShelf Score blends external critics (50%), community ratings (35%), and recommendations (15%) — it appears once at least one of those is available.";
  } else if (segs.length === 1 && segs[0].leg === "external") {
    explanation = "The CrossShelf Score blends three sources. Right now it's built entirely from external critics — community and recommend join in once this title has enough ratings.";
  } else {
    explanation = "The CrossShelf Score blends external critics, community ratings, and recommendations — reweighted across whichever are available for this title.";
  }

  const cls = `csh${variant === "mobile" ? " csh--mobile" : ""}`;

  return (
    <div className={cls}>
      <div className="csh-hero">
        <div className="csh-top">
          <div className="csh-num-block">
            <span className="csh-mark">CrossShelf</span>
            <span className="csh-num" style={isDash ? { color: "rgba(232,230,225,0.34)" } : undefined}>{scoreStr}</span>
            {!isDash && <span className="csh-slash">/10</span>}
          </div>

          <div className="csh-detail">
            {isDash ? (
              <div className="csh-dashline">
                {score.reason === "comic" ? "No external critic score for comics yet." : "Not rated yet."}
              </div>
            ) : (
              <>
                <div className="csh-bar">
                  {segs.map((s) => (
                    <div key={s.leg} className="csh-seg" style={{ width: `${s.w * 100}%`, background: LEG_COLOR[s.leg] }} />
                  ))}
                </div>
                <div className="csh-legend">
                  {segs.map((s) => (
                    <span key={s.leg}>
                      <span className="csh-sw" style={{ background: LEG_COLOR[s.leg] }} />
                      {LEG_LABEL[s.leg]} <span className="csh-pct">{Math.round(s.w * 100)}%</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {realPills.length > 0 && (
          <>
            <div className="csh-gi-label">What goes into this</div>
            <div className="csh-gi">
              {realPills.map((p) => (
                <span key={p.key} className="csh-pill"><b>{p.label}</b> {p.value}</span>
              ))}
              {expanded && pendingPills.map((p) => (
                <span key={p.key} className="csh-pill csh-pill--pending">{p.label} · {p.note}</span>
              ))}
            </div>
          </>
        )}

        <button className="csh-expand" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          <span className="csh-chev">{expanded ? "▴" : "▾"}</span> {expanded ? "Hide details" : "How this score works"}
        </button>

        {expanded && (
          <div className="csh-expanded">
            <div className="csh-exp-line">{explanation}</div>
            <div className="csh-weights">
              <div className="csh-weight"><span className="csh-wn" style={{ color: TEAL }}>50%</span>External critics</div>
              <div className="csh-weight"><span className="csh-wn" style={{ color: VIOLET }}>35%</span>Community <span className="csh-wnote">(10+ ratings)</span></div>
              <div className="csh-weight"><span className="csh-wn" style={{ color: GOLD }}>15%</span>Recommend <span className="csh-wnote">(5+ tags)</span></div>
            </div>
            {!realPills.length && pendingPills.length > 0 && (
              <div className="csh-gi" style={{ marginBottom: 12 }}>
                {pendingPills.map((p) => (
                  <span key={p.key} className="csh-pill csh-pill--pending">{p.label} · {p.note}</span>
                ))}
              </div>
            )}
            <RatingDistribution dist={agg?.dist ?? [0, 0, 0, 0, 0]} count={agg?.count ?? 0} />
          </div>
        )}
      </div>

      <style>{`
        .csh-hero {
          padding: 20px 22px;
          background: #14141c;
          border: 1px solid rgba(255,255,255,0.12);
          border-left: 3px solid ${TEAL};
          border-radius: 12px;
        }
        .csh-top { display: flex; align-items: center; gap: 24px; }
        .csh-num-block { text-align: center; flex-shrink: 0; }
        .csh-mark {
          display: block; font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
          color: ${TEAL}; margin-bottom: 3px;
        }
        .csh-num { font-family: var(--font-serif); font-weight: 500; color: #e8e6e1; line-height: 1; font-size: 48px; }
        .csh-slash { font-size: 14px; color: rgba(232,230,225,0.34); }
        .csh-detail { flex: 1; min-width: 0; }
        .csh-dashline { font-size: 12px; color: rgba(232,230,225,0.45); line-height: 1.5; }

        .csh-bar {
          height: 8px; border-radius: 4px; overflow: hidden; display: flex;
          background: rgba(255,255,255,0.06);
        }
        .csh-seg { height: 100%; }
        .csh-legend { display: flex; gap: 14px; margin-top: 9px; flex-wrap: wrap; }
        .csh-legend span { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; color: rgba(232,230,225,0.6); }
        .csh-sw { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
        .csh-pct { color: rgba(232,230,225,0.34); }

        .csh-gi-label {
          font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
          color: rgba(232,230,225,0.34); margin: 14px 0 8px;
        }
        .csh-gi { display: flex; gap: 8px; flex-wrap: wrap; }
        .csh-pill {
          display: flex; align-items: center; gap: 6px; font-size: 11px;
          padding: 5px 10px; border: 1px solid rgba(255,255,255,0.12);
          border-radius: 7px; color: rgba(232,230,225,0.6);
        }
        .csh-pill b { color: #e8e6e1; font-weight: 500; }
        .csh-pill--pending { border-style: dashed; color: rgba(232,230,225,0.34); }

        .csh-expand {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: 100%; margin-top: 14px; padding: 13px 0 0;
          border: none; border-top: 1px solid rgba(255,255,255,0.08);
          background: none; cursor: pointer;
          font-family: inherit; font-size: 11px; color: ${TEAL};
        }
        .csh-chev { font-size: 12px; }

        .csh-expanded { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08); }
        .csh-exp-line { font-size: 12px; color: rgba(232,230,225,0.6); line-height: 1.55; margin-bottom: 10px; }
        .csh-weights { display: flex; gap: 18px; margin: 12px 0; flex-wrap: wrap; }
        .csh-weight { font-size: 11px; color: rgba(232,230,225,0.6); }
        .csh-wn { font-family: var(--font-serif); font-size: 16px; display: block; }
        .csh-wnote { color: rgba(232,230,225,0.34); }

        /* Mobile variant — smaller hero number + padding, per the mockup. */
        .csh--mobile .csh-hero { padding: 15px; }
        .csh--mobile .csh-top { gap: 16px; }
        .csh--mobile .csh-mark { font-size: 9px; letter-spacing: 1.5px; }
        .csh--mobile .csh-num { font-size: 36px; }
        .csh--mobile .csh-slash { font-size: 11px; }
      `}</style>
    </div>
  );
}
