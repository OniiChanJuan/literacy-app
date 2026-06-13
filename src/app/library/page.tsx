"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ITEMS, TYPES, TYPE_ORDER, type MediaType, type Item } from "@/lib/data";
import { useLibrary, isOngoing, progressUnit, type LibraryStatus } from "@/lib/library-context";
import { useRatings } from "@/lib/ratings-context";
import Card from "@/components/card";
import type { FollowedFranchise } from "@/app/api/user/following/route";

function FollowingSection() {
  const [franchises, setFranchises] = useState<FollowedFranchise[] | null>(null);

  useEffect(() => {
    fetch("/api/user/following")
      .then((r) => r.json())
      .then((d) => setFranchises(Array.isArray(d) ? d : []))
      .catch(() => setFranchises([]));
  }, []);

  if (franchises === null) return null; // loading — render nothing
  if (franchises.length === 0) return null; // no franchises followed yet

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, color: "#E84855", fontWeight: 700 }}>♥</span>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 800, color: "#fff" }}>
          Following
        </span>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{franchises.length}</span>
      </div>

      {/* Franchise cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {franchises.map((f) => (
          <FranchiseCard key={f.id} franchise={f} />
        ))}
      </div>
    </div>
  );
}

function FranchiseCard({ franchise: f }: { franchise: FollowedFranchise }) {
  const progressPct = f.totalItems > 0 ? Math.round((f.ratedItems / f.totalItems) * 100) : 0;

  return (
    <Link
      href={`/franchise/${f.id}`}
      style={{
        width: 200, borderRadius: 12, overflow: "hidden", textDecoration: "none",
        background: "#141419", border: "0.5px solid rgba(255,255,255,0.07)",
        display: "flex", flexDirection: "column",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.4)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.boxShadow = "";
      }}
    >
      {/* Cover strip: 4 thumbnails or gradient */}
      <div style={{ height: 56, display: "flex", overflow: "hidden" }}>
        {f.coverThumbs.length > 0 ? (
          f.coverThumbs.slice(0, 4).map((src, i) => (
            <div key={i} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              <Image
                src={src}
                alt=""
                width={50}
                height={56}
                sizes="50px"
                unoptimized
                style={{ width: "100%", height: 56, objectFit: "cover", display: "block" }}
              />
            </div>
          ))
        ) : (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, rgba(232,72,85,0.12), rgba(232,72,85,0.05))",
            fontSize: 24,
          }}>
            {f.icon}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {f.icon} {f.name}
        </div>

        {/* Media type badges */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {f.mediaTypes.slice(0, 4).map(({ type, count }) => {
            const t = TYPES[type as MediaType];
            if (!t) return null;
            return (
              <span key={type} style={{
                fontSize: 9, padding: "2px 6px", borderRadius: 4,
                background: `${t.color}18`, color: t.color, fontWeight: 600,
              }}>
                {t.icon} {count}
              </span>
            );
          })}
        </div>

        {/* Progress bar: rated / total */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: "var(--text-faint)" }}>Rated</span>
            <span style={{ fontSize: 9, color: "var(--text-faint)" }}>
              {f.ratedItems}/{f.totalItems}
            </span>
          </div>
          <div style={{
            height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: progressPct === 100 ? "#2EC4B6" : "#E84855",
              width: `${progressPct}%`,
            }} />
          </div>
        </div>

        {f.followerCount > 1 && (
          <div style={{ fontSize: 9, color: "var(--text-faint)" }}>
            {f.followerCount} followers
          </div>
        )}
      </div>
    </Link>
  );
}

const STATUSES: { key: LibraryStatus; label: string; icon: string; color: string }[] = [
  { key: "completed",   label: "Completed",   icon: "✓", color: "#2EC4B6" },
  { key: "in_progress", label: "In Progress",  icon: "▶", color: "#3185FC" },
  { key: "want_to",     label: "Want To",      icon: "＋", color: "#9B5DE5" },
  { key: "dropped",     label: "Dropped",      icon: "✕", color: "#E84855" },
];

// Sort cycle — only options the data can honestly back (Phase 4a):
//   recent → entry.createdAt desc · rating → your score desc · alpha → title
// "Recent" is the default. There is no other reliable activity timestamp.
type SortKey = "recent" | "rating" | "alpha";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "rating", label: "Rating" },
  { key: "alpha",  label: "A–Z" },
];

