"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ITEMS, TYPES, TYPE_ORDER, type MediaType, type Item } from "@/lib/data";
import { useLibrary, isOngoing, progressUnit, type LibraryStatus } from "@/lib/library-context";
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

// Build a lookup from static ITEMS for fallback
const STATIC_ITEMS_MAP = new Map<number, Item>();
for (const item of ITEMS) {
  STATIC_ITEMS_MAP.set(item.id, item);
}

export default function LibraryPage() {
  const { entries, items: dbItems } = useLibrary();
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState<MediaType | "all">("all");

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
    <div className="content-width">
      {/* Header row: status pills + Import shortcut */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {STATUSES.map((s) => {
          const count = grouped[s.key].length;
          return (
            <div
              key={s.key}
              style={{
                background: count > 0 ? s.color + "15" : "rgba(255,255,255,0.04)",
                border: `1px solid ${count > 0 ? s.color + "40" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 10,
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: 7,
                opacity: count > 0 ? 1 : 0.4,
              }}
            >
              <span style={{ fontSize: 13, color: s.color }}>{s.icon}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{count}</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.label}</span>
            </div>
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

      {/* Global media type filter — applies to ALL sections */}
      {(() => {
        const allTypes = new Set<MediaType>();
        for (const items of Object.values(grouped)) {
          for (const item of items) allTypes.add(item.type);
        }
        if (allTypes.size <= 1) return null;
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 28 }}>
            <button
              onClick={() => setGlobalFilter("all")}
              style={{
                background: globalFilter === "all" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                color: globalFilter === "all" ? "#fff" : "rgba(255,255,255,0.5)",
                border: globalFilter === "all" ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                borderRadius: 12,
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
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
                  style={{
                    background: active ? typeInfo.color + "25" : "rgba(255,255,255,0.05)",
                    color: active ? typeInfo.color : "rgba(255,255,255,0.5)",
                    border: active ? `1px solid ${typeInfo.color}55` : "1px solid transparent",
                    borderRadius: 12,
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 11 }}>{typeInfo.icon}</span>
                  {typeInfo.label}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Following section */}
      <FollowingSection />

      {/* Status sections */}
      {STATUSES.map((s) => {
        const items = grouped[s.key];
        if (items.length === 0) return null;

        const filtered = globalFilter === "all" ? items : items.filter((i) => i.type === globalFilter);

        // Hide entire section if global filter results in 0 items
        if (filtered.length === 0 && globalFilter !== "all") return null;

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

            {filtered.length === 0 && (
              <div style={{
                padding: "24px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 14,
                fontSize: 12,
                color: "var(--text-faint)",
                textAlign: "center",
              }}>
                No {globalFilter !== "all" ? TYPES[globalFilter].label.toLowerCase() : "items"} in this section
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
