"use client";

import { useRef, memo } from "react";

interface ScrollRowProps {
  label: string;
  sub?: string;
  icon?: string;
  iconBg?: string;
  seeAllHref?: string;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  children: React.ReactNode;
}

const ScrollRow = memo(function ScrollRow({ label, sub, icon, iconBg, seeAllHref, loadingMore, children }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Row header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && (
            <span style={{
              fontSize: 12,
              background: iconBg || "rgba(255,255,255,0.06)",
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              flexShrink: 0,
            }}>
              {icon}
            </span>
          )}
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 14, fontWeight: 500, color: "#fff" }}>
              {label}
            </div>
            {sub && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>
                {sub}
              </div>
            )}
          </div>
        </div>

        {seeAllHref && (
          <a href={seeAllHref} style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textDecoration: "none" }}>
            See all →
          </a>
        )}
      </div>

      {/* Items — flex wrap to fill width */}
      <div
        ref={ref}
        data-scroll-row={label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          paddingBottom: 4,
        }}
      >
        {children}
        {loadingMore && (
          <div style={{
            flex: "1 0 130px", maxWidth: 180, minWidth: 130, height: 145,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
            border: "0.5px solid rgba(255,255,255,0.04)",
          }}>
            <div style={{ fontSize: 10, color: "var(--text-faint)" }}>Loading...</div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ScrollRow;
