"use client";

/**
 * MobileItemTop — the mobile (<=640px) re-composition of the item detail
 * page's top cluster, per design/mobile/crossshelf-mobile-item-detail.html.
 *
 * Option C (hybrid): the heavy data-islands lower on the page (reviews,
 * recommendations, where-to, people) render once in _page-impl and are
 * restyled in place by CSS. Only the top cluster — header, hero, score row,
 * franchise strip, contributing pills, rating distribution, your-activity —
 * is re-composed here in the mockup's stacked order, because on desktop those
 * live inside the 3-column hero + the bundled ItemSubBanner and can't be
 * reordered by CSS alone.
 *
 * Mounts ONLY on mobile (useIsMobile gate → null on desktop), so it never
 * double-renders against the desktop hero / ItemSubBanner. The desktop hero is
 * CSS-hidden <=640; ItemSubBanner is mount-gated desktop-only (see _page-impl)
 * so the aggregate fetch happens exactly once per breakpoint.
 *
 * Sections are added per-commit (Phase 3b): this commit ships header + hero.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TYPES, hexToRgba, type Item, type Person } from "@/lib/data";
import { useIsMobile } from "@/lib/use-is-mobile";
import { getBestExtScore } from "@/lib/format-ext-score";
import ShareButton from "./share-button";

interface AggregateData {
  avg: string;
  count: number;
  dist: [number, number, number, number, number];
  recPct: number;
  recCount?: number;
}

const CREATOR_ROLES = ["Director", "Author", "Creator", "Developer", "Artist", "Musician", "Host"];

function primaryCreator(people: Person[]): Person | null {
  if (!Array.isArray(people) || people.length === 0) return null;
  return people.find((p) => CREATOR_ROLES.some((r) => (p.role || "").includes(r))) || people[0] || null;
}

/** "2003 · 201 min" / "2022 · 545 pages" style runtime/length, best-effort by type. */
function lengthLabel(item: Item): string | null {
  const n = item.totalEp;
  if (!n || n <= 0) return null;
  switch (item.type) {
    case "book": return `${n} pages`;
    case "tv": return `${n} episodes`;
    case "manga": case "comic": return `${n} chapters`;
    case "podcast": return `${n} episodes`;
    case "music": return `${n} tracks`;
    default: return null; // movies: minutes aren't reliably stored — omit
  }
}

