"use client";

import { useState, useEffect } from "react";
import { scoreColor } from "@/lib/score-utils";

interface AggregateData {
  avg: string;
  count: number;
  dist: [number, number, number, number, number];
  recPct: number;
}

// ── Compact: for cards ──────────────────────────────────────────────────
export function ScoreBadge({ itemId }: { itemId: number }) {
  const [agg, setAgg] = useState<AggregateData | null>(null);

  useEffect(() => {
    fetch(`/api/items/${itemId}/aggregate`)
      .then((r) => r.json())
      .then(setAgg)
      .catch(() => {});
  }, [itemId]);

  if (!agg || agg.count === 0) {
    return (
      <span style={{ fontSize: 10, color: "var(--text-faint)" }}>No ratings</span>
    );
  }

  const avg = parseFloat(agg.avg);
  const color = scoreColor(avg);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{agg.avg}</span>
      <span style={{ fontSize: 10, color: "var(--text-faint)" }}>({agg.count})</span>
    </div>
  );
}

// ── Full: for detail page ───────────────────────────────────────────────
export function AggregateScorePanel({ itemId }: { itemId: number }) {
  const [agg, setAgg] = useState<AggregateData | null>(null);

  useEffect(() => {
    fetch(`/api/items/${itemId}/aggregate`)
      .then((r) => r.json())
      .then(setAgg)
      .catch(() => {});
  }, [itemId]);

  if (!agg) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (agg.count === 0) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
        No ratings yet. Be the first!
      </div>
    );
  }

  const avg = parseFloat(agg.avg);
  const color = scoreColor(avg);
  const maxDist = Math.max(...agg.dist, 1);
  const recEmoji = agg.recPct >= 70 ? "👍" : agg.recPct >= 40 ? "🤷" : "👎";
  const recColor = agg.recPct >= 70 ? "var(--score-good)" : agg.recPct >= 40 ? "var(--score-mid)" : "var(--score-poor)";

  return (
    <div>
      {/* Score + Recommend side by side */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {/* Literacy score */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 18px",
          background: "var(--surface-1)",
          borderRadius: 14,
          border: "1px solid var(--border)",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{agg.avg}</div>
            <div style={{ fontSize: 9, color: "var(--text-faint)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
              Literacy
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: "var(--surface-3)" }} />
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {agg.count} {agg.count === 1 ? "rating" : "ratings"}
          </div>
        </div>

        {/* Recommend percentage */}
        <div style={{
          minWidth: 90,
          padding: "16px 0",
          background: `color-mix(in srgb, ${recColor} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${recColor} 20%, transparent)`,
          borderRadius: 14,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 16, marginBottom: 4 }}>{recEmoji}</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: recColor, lineHeight: 1 }}>{agg.recPct}%</div>
          <div style={{ fontSize: 8, color: "var(--text-faint)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Recommend
          </div>
        </div>
      </div>

      {/* Rating distribution bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {[5, 4, 3, 2, 1].map((star) => {
          const count = agg.dist[star - 1];
          const pct = (count / maxDist) * 100;
          return (
            <div key={star} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", width: 14, textAlign: "right" }}>{star}</span>
              <span style={{ fontSize: 10, color: "#f1c40f" }}>★</span>
              <div style={{
                flex: 1,
                height: 6,
                background: "var(--surface-2)",
                borderRadius: 3,
                overflow: "hidden",
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: color,
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <span style={{ fontSize: 10, color: "var(--text-faint)", width: 16, textAlign: "right" }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
