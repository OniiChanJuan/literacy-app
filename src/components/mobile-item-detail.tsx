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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TYPES, hexToRgba, type Item, type Person } from "@/lib/data";
import { useIsMobile } from "@/lib/use-is-mobile";
import { getBestExtScore, formatExtScores } from "@/lib/format-ext-score";
import { getFranchiseForItem } from "@/lib/franchises";
import { useRatings } from "@/lib/ratings-context";
import { useLibrary, type LibraryStatus } from "@/lib/library-context";
import ShareButton from "./share-button";

const STATUS_LABEL: Record<LibraryStatus, string> = {
  completed: "Completed", in_progress: "In progress", want_to: "Want to", dropped: "Dropped",
};

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

export default function MobileItemTop({ item, routeId }: { item: Item; routeId: string }) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { ratings } = useRatings();
  const { entries } = useLibrary();
  const [agg, setAgg] = useState<AggregateData | null>(null);
  const [pillsExpanded, setPillsExpanded] = useState(false);

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

  // ── Franchise/series strip — same source as the desktop FranchiseBadge
  // (lib/franchises), so the /franchise/[slug] link is guaranteed valid and
  // the strip is hidden for standalone items. Position derived from the
  // franchise's item order. */
  const franchise = getFranchiseForItem(routeId);
  const franchisePos = franchise ? franchise.items.findIndex((it) => it.routeId === routeId) : -1;
  const franchiseTotal = franchise ? franchise.items.length : 0;

  // ── Contributing scores ("What goes into this") — external scores from
  // item.ext, plus Community (>=10 ratings) and Recommend% (>=5 recommend
  // tags). Cap 3 visible + a "+N more" expander. */
  type Pill = { source: string; value: string };
  const extPills: Pill[] = formatExtScores(item.ext, item.voteCount ?? 0)
    .map((s) => ({ source: s.label, value: s.valueStr + (s.suffix || "") }));
  const contribPills: Pill[] = [...extPills];
  if (ratingCount >= 10) contribPills.push({ source: "Community", value: agg!.avg });
  if ((agg?.recCount ?? 0) >= 5) contribPills.push({ source: "Recommend", value: `${agg!.recPct}%` });
  const visiblePills = pillsExpanded ? contribPills : contribPills.slice(0, 3);
  const hiddenPillCount = contribPills.length - visiblePills.length;

  // ── Your activity vs Rate prompt — engaged = rated and/or has a library
  // status (gold card); otherwise the dashed-teal Rate prompt. */
  const userRating = typeof item.id === "number" ? (ratings[item.id] || 0) : 0;
  const libStatus = typeof item.id === "number" ? entries[item.id]?.status : undefined;
  const engaged = userRating > 0 || !!libStatus;

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

      {/* Franchise / series strip — hidden for standalone items */}
      {franchise && (
        <Link href={`/franchise/${franchise.slug}`} className="mid-franchise" aria-label={`Part of ${franchise.name}`}>
          <div className="mid-franchise-thumb" style={{ background: `linear-gradient(135deg, ${hexToRgba(t.color, 0.18)}, ${hexToRgba(t.color, 0.05)})` }}>
            {hasCover
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={item.cover} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <span style={{ fontSize: 14 }}>{franchise.icon}</span>}
          </div>
          <div className="mid-franchise-text">
            <div className="mid-franchise-label">Part of</div>
            <div className="mid-franchise-name">{franchise.name}</div>
            <div className="mid-franchise-pos">
              {franchisePos >= 0 ? `${t.label.replace(/s$/, "")} ${franchisePos + 1} of ${franchiseTotal}` : `${franchiseTotal} entries`}
              {item.year ? ` · ${item.year}` : ""}
            </div>
          </div>
          <span className="mid-franchise-chev" aria-hidden>›</span>
        </Link>
      )}

      {/* Contributing scores — cap 3 + "+N more" expander */}
      {contribPills.length > 0 && (
        <div className="mid-contrib">
          <div className="mid-contrib-label">What goes into this</div>
          <div className="mid-contrib-grid">
            {visiblePills.map((p) => (
              <span key={p.source} className="mid-contrib-pill">
                <span className="mid-contrib-src">{p.source}</span>
                <span className="mid-contrib-val">{p.value}</span>
              </span>
            ))}
            {hiddenPillCount > 0 && (
              <button className="mid-contrib-more" onClick={() => setPillsExpanded(true)}>
                + {hiddenPillCount} more
              </button>
            )}
          </div>
        </div>
      )}

      {/* Rating distribution — only with >=10 community ratings (empty bars
          below threshold would mislead). */}
      {ratingCount >= 10 && agg && (
        <div className="mid-dist">
          <div className="mid-dist-header">
            <span className="mid-dist-title">How others rated it</span>
            <span className="mid-dist-count">{agg.count} ratings</span>
          </div>
          {[5, 4, 3, 2, 1].map((star) => {
            const pct = agg.count > 0 ? Math.round((agg.dist[star - 1] / agg.count) * 100) : 0;
            return (
              <div key={star} className="mid-dist-row">
                <span className="mid-dist-stars">{"★".repeat(star)}</span>
                <span className="mid-dist-bar"><span className="mid-dist-bar-fill" style={{ width: `${pct}%` }} /></span>
                <span className="mid-dist-pct">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Your activity (engaged) vs Rate prompt (not engaged) */}
      {engaged ? (
        <div className="mid-activity">
          <div className="mid-activity-label">Your activity</div>
          <div className="mid-activity-content">
            {userRating > 0 && (
              <>
                <span>You rated this</span>
                <span className="mid-activity-stars">{"★".repeat(userRating)}</span>
              </>
            )}
            {userRating > 0 && libStatus && <span>·</span>}
            {libStatus && <span>{STATUS_LABEL[libStatus]}</span>}
          </div>
        </div>
      ) : (
        <button className="mid-rate-prompt" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}>
          <div className="mid-rate-prompt-text">Seen this? Help others discover it.</div>
          <div className="mid-rate-prompt-action">Rate now →</div>
        </button>
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

          .mid-franchise {
            display: flex; align-items: center; gap: 10px;
            margin: 14px 16px 0; padding: 10px 12px;
            background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
            border-radius: 6px; text-decoration: none;
          }
          .mid-franchise-thumb {
            width: 32px; height: 48px; border-radius: 3px; flex-shrink: 0;
            overflow: hidden; display: flex; align-items: center; justify-content: center;
          }
          .mid-franchise-text { flex: 1; min-width: 0; }
          .mid-franchise-label {
            font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
            color: rgba(232,230,225,0.45); margin-bottom: 2px;
          }
          .mid-franchise-name {
            font-family: var(--font-serif); font-size: 14px; font-weight: 500;
            color: #e8e6e1; line-height: 1.2;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          }
          .mid-franchise-pos { font-size: 10px; color: rgba(232,230,225,0.45); margin-top: 2px; }
          .mid-franchise-chev { font-size: 20px; color: rgba(232,230,225,0.45); flex-shrink: 0; line-height: 1; }

          .mid-contrib { padding: 12px 16px 0; }
          .mid-contrib-label {
            font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
            color: rgba(232,230,225,0.45); margin-bottom: 8px;
          }
          .mid-contrib-grid { display: flex; flex-wrap: wrap; gap: 6px; }
          .mid-contrib-pill {
            padding: 4px 8px; background: rgba(255,255,255,0.04);
            border-radius: 4px; font-size: 11px;
          }
          .mid-contrib-src { color: rgba(232,230,225,0.45); margin-right: 4px; font-size: 10px; }
          .mid-contrib-val { color: #e8e6e1; font-weight: 500; }
          .mid-contrib-more {
            padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;
            background: rgba(46,196,182,0.08); color: #2EC4B6;
            border: 1px solid rgba(46,196,182,0.2);
          }

          .mid-dist { padding: 20px 16px 0; }
          .mid-dist-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
          .mid-dist-title { font-family: var(--font-serif); font-size: 14px; font-weight: 500; color: #e8e6e1; }
          .mid-dist-count { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: rgba(232,230,225,0.45); }
          .mid-dist-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
          .mid-dist-stars { width: 60px; font-size: 10px; color: rgba(232,230,225,0.55); white-space: nowrap; }
          .mid-dist-bar { flex: 1; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; position: relative; }
          .mid-dist-bar-fill { position: absolute; left: 0; top: 0; height: 100%; background: rgba(46,196,182,0.6); border-radius: 3px; }
          .mid-dist-pct { width: 32px; text-align: right; font-size: 10px; color: rgba(232,230,225,0.55); }

          .mid-activity {
            margin: 18px 16px 0; padding: 12px 14px;
            background: rgba(218,165,32,0.06); border-left: 2px solid rgba(218,165,32,0.4);
            border-radius: 0 6px 6px 0;
          }
          .mid-activity-label {
            font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
            color: rgba(218,165,32,0.85); margin-bottom: 4px;
          }
          .mid-activity-content { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #e8e6e1; }
          .mid-activity-stars { color: #DAA520; font-size: 13px; }

          .mid-rate-prompt {
            display: block; width: calc(100% - 32px); margin: 18px 16px 0; padding: 14px;
            background: rgba(46,196,182,0.06); border: 1px dashed rgba(46,196,182,0.25);
            border-radius: 8px; text-align: center; cursor: pointer;
          }
          .mid-rate-prompt-text { font-size: 13px; color: rgba(232,230,225,0.85); }
          .mid-rate-prompt-action {
            font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
            color: #2EC4B6; margin-top: 6px; font-weight: 500;
          }
        }
      `}</style>
    </div>
  );
}
