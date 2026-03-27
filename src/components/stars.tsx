"use client";

import { useState } from "react";

interface StarsProps {
  rating: number;
  onRate: (score: number) => void;
  size?: number;
}

export default function Stars({ rating, onRate, size = 18 }: StarsProps) {
  const [hover, setHover] = useState(0);

  return (
    <div style={{ display: "flex", gap: 1 }} onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          role="button"
          aria-label={`Rate ${s} star${s > 1 ? "s" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onRate(s === rating ? 0 : s);
          }}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          style={{
            cursor: "pointer",
            fontSize: size,
            lineHeight: 1,
            userSelect: "none",
            transition: "transform 0.15s",
            transform: hover === s ? "scale(1.3)" : "scale(1)",
            filter: (hover ? s <= hover : s <= rating)
              ? "none"
              : "grayscale(1) opacity(0.3)",
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}
