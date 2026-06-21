"use client";

/**
 * RatingDistribution — the community rating-distribution bars (5★→1★), gold
 * fill, shown inside the CrossShelf Score hero's "How this score works" panel.
 *
 * Honest gate: only renders bars at >=10 community ratings. Below that it shows
 * an explicit "Opens at 10 community ratings" empty state — never empty bars,
 * which would imply a distribution that isn't statistically there yet.
 *
 * Presentational only: the hero already fetched the aggregate, so dist + count
 * are passed in (no second fetch). This file previously held dead ScoreBadge /
 * AggregateScorePanel exports (imported nowhere); it's now the single home of
 * the distribution UI per the locked CrossShelf Score design.
 */

export const DISTRIBUTION_MIN_RATINGS = 10;

const GOLD = "#DAA520";

export function RatingDistribution({
  dist,
  count,
}: {
  dist: [number, number, number, number, number];
  count: number;
}) {
  return (
    <div style={{
      padding: "13px 15px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10,
      marginTop: 6,
    }}>
      <div style={{
        fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
        color: "rgba(232,230,225,0.34)", marginBottom: 9,
      }}>
        Community rating distribution
      </div>

      {count < DISTRIBUTION_MIN_RATINGS ? (
        <div style={{
          fontSize: 11, color: "rgba(232,230,225,0.34)", fontStyle: "italic",
          textAlign: "center", padding: "5px 0",
        }}>
          Opens at {DISTRIBUTION_MIN_RATINGS} community ratings
        </div>
      ) : (
        [5, 4, 3, 2, 1].map((star) => {
          const c = dist[star - 1] ?? 0;
          const pct = count > 0 ? (c / count) * 100 : 0;
          return (
            <div key={star} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 9, color: "rgba(232,230,225,0.6)", width: 30 }}>{star} ★</span>
              <div style={{
                flex: 1, height: 5, background: "rgba(255,255,255,0.07)",
                borderRadius: 3, position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, height: "100%",
                  width: `${pct}%`, background: GOLD, borderRadius: 3,
                }} />
              </div>
              <span style={{ fontSize: 10, color: "rgba(232,230,225,0.34)", width: 24, textAlign: "right" }}>{c}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
