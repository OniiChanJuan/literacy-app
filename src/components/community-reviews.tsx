"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ReviewData {
  id: number;
  userId: string;
  userName: string;
  userAvatar: string;
  score: number;
  recommendTag: string | null;
  text: string;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function CommunityReviews({ itemId }: { itemId: number }) {
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch(`/api/reviews?itemId=${itemId}`)
      .then((r) => r.json())
      .then((data) => {
        setReviews(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [itemId]);

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
        Loading reviews...
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div>
        <h2 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "1px",
          marginBottom: 16,
        }}>
          Community Reviews
        </h2>
        <div style={{
          padding: "32px 20px",
          textAlign: "center",
          color: "var(--text-faint)",
          fontSize: 13,
          background: "var(--surface-1)",
          borderRadius: 14,
          border: "1px solid var(--border)",
        }}>
          No reviews yet. Be the first to share your thoughts!
        </div>
      </div>
    );
  }

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
          {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visible.map((review) => {
          const recEmoji = review.recommendTag === "recommend" ? "👍"
            : review.recommendTag === "mixed" ? "🤷"
            : review.recommendTag === "skip" ? "👎" : "";

          return (
            <div
              key={review.id}
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
                  background: "linear-gradient(135deg, #E84855, #C45BAA)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}>
                  {review.userName[0]?.toUpperCase() || "?"}
                </div>

                {/* Name + date */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/user/${review.userId}`} style={{ fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none" }}>
                    {review.userName}
                  </Link>
                  <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 1 }}>
                    {timeAgo(review.createdAt)}
                  </div>
                </div>

                {/* Stars + rec tag */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {review.score > 0 && (
                    <span style={{ color: "#f1c40f", fontSize: 12 }}>
                      {"★".repeat(review.score)}{"☆".repeat(5 - review.score)}
                    </span>
                  )}
                  {recEmoji && <span style={{ fontSize: 12 }}>{recEmoji}</span>}
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
