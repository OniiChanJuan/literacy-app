"use client";

import { useRouter } from "next/navigation";
import { TYPES, type UpcomingItem } from "@/lib/data";
import { useLibrary } from "@/lib/library-context";

export default function UpcomingCard({ item }: { item: UpcomingItem }) {
  const router = useRouter();
  const { entries, setStatus } = useLibrary();
  const t = TYPES[item.type];
  const isWanted = entries[item.id]?.status === "want_to";

  const release = new Date(item.releaseDate);
  const month = release.toLocaleString("en-US", { month: "short" });
  const day = release.getDate();
  const year = release.getFullYear();

  return (
    <div
      onClick={() => router.push(`/item/${item.id}`)}
      style={{
        minWidth: 190,
        maxWidth: 190,
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.25)";
      }}
    >
      {/* Cover */}
      <div style={{ background: item.cover, height: 250, position: "relative" }}>
        {/* Type badge — top left */}
        <div style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          color: t.color,
          fontSize: 10,
          fontWeight: 700,
          padding: "3px 9px",
          borderRadius: 8,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}>
          <span style={{ fontSize: 12 }}>{t.icon}</span> {t.label.replace(/s$/, "")}
        </div>

        {/* Release date badge — top right */}
        <div style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
          color: "#f1c40f",
          fontSize: 10,
          fontWeight: 700,
          padding: "3px 8px",
          borderRadius: 8,
        }}>
          {month} {day}, {year}
        </div>

        {/* "UPCOMING" ribbon at bottom of cover */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top, rgba(232,72,85,0.9), transparent)",
          padding: "16px 10px 6px",
          textAlign: "center",
          fontSize: 9,
          fontWeight: 800,
          color: "#fff",
          textTransform: "uppercase",
          letterSpacing: "2px",
        }}>
          Coming Soon
        </div>
      </div>

      {/* Info */}
      <div style={{ background: "var(--bg-card)", padding: "12px 12px 10px" }}>
        <div style={{
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1.25,
          marginBottom: 6,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#fff",
        }}>
          {item.title}
        </div>

        {/* Want count + Want To button */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {item.wantCount.toLocaleString()} want this
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setStatus(item.id, isWanted ? null : "want_to");
            }}
            style={{
              background: isWanted ? "#9B5DE522" : "rgba(255,255,255,0.06)",
              border: isWanted ? "1px solid #9B5DE555" : "1px solid rgba(255,255,255,0.1)",
              color: isWanted ? "#9B5DE5" : "var(--text-muted)",
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 8,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {isWanted ? "✓ Wanted" : "＋ Want"}
          </button>
        </div>
      </div>
    </div>
  );
}
