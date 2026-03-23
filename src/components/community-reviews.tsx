"use client";

import { useMemo, useState } from "react";
import { generateReviews } from "@/lib/reviews";

export default function CommunityReviews({ itemId }: { itemId: number }) {
  const reviews = useMemo(() => generateReviews(itemId), [itemId]);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? reviews : reviews.slice(0, 4);

  return (
    <div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 16,
      }}>
        <h2 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}>
          Community Reviews
        </h2>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
          {reviews.length} reviews
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visible.map((review, i) => {
          const recEmoji = review.rec === "recommend" ? "👍"
            : review.rec === "mixed" ? "🤷" : "👎";

          return (
            <div
              key={i}
              style={{
                padding: "16px 18px",
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 14,
              }}
            >
              {/* Header: avatar, username, stars, rec, date */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
              }}>
                {/* Avatar */}
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: review.avatarColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}>
                  {review.username[0].toUpperCase()}
                </div>

                {/* Name + date */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                    {review.username}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 1 }}>
                    {review.daysAgo === 1 ? "yesterday" : `${review.daysAgo} days ago`}
                  </div>
                </div>

                {/* Stars + rec tag */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ color: "#f1c40f", fontSize: 12 }}>
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </span>
                  <span style={{ fontSize: 12 }}>{recEmoji}</span>
                </div>
              </div>

              {/* Review text */}
              <p style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.65,
                margin: 0,
              }}>
                {review.text}
              </p>
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {reviews.length > 4 && (
        <button
          onClick={() => setShowAll(!showAll)}
          style={{
            display: "block",
            margin: "16px auto 0",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--text-muted)",
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 20px",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-4)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
        >
          {showAll ? "Show less" : `Show all ${reviews.length} reviews`}
        </button>
      )}
    </div>
  );
}
