"use client";

import { useRouter } from "next/navigation";
import { Item, TYPES } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import Stars from "./stars";

export default function Card({ item }: { item: Item }) {
  const router = useRouter();
  const { ratings, rate } = useRatings();
  const t = TYPES[item.type];
  const userRating = ratings[item.id] || 0;

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

        {/* Gold rating badge — top right (only when rated) */}
        {userRating > 0 && (
          <div style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(8px)",
            color: "#f1c40f",
            fontSize: 12,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}>
            ★ {userRating}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ background: "#141419", padding: "12px 12px 10px" }}>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1.25,
          marginBottom: 4,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#fff",
        }}>
          {item.title}
        </div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            {item.year}
          </span>
        </div>
        <Stars
          rating={userRating}
          onRate={(s) => rate(item.id, s)}
          size={14}
        />
      </div>
    </div>
  );
}