// Build a lookup from static ITEMS for fallback
const STATIC_ITEMS_MAP = new Map<number, Item>();
for (const item of ITEMS) {
  STATIC_ITEMS_MAP.set(item.id, item);
}

export default function LibraryPage() {
  const { entries, items: dbItems } = useLibrary();
  const { ratings } = useRatings();
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState<MediaType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<LibraryStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");

  // Merge static items with DB items — DB items take priority
  const resolvedItems = useMemo(() => {
    const result: Record<number, Item> = {};
    for (const idStr of Object.keys(entries)) {
      const id = Number(idStr);
      // Try DB items first (includes all rated/reviewed items), then static fallback
      if (dbItems[id]) {
        result[id] = dbItems[id];
      } else if (STATIC_ITEMS_MAP.has(id)) {
        result[id] = STATIC_ITEMS_MAP.get(id)!;
      }
    }
    return result;
  }, [entries, dbItems]);

  // Group items by status
  const grouped = useMemo(() => {
    const g: Record<LibraryStatus, Item[]> = {
      completed: [],
      in_progress: [],
      want_to: [],
      dropped: [],
    };
    for (const [idStr, entry] of Object.entries(entries)) {
      const id = Number(idStr);
      const item = resolvedItems[id];
      if (item && g[entry.status]) {
        g[entry.status].push(item);
      }
    }
    return g;
  }, [entries, resolvedItems]);

  const totalTracked = Object.keys(entries).length;

  // Type filter + library-only title search + sort, applied per section.
  const q = query.trim().toLowerCase();
  const refine = (items: Item[]): Item[] => {
    let r = globalFilter === "all" ? items : items.filter((i) => i.type === globalFilter);
    if (q) r = r.filter((i) => i.title.toLowerCase().includes(q));
    const sorted = [...r];
    if (sort === "alpha") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "rating") {
      // Your score, high → low; unrated sink to the bottom, then alpha tiebreak
      sorted.sort((a, b) => (ratings[b.id] || 0) - (ratings[a.id] || 0) || a.title.localeCompare(b.title));
    } else {
      // recent — newest tracked first. Missing createdAt (optimistic insert) is
      // the most recent action, so it sorts to the top.
      const ts = (id: number) => { const c = entries[id]?.createdAt; return c ? Date.parse(c) : Infinity; };
      sorted.sort((a, b) => ts(b.id) - ts(a.id));
    }
    return sorted;
  };

  if (totalTracked === 0) {
    return (
      <div className="content-width">
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>📝</div>
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 20,
            fontWeight: 800,
            marginBottom: 6,
          }}>
            Nothing tracked yet
          </div>
          <div style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.4)",
            maxWidth: 340,
            margin: "0 auto 20px",
            lineHeight: 1.6,
          }}>
            Rate or track media to add it to your library, or import from another platform.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/explore" style={{
              display: "inline-block",
              padding: "8px 20px",
              borderRadius: 10,
              background: "rgba(232,72,85,0.1)",
              border: "1px solid rgba(232,72,85,0.3)",
              color: "#E84855",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}>
              Browse titles →
            </Link>
            <button
              onClick={() => router.push("/settings?tab=import")}
              style={{
                padding: "8px 20px",
                borderRadius: 10,
                background: "rgba(49,133,252,0.1)",
                border: "1px solid rgba(49,133,252,0.3)",
                color: "#3185FC",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📥 Import from Letterboxd, MAL…
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-width library-root">
      <style>{`
        /* Status pills — desktop look preserved; mobile compacts to a single
           5-across row of stacked (label-over-count) pills per the mockup. */
        .lib-status-pill {
          display: flex; align-items: center; gap: 7px;
          padding: 8px 14px; border-radius: 10px;
          font-family: inherit; line-height: 1.1;
          -webkit-tap-highlight-color: transparent;
        }
        .lib-status-pill:disabled { cursor: default; }
        .lib-status-pill-icon { font-size: 13px; }
        .lib-status-pill-num { font-size: 18px; font-weight: 700; }
        .lib-status-pill-label { font-size: 10px; color: var(--text-muted); }
        @media (max-width: 640px) {
          .lib-status-row { flex-wrap: nowrap !important; gap: 5px !important; }
          .lib-status-pill {
            flex: 1; min-width: 0;
            flex-wrap: wrap; justify-content: center; gap: 3px;
            padding: 8px 3px; border-radius: 8px; text-align: center;
          }
          .lib-status-pill-icon { order: 1; font-size: 10px; }
          .lib-status-pill-label {
            order: 2; font-size: 8px; text-transform: uppercase;
            letter-spacing: 0.3px; color: var(--pill-color); white-space: nowrap;
          }
          .lib-status-pill-num { order: 3; flex-basis: 100%; font-size: 16px; margin-top: 2px; }
        }

        /* Tools (search + sort): teal-tinted, square 4px corners — visually
           grouped as "tools", distinct from the round type-filter pills. */
        .lib-tool-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 5px;
          font-family: inherit; cursor: pointer; flex-shrink: 0;
          background: rgba(46,196,182,0.04); border: 1px solid rgba(46,196,182,0.18);
          border-radius: 4px; padding: 6px 10px; font-size: 13px; line-height: 1;
          -webkit-tap-highlight-color: transparent;
        }
        .lib-sort-btn { font-size: 10px; font-weight: 600; letter-spacing: 0.5px; }
        .lib-type-pill {
          display: inline-flex; align-items: center; gap: 4px;
          border-radius: 12px; padding: 5px 12px; font-size: 11px; font-weight: 600;
          font-family: inherit; cursor: pointer; flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
        }
        @media (max-width: 640px) {
          /* Icon-only type pills on mobile per the mockup; "All" keeps its text. */
          .lib-type-pill { padding: 6px 9px; border-radius: 14px; }
          .lib-type-pill-label { display: none; }
        }
      `}</style>
      {/* Header row: status pills + Import shortcut */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
      <div className="lib-status-row" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* "All" pill — neutral, resets the status filter to the default view */}
        {(() => {
          const active = statusFilter === "all";
          return (
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              aria-pressed={active}
              className="lib-status-pill lib-status-pill-all"
              style={{
                ["--pill-color" as string]: "#fff",
                background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <span className="lib-status-pill-num" style={{ color: "#fff" }}>{totalTracked}</span>
              <span className="lib-status-pill-label">All</span>
            </button>
          );
        })()}
        {STATUSES.map((s) => {
          const count = grouped[s.key].length;
          const active = statusFilter === s.key;
          const empty = count === 0;
          return (
            <button
              type="button"
              key={s.key}
              // Tapping the active pill toggles back to "all"; empty sections aren't selectable
              onClick={() => { if (!empty) setStatusFilter(active ? "all" : s.key); }}
              disabled={empty}
              aria-pressed={active}
              className="lib-status-pill"
              style={{
                ["--pill-color" as string]: s.color,
                background: active ? s.color + "28" : count > 0 ? s.color + "15" : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? s.color + "70" : count > 0 ? s.color + "40" : "rgba(255,255,255,0.06)"}`,
                opacity: empty ? 0.4 : 1,
                cursor: empty ? "default" : "pointer",
              }}
            >
              <span className="lib-status-pill-icon" style={{ color: s.color }}>{s.icon}</span>
              <span className="lib-status-pill-num" style={{ color: s.color }}>{count}</span>
              <span className="lib-status-pill-label">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Import shortcut button */}
      <button
        onClick={() => router.push("/settings?tab=import")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "7px 13px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "rgba(255,255,255,0.55)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        📥 Import
      </button>
      </div>

      {/* Tools + type filter row — search and sort always available; type
          pills appear when the library spans more than one media type. */}
      {(() => {
        const allTypes = new Set<MediaType>();
        for (const items of Object.values(grouped)) {
          for (const item of items) allTypes.add(item.type);
        }
        const multiType = allTypes.size > 1;
        const sortLabel = SORTS.find((o) => o.key === sort)!.label;
        const cycleSort = () => {
          const i = SORTS.findIndex((o) => o.key === sort);
          setSort(SORTS[(i + 1) % SORTS.length].key);
        };
        return (
          <div className="lib-tools-row" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 28 }}>
            {/* Search — library-only title filter */}
            {searchOpen ? (
              <div className="lib-search-open" style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 160px", minWidth: 0 }}>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setSearchOpen(false); } }}
                  placeholder="Search your library…"
                  style={{
                    flex: 1, minWidth: 0,
                    background: "rgba(46,196,182,0.04)", border: "1px solid rgba(46,196,182,0.3)",
                    borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "#fff", outline: "none",
                  }}
                />
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={() => { setQuery(""); setSearchOpen(false); }}
                  className="lib-tool-btn"
                  style={{ color: "rgba(46,196,182,0.85)" }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label="Search your library"
                onClick={() => setSearchOpen(true)}
                className="lib-tool-btn"
                style={{ color: "rgba(46,196,182,0.85)" }}
              >
                🔍{query ? <span style={{ marginLeft: 5, fontSize: 11 }}>“{query}”</span> : null}
              </button>
            )}

            {/* Type filter pills */}
            {multiType && (
              <>
                <button
                  onClick={() => setGlobalFilter("all")}
                  className="lib-type-pill"
                  style={{
                    background: globalFilter === "all" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                    color: globalFilter === "all" ? "#fff" : "rgba(255,255,255,0.5)",
                    border: globalFilter === "all" ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                  }}
                >
                  All
                </button>
                {TYPE_ORDER.filter((t) => allTypes.has(t)).map((t) => {
                  const typeInfo = TYPES[t];
                  const active = globalFilter === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setGlobalFilter(active ? "all" : t)}
                      title={typeInfo.label}
                      className="lib-type-pill"
                      style={{
                        background: active ? typeInfo.color + "25" : "rgba(255,255,255,0.05)",
                        color: active ? typeInfo.color : "rgba(255,255,255,0.5)",
                        border: active ? `1px solid ${typeInfo.color}55` : "1px solid transparent",
                      }}
                    >
                      <span style={{ fontSize: 11 }}>{typeInfo.icon}</span>
                      <span className="lib-type-pill-label">{typeInfo.label}</span>
                    </button>
                  );
                })}
              </>
            )}

            {/* Sort — cycles Recent → Rating → A–Z */}
            <button
              type="button"
              onClick={cycleSort}
              className="lib-tool-btn lib-sort-btn"
              style={{ marginLeft: "auto", color: "rgba(46,196,182,0.85)" }}
            >
              ↕ {sortLabel.toUpperCase()}
            </button>
          </div>
        );
      })()}

      {/* Following section */}
      <FollowingSection />

      {/* Status sections */}
      {STATUSES.map((s) => {
        // Status-pill filter: when a status is selected, show only that section
        if (statusFilter !== "all" && s.key !== statusFilter) return null;

        const items = grouped[s.key];
        if (items.length === 0) return null;

        const filtered = refine(items);

        // Hide the whole section when the type filter or search excludes everything
        if (filtered.length === 0) return null;

        return (
          <div key={s.key} style={{ marginBottom: 40 }}>
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: s.color, fontWeight: 700 }}>{s.icon}</span>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 800, color: "#fff" }}>
                {s.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{filtered.length}</span>
            </div>

            {/* Items grid */}
            <div className="library-grid" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
              {filtered.map((item) => {
                const entry = entries[item.id];
                return (
                  <div key={item.id} style={{ position: "relative" }}>
                    <Card item={item} />
                    {/* Progress overlay for In Progress items */}
                    {s.key === "in_progress" && entry && item.totalEp > 0 && (
                      <div style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 4,
                        borderRadius: "0 0 14px 14px",
                        background: "rgba(255,255,255,0.06)",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          background: "#3185FC",
                          width: `${Math.min(100, (entry.progress / item.totalEp) * 100)}%`,
                        }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* When search/type filter excludes every section, surface one honest
          empty state instead of a silently blank page. */}
      {STATUSES.every((s) => {
        if (statusFilter !== "all" && s.key !== statusFilter) return true;
        return refine(grouped[s.key]).length === 0;
      }) && (
        <div style={{
          padding: "40px 24px", textAlign: "center",
          fontSize: 13, color: "var(--text-faint)",
        }}>
          {q ? <>No library items match “{query}”.</> : <>Nothing here under this filter.</>}
        </div>
      )}
    </div>
  );
}
