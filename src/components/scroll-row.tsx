"use client";

import { useRef, useCallback, memo } from "react";

interface ScrollRowProps {
  label: string;
  sub?: string;
  icon?: string;
  iconBg?: string;
  seeAllHref?: string;
  children: React.ReactNode;
}

const ScrollRow = memo(function ScrollRow({ label, sub, icon, iconBg, seeAllHref, children }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = useCallback((dir: "left" | "right") => {
    ref.current?.scrollBy({ left: dir === "left" ? -260 : 260, behavior: "smooth" });
  }, []);

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

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {seeAllHref && (
            <a href={seeAllHref} style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textDecoration: "none" }}>
              See all →
            </a>
          )}
          {(["left", "right"] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => scroll(dir)}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: "0.5px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.4)",
                cursor: "pointer",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            >
              {dir === "left" ? "←" : "→"}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable items */}
      <div
        ref={ref}
        className="scrollbar-hide"
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {children}
      </div>
    </div>
  );
});

export default ScrollRow;
