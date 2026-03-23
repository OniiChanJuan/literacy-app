"use client";

import { useRef } from "react";

interface ScrollRowProps {
  label: string;
  sub?: string;
  icon?: string;
  iconBg?: string;
  children: React.ReactNode;
}

export default function ScrollRow({ label, sub, icon, iconBg, children }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    ref.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };

  return (
    <div style={{ marginBottom: 36 }}>
      {/* Row header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon && (
            <span style={{
              fontSize: 14,
              background: iconBg || "rgba(255,255,255,0.08)",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              flexShrink: 0,
            }}>
              {icon}
            </span>
          )}
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 800, color: "#fff" }}>
              {label}
            </div>
            {sub && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                {sub}
              </div>
            )}
          </div>
        </div>

        {/* Scroll buttons */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["left", "right"] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => scroll(dir)}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
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
          gap: 16,
          overflowX: "auto",
          paddingBottom: 8,
        }}
      >
        {children}
      </div>
    </div>
  );
}
