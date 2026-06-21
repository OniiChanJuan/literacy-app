"use client";

import { useSession } from "@/lib/supabase/use-session";
import Link from "next/link";
import type { Item, RecTag as RecTagType } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import { useLibrary, isOngoing, type LibraryStatus } from "@/lib/library-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import Stars from "./stars";

/**
 * ItemSubBanner — desktop rating + track controls for the item detail page.
 *
 * Score DISPLAY now lives in <CrossShelfHero> (the CrossShelf Score, its
 * composition bar, and the "what goes into this" external pills). This banner
 * is purely the user's rating/recommend/track actions; the old external-score
 * pills + mislabeled "CrossShelf" community pill that lived here were removed
 * when the hero became the single, honest score surface.
 *
 * Desktop-only: on mobile the smart-hide MobileItemActionBar owns rate/track.
 */

const REC_OPTIONS: { key: RecTagType; label: string; icon: string; color: string }[] = [
  { key: "recommend", label: "Recommend", icon: "👍", color: "#2EC4B6" },
  { key: "mixed", label: "Mixed", icon: "🤷", color: "#F9A620" },
  { key: "skip", label: "Skip", icon: "👎", color: "#E84855" },
];

const ALL_STATUSES: { key: LibraryStatus; label: string; icon: string; color: string }[] = [
  { key: "completed", label: "Completed", icon: "✓", color: "#2EC4B6" },
  { key: "in_progress", label: "In Progress", icon: "▶", color: "#3185FC" },
  { key: "want_to", label: "Want to", icon: "＋", color: "#9B5DE5" },
  { key: "dropped", label: "Dropped", icon: "✕", color: "#E84855" },
];

interface SubBannerProps {
  item: Item;
  typeColor: string;
  heroColor?: string;
}

export default function ItemSubBanner({ item }: SubBannerProps) {
  // Desktop-only: on mobile (<=640px) MobileItemActionBar owns rate/track.
  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const { ratings, recTags, rate, setRecTag } = useRatings();
  const { entries, setStatus } = useLibrary();

  const currentRating = ratings[item.id] || 0;
  const currentRec = recTags[item.id] ?? null;
  const entry = entries[item.id];
  const currentStatus = entry?.status ?? null;
  const ongoing = isOngoing(item.type);

  if (isMobile) return null;

  return (
    <div className="item-sub-banner-layout" style={{
      padding: "10px 0",
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
    }}>
      {session?.user ? (
        <>
          {/* Stars */}
          <Stars rating={currentRating} onRate={(s) => rate(item.id, s)} size={16} />

          {/* Rec tags — show after rating */}
          {currentRating > 0 && (
            <div style={{ display: "flex", gap: 4 }}>
              {REC_OPTIONS.map((o) => {
                const active = currentRec === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecTag(item.id, active ? null : o.key);
                    }}
                    style={{
                      background: active ? o.color : "rgba(255,255,255,0.04)",
                      color: active ? "#fff" : "rgba(255,255,255,0.3)",
                      border: active ? "none" : "0.5px solid rgba(255,255,255,0.08)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      fontSize: 8,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <span style={{ fontSize: 9 }}>{o.icon}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Track buttons — all 4 always visible, scrollable on narrow screens */}
          <div style={{
            display: "flex",
            gap: 4,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch" as any,
            scrollbarWidth: "none" as any,
            msOverflowStyle: "none" as any,
          }}>
            {ALL_STATUSES.map((s) => {
              const active = currentStatus === s.key;
              const label = s.key === "completed" && ongoing ? "Caught Up" : s.label;
              return (
                <button
                  key={s.key}
                  onClick={() => setStatus(item.id, active ? null : s.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: active ? `0.5px solid rgba(${hexToRgb(s.color)}, 0.25)` : "0.5px solid rgba(255,255,255,0.08)",
                    background: active ? `rgba(${hexToRgb(s.color)}, 0.15)` : "rgba(255,255,255,0.04)",
                    color: active ? s.color : "rgba(255,255,255,0.3)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    minHeight: 32,
                  }}
                >
                  <span style={{ fontSize: 8 }}>{s.icon}</span>
                  {label}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <Link href="/login" style={{
          padding: "4px 12px",
          borderRadius: 6,
          background: "#E84855",
          color: "#fff",
          fontSize: 10,
          fontWeight: 700,
          textDecoration: "none",
        }}>
          Sign in to rate
        </Link>
      )}
    </div>
  );
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}
