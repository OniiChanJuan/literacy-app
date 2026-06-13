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
import ShareButton from "./share-button";

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
  if (!isMobile) return null;

  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const creator = primaryCreator(item.people);
  const hasCover = item.cover?.startsWith("http") ?? false;
  const len = lengthLabel(item);
  const metaLine1 = [item.year || null, len].filter(Boolean).join(" · ");
  const genres = (item.genre || []).slice(0, 3).join(" · ");

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
        }
      `}</style>
    </div>
  );
}
