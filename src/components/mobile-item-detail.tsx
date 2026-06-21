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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TYPES, hexToRgba, type Item, type Person } from "@/lib/data";
import { useIsMobile } from "@/lib/use-is-mobile";
import CrossShelfHero from "./crossshelf-hero";
import { useItemFranchise } from "@/lib/use-item-franchise";
import { useRatings } from "@/lib/ratings-context";
import { useLibrary, type LibraryStatus } from "@/lib/library-context";
import ShareButton from "./share-button";
import { ExpandableText } from "./expandable-text";

const STATUS_LABEL: Record<LibraryStatus, string> = {
  completed: "Completed", in_progress: "In progress", want_to: "Want to", dropped: "Dropped",
};

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
  // ── Franchise/series strip — DB-backed (same shared hook as the desktop
  // FranchiseBadge), linking the numeric /franchise/[id] route. Called BEFORE
  // the isMobile early-return so hook order stays stable across the
  // useIsMobile false→true post-hydration correction (a hook after the return
  // changes the hook count and trips the error boundary).
  const franchise = useItemFranchise(typeof item.id === "number" ? item.id : undefined);

  if (!isMobile) return null;

  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const creator = primaryCreator(item.people);
  const hasCover = item.cover?.startsWith("http") ?? false;
  const len = lengthLabel(item);
  const metaLine1 = [item.year || null, len].filter(Boolean).join(" · ");
  const genres = (item.genre || []).slice(0, 3).join(" · ");

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

      {/* CrossShelf Score hero (mobile variant) — score + composition bar +
          "what goes into this" pills + progressive disclosure (weights +
          distribution). Replaces the old fabricated 0–5 proxy. */}
      <div className="mid-hero-wrap">
        <CrossShelfHero item={item} variant="mobile" />
      </div>

      {/* Franchise / series strip — hidden for standalone items */}
      {franchise && (
        <Link href={`/franchise/${franchise.id}`} className="mid-franchise" aria-label={`Part of ${franchise.name}`}>
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
              {franchise.totalItems > 0 ? `${franchise.totalItems} entries` : "Series"}
              {item.year ? ` · ${item.year}` : ""}
            </div>
          </div>
          <span className="mid-franchise-chev" aria-hidden>›</span>
        </Link>
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

      {/* About — relocated here because the desktop hero (which holds the
          description) is CSS-hidden on mobile. */}
      {item.desc && item.desc.trim().length > 0 && (
        <div className="mid-section">
          <div className="mid-section-header"><span className="mid-section-title">About</span></div>
          <ExpandableText text={item.desc} compact toggleColor={t.color} />
        </div>
      )}

      {/* People — cast/creators (no desktop equivalent; built from item.people) */}
      {Array.isArray(item.people) && item.people.length > 0 && (
        <div className="mid-section">
          <div className="mid-section-header"><span className="mid-section-title">People</span></div>
          <div className="mid-people">
            {item.people.slice(0, 12).map((p, i) => (
              <div key={`${p.name}-${i}`} className="mid-person">
                <div className="mid-person-avatar" style={{ background: hexToRgba(t.color, 0.15), color: t.color }}>
                  {(p.name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                </div>
                <div className="mid-person-name">{p.name}</div>
                {p.role && <div className="mid-person-role">{p.role}</div>}
              </div>
            ))}
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

          .mid-hero-wrap { padding: 4px 16px 0; }

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

          .mid-section { padding: 24px 16px 0; }
          .mid-section-header { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .mid-section-title { font-family: var(--font-serif); font-size: 17px; font-weight: 500; color: #e8e6e1; }
          .mid-people { display: flex; gap: 12px; overflow-x: auto; margin: 0 -16px; padding: 0 16px 8px; scrollbar-width: none; }
          .mid-people::-webkit-scrollbar { display: none; }
          .mid-person { flex-shrink: 0; width: 72px; text-align: center; }
          .mid-person-avatar {
            width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 6px;
            display: flex; align-items: center; justify-content: center;
            font-family: var(--font-serif); font-size: 18px; font-weight: 500;
          }
          .mid-person-name { font-size: 11px; color: #e8e6e1; font-weight: 500; line-height: 1.2; }
          .mid-person-role { font-size: 9px; color: rgba(232,230,225,0.45); margin-top: 1px; }
        }
      `}</style>
    </div>
  );
}
