"use client";

import { useRatings } from "@/lib/ratings-context";
import Stars from "./stars";
import RecTag from "./rec-tag";

export default function RatingPanel({ itemId }: { itemId: number }) {
  const { ratings, recTags, rate, setRecTag } = useRatings();
  const currentRating = ratings[itemId] || 0;
  const currentRec = recTags[itemId] ?? null;

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
