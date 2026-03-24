import { memo } from "react";

/** Skeleton placeholder card with shimmer animation */
const SkeletonCard = memo(function SkeletonCard() {
  return (
    <div style={{
      minWidth: 190,
      maxWidth: 190,
      borderRadius: 14,
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* Cover shimmer */}
      <div
        className="skeleton-shimmer"
        style={{
          height: 250,
          background: "rgba(255,255,255,0.04)",
        }}
      />
      {/* Info shimmer */}
      <div style={{ background: "var(--bg-card)", padding: "12px 12px 10px" }}>
        <div
          className="skeleton-shimmer"
          style={{
            height: 14,
            width: "80%",
            borderRadius: 4,
            marginBottom: 8,
            background: "rgba(255,255,255,0.06)",
          }}
        />
        <div
          className="skeleton-shimmer"
          style={{
            height: 10,
            width: "40%",
            borderRadius: 4,
            marginBottom: 8,
            background: "rgba(255,255,255,0.04)",
          }}
        />
        <div
          className="skeleton-shimmer"
          style={{
            height: 14,
            width: "60%",
            borderRadius: 4,
            background: "rgba(255,255,255,0.04)",
          }}
        />
      </div>
    </div>
  );
});

export default SkeletonCard;

/** Render N skeleton cards in a row */
export const SkeletonRow = memo(function SkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: "flex", gap: 16, overflow: "hidden" }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
});
