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
      <div style={{ background: "var(--bg-card)", padding: "6px 6px 5px" }}>
        <div className="skeleton-shimmer" style={{ height: 11, width: "80%", borderRadius: 3, marginBottom: 4, background: "rgba(255,255,255,0.06)" }} />
        <div className="skeleton-shimmer" style={{ height: 9, width: "50%", borderRadius: 3, background: "rgba(255,255,255,0.04)" }} />
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
