import { memo } from "react";

const SkeletonCard = memo(function SkeletonCard() {
  return (
    <div style={{
      minWidth: 120,
      maxWidth: 120,
      borderRadius: 8,
      overflow: "hidden",
      flexShrink: 0,
      border: "0.5px solid rgba(255,255,255,0.06)",
    }}>
      <div className="skeleton-shimmer" style={{ height: 95, background: "rgba(255,255,255,0.04)" }} />
      <div style={{ background: "var(--bg-card)", padding: "5px 6px 4px" }}>
        <div className="skeleton-shimmer" style={{ height: 10, width: "80%", borderRadius: 3, marginBottom: 3, background: "rgba(255,255,255,0.06)" }} />
        <div className="skeleton-shimmer" style={{ height: 8, width: "55%", borderRadius: 3, marginBottom: 2, background: "rgba(255,255,255,0.04)" }} />
        <div className="skeleton-shimmer" style={{ height: 7, width: "40%", borderRadius: 3, background: "rgba(255,255,255,0.03)" }} />
      </div>
    </div>
  );
});

export default SkeletonCard;

export const SkeletonRow = memo(function SkeletonRow({ count = 8 }: { count?: number }) {
  return (
    <div style={{ display: "flex", gap: 10, overflow: "hidden" }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
});