export default function MobileItemTop({ item }: { item: Item }) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [agg, setAgg] = useState<AggregateData | null>(null);

  // Mobile-only fetch. The component renders null on desktop, but its hooks
  // still execute there — so guard the effect on isMobile so the aggregate is
  // fetched exactly once (ItemSubBanner skips its fetch on mobile in turn).
  useEffect(() => {
    if (!isMobile || typeof item.id !== "number") return;
    let cancelled = false;
    fetch(`/api/items/${item.id}/aggregate`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAgg(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isMobile, item.id]);

  if (!isMobile) return null;

  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const creator = primaryCreator(item.people);
  const hasCover = item.cover?.startsWith("http") ?? false;
  const len = lengthLabel(item);
  const metaLine1 = [item.year || null, len].filter(Boolean).join(" · ");
  const genres = (item.genre || []).slice(0, 3).join(" · ");

  // ── CrossShelf score (deferred contents: current 0-5 number, NO wordmark,
  // NO /10, NO "blended from N" text — those land in the CrossShelf Score
  // session). Number derives from the best external score (same as cards),
  // falling back to the community average. Treatment is teal when the blend
  // is robust (>=10 community ratings AND >=1 external score), else neutral. */
  const best = getBestExtScore(item.ext, item.voteCount ?? 0);
  const extNorm10 = best && best.kind === "numeric" ? (best.value / best.max) * 10 : null;
  const hasExternal = extNorm10 != null;
  const ratingCount = agg?.count ?? 0;
  const score05 = hasExternal
    ? Math.min(5, extNorm10! * 0.55)
    : (ratingCount > 0 ? parseFloat(agg!.avg) : null);
  const robust = ratingCount >= 10 && hasExternal;

  return (
    <div className="mobile-item-top">
      {/* Sticky header — back · truncated title · share */}
      <div className="mid-header">
        <button onClick={() => router.back()} aria-label="Back" className="mid-back">←</button>
        <div className="mid-header-title">{item.title}</div>
        <ShareButton title={item.title} />
      </div>

      {/* Hero — cover + meta */}
      <div className="mid-hero">
        <div className="mid-cover" style={{ background: `linear-gradient(135deg, ${hexToRgba(t.color, 0.18)}, ${hexToRgba(t.color, 0.05)})` }}>
          {hasCover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.cover} alt={item.title} loading="eager" decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          )}
        </div>
        <div className="mid-hero-meta">
          <span className="mid-badge" style={{ color: t.color, background: hexToRgba(t.color, 0.12) }}>
            {t.label.replace(/s$/, "")}
          </span>
          <h1 className="mid-title">{item.title}</h1>
          {creator && <div className="mid-creator">{creator.name}</div>}
          <div className="mid-meta-info">
            {metaLine1}
            {genres && <><br />{genres}</>}
          </div>
        </div>
      </div>

      {/* CrossShelf score row — teal-tinted (robust) vs neutral (thin) */}
      {score05 != null && (
        <div
          className="mid-score"
          style={robust
            ? { background: "rgba(46,196,182,0.05)", border: "1px solid rgba(46,196,182,0.15)" }
            : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(232,230,225,0.08)" }}
        >
          <div className="mid-score-num">{score05.toFixed(1)}</div>
          <div className="mid-score-right">
            <div className="mid-score-bar">
              <div className="mid-score-bar-fill" style={{ width: `${Math.min(100, Math.max(0, (score05 / 5) * 100))}%` }} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* This whole cluster is mobile-only; the component already returns
           null on desktop, but the guard keeps it invisible during the brief
           pre-hydration window too. */
        .mobile-item-top { display: none; }
        @media (max-width: 640px) {
          .mobile-item-top { display: block; }

          .mid-header {
            position: sticky; top: 0; z-index: 12;
            display: flex; align-items: center; gap: 12px;
            padding: 14px 14px;
            background: rgba(10,10,15,0.95);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid rgba(255,255,255,0.04);
          }
          .mid-back {
            background: none; border: none; cursor: pointer; padding: 0;
            font-size: 22px; line-height: 1; color: rgba(232,230,225,0.85);
            min-height: var(--touch-target); display: flex; align-items: center;
          }
          .mid-header-title {
            flex: 1; min-width: 0;
            font-family: var(--font-serif); font-size: 14px;
            color: rgba(232,230,225,0.85);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          }

          .mid-hero { display: flex; gap: 16px; align-items: flex-start; padding: 20px 16px 16px; }
          .mid-cover {
            width: 120px; height: 180px; border-radius: 6px;
            flex-shrink: 0; overflow: hidden;
            border: 0.5px solid rgba(255,255,255,0.1);
          }
          .mid-hero-meta { flex: 1; min-width: 0; }
          .mid-badge {
            display: inline-block; font-size: 9px; letter-spacing: 1.5px;
            text-transform: uppercase; padding: 2px 6px; border-radius: 3px;
            margin-bottom: 8px;
          }
          .mid-title {
            font-family: var(--font-serif); font-size: 22px; font-weight: 500;
            color: #e8e6e1; line-height: 1.15; margin: 0 0 6px 0;
          }
          .mid-creator { font-size: 12px; color: rgba(232,230,225,0.65); margin-bottom: 6px; }
          .mid-meta-info { font-size: 11px; color: rgba(232,230,225,0.45); line-height: 1.5; }

          .mid-score {
            margin: 4px 16px 0; padding: 14px 16px; border-radius: 8px;
            display: flex; align-items: center; gap: 16px;
          }
          .mid-score-num {
            font-family: var(--font-serif); font-size: 36px; font-weight: 500;
            color: #e8e6e1; line-height: 1; flex-shrink: 0;
          }
          .mid-score-right { flex: 1; }
          .mid-score-bar {
            height: 6px; background: rgba(255,255,255,0.08);
            border-radius: 3px; position: relative;
          }
          .mid-score-bar-fill {
            position: absolute; left: 0; top: 0; height: 100%;
            background: #2EC4B6; border-radius: 3px;
          }
        }
      `}</style>
    </div>
  );
}
