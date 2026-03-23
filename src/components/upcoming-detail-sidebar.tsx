"use client";

import type { Item } from "@/lib/data";
import { isUpcoming } from "@/lib/data";
import { useLibrary } from "@/lib/library-context";

export default function UpcomingDetailSidebar({ item }: { item: Item }) {
  const { entries, setStatus } = useLibrary();

  if (!isUpcoming(item)) return null;

  const isWanted = entries[item.id]?.status === "want_to";
  const release = new Date(item.releaseDate);
  const formatted = release.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  // Hype bar color
  const hypeColor = item.hypeScore >= 80 ? "#E84855" : item.hypeScore >= 50 ? "#F9A620" : "#3185FC";

  return (
    <>
      {/* Hype Score */}
      <div style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 24,
      }}>
        <div style={{
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: 16,
        }}>
          Hype Score
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 48, fontWeight: 800, color: hypeColor }}>
            {item.hypeScore}
          </span>
          <span style={{ fontSize: 16, color: "var(--text-faint)", fontWeight: 600 }}>/100</span>
        </div>

        {/* Hype bar */}
        <div style={{
          height: 8,
          borderRadius: 4,
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
          marginBottom: 16,
        }}>
          <div style={{
            height: "100%",
            borderRadius: 4,
            background: `linear-gradient(90deg, ${hypeColor}aa, ${hypeColor})`,
            width: `${item.hypeScore}%`,
            transition: "width 0.3s",
          }} />
        </div>

        <div style={{ fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5 }}>
          Based on community wishlists, social media mentions, and pre-release engagement.
        </div>
      </div>

      {/* Release Info */}
      <div style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 24,
      }}>
        <div style={{
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: 16,
        }}>
          Release Info
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Release date */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Release Date</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f1c40f" }}>{formatted}</span>
          </div>

          {/* Want count */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Want This</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#9B5DE5" }}>
              {item.wantCount.toLocaleString()} users
            </span>
          </div>

          {/* Platforms */}
          {item.platforms.length > 0 && (
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Expected On</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                {item.platforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Want To button */}
      <button
        onClick={() => setStatus(item.id, isWanted ? null : "want_to")}
        style={{
          width: "100%",
          padding: "14px 20px",
          borderRadius: 14,
          border: isWanted ? "1.5px solid #9B5DE5" : "1.5px solid var(--border)",
          background: isWanted ? "#9B5DE522" : "var(--surface-1)",
          color: isWanted ? "#9B5DE5" : "#fff",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          transition: "all 0.15s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {isWanted ? "✓ On Your Want List" : "＋ Add to Want List"}
      </button>
    </>
  );
}
