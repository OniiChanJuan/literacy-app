"use client";

import { useState } from "react";
import { useSession } from "@/lib/supabase/use-session";
import Link from "next/link";
import { useRatings } from "@/lib/ratings-context";
import Stars from "./stars";
import RecTag from "./rec-tag";

export default function RatingPanel({ itemId }: { itemId: number }) {
  const { data: session } = useSession();
  const { ratings, recTags, rate, setRecTag } = useRatings();
  const currentRating = ratings[itemId] || 0;
  const currentRec = recTags[itemId] ?? null;
  const [reviewText, setReviewText] = useState("");
  const [reviewSaved, setReviewSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!session?.user) {
    return (
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: 24,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>⭐</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>
          Sign in to rate and review
        </div>
        <Link href="/login" style={{
          display: "inline-block",
          padding: "8px 20px",
          borderRadius: 10,
          background: "#E84855",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
        }}>
          Sign In
        </Link>
      </div>
    );
  }

  const handleReviewSubmit = async () => {
    if (!reviewText.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, text: reviewText.trim() }),
      });
      setReviewSaved(true);
    } catch (e) {
      console.error("Failed to save review:", e);
    }
    setSubmitting(false);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16,
      padding: 24,
      position: "sticky",
      top: 100,
    }}>
      {/* Your rating */}
      <div style={{
        fontSize: 11,
        color: "rgba(255,255,255,0.35)",
        textTransform: "uppercase",
        letterSpacing: 2,
        fontWeight: 600,
        marginBottom: 16,
      }}>
        Your Rating
      </div>

      {/* Stars */}
      <div style={{ marginBottom: currentRating > 0 ? 20 : 0, display: "flex", justifyContent: "center" }}>
        <Stars rating={currentRating} onRate={(s) => rate(itemId, s)} size={32} />
      </div>

      {/* Rec tag — only shows after rating */}
      {currentRating > 0 && (
        <div>
          <div style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            letterSpacing: 2,
            fontWeight: 600,
            marginBottom: 12,
          }}>
            Would you recommend?
          </div>
          <RecTag value={currentRec} onChange={(tag) => setRecTag(itemId, tag)} />

          {/* Summary */}
          <div style={{
            marginTop: 20,
            padding: "14px 16px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: currentRec ? 8 : 0 }}>
              <span style={{ color: "#f1c40f", fontSize: 16 }}>
                {"★".repeat(currentRating)}{"☆".repeat(5 - currentRating)}
              </span>
            </div>
            {currentRec && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {currentRec === "recommend" && "👍 You recommend this"}
                {currentRec === "mixed" && "🤷 You have mixed feelings"}
                {currentRec === "skip" && "👎 You'd skip this"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review textarea — shows after rating */}
      {currentRating > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            letterSpacing: 2,
            fontWeight: 600,
            marginBottom: 10,
          }}>
            Write a Review
          </div>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            disabled={reviewSaved}
            placeholder="Share your thoughts..."
            rows={4}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "#fff",
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              opacity: reviewSaved ? 0.6 : 1,
            }}
          />
          {reviewSaved ? (
            <div style={{ fontSize: 12, color: "#2EC4B6", marginTop: 8 }}>
              Review saved!
            </div>
          ) : (
            <button
              onClick={handleReviewSubmit}
              disabled={!reviewText.trim() || submitting}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: reviewText.trim() ? "#E84855" : "rgba(255,255,255,0.06)",
                color: reviewText.trim() ? "#fff" : "rgba(255,255,255,0.3)",
                fontSize: 13,
                fontWeight: 700,
                cursor: reviewText.trim() && !submitting ? "pointer" : "not-allowed",
              }}
            >
              {submitting ? "Saving..." : "Submit Review"}
            </button>
          )}
        </div>
      )}

      {!currentRating && (
        <div style={{
          textAlign: "center",
          fontSize: 12,
          color: "rgba(255,255,255,0.2)",
          marginTop: 12,
        }}>
          Tap a star to rate
        </div>
      )}
    </div>
  );
}
