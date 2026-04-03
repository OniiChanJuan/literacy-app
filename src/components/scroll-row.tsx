"use client";

import { useRef, useCallback, useEffect, useState, memo } from "react";
import Link from "next/link";

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

const ScrollRow = memo(function ScrollRow({ label, sub, icon, iconBg, seeAllHref, onLoadMore, loadingMore, children }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true); // optimistic until measured

  const scroll = useCallback((dir: "left" | "right") => {
    ref.current?.scrollBy({ left: dir === "left" ? -486 : 486, behavior: "smooth" });
  }, []);

  // Check scroll position and trigger load-more near end
  const checkScrollState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollWidth - scrollLeft - clientWidth > 10);
    if (onLoadMore && scrollWidth - scrollLeft - clientWidth < 300) {
      onLoadMore();
    }
  }, [onLoadMore]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Measure immediately, then re-measure shortly after (images/fonts may expand)
    checkScrollState();
    const timer = setTimeout(checkScrollState, 250);

    el.addEventListener("scroll", checkScrollState, { passive: true });

    // Re-check when direct children change (e.g. skeleton placeholders → real cards)
    const mo = new MutationObserver(() => setTimeout(checkScrollState, 50));
    mo.observe(el, { childList: true });

    return () => {
      el.removeEventListener("scroll", checkScrollState);
      clearTimeout(timer);
      mo.disconnect();
    };
  }, [checkScrollState]);

  // Left arrow: only show once user has scrolled past the start
  const showLeft = canScrollLeft;
  // Right arrow: show when more scroll room exists OR more items may load
  const showRight = canScrollRight || !!onLoadMore;

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
            <Link href={seeAllHref} style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textDecoration: "none" }}>
              See all →
            </Link>
          )}
          {(["left", "right"] as const).map((dir) => {
            const show = dir === "left" ? showLeft : showRight;
            return (
              <button
                key={dir}
                aria-label={dir === "left" ? "Scroll left" : "Scroll right"}
                onClick={() => scroll(dir)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.4)",
                  cursor: show ? "pointer" : "default",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s, opacity 0.15s",
                  visibility: show ? "visible" : "hidden",
                  pointerEvents: show ? "auto" : "none",
                }}
                onMouseEnter={(e) => { if (show) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={(e) => { if (show) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
              >
                {dir === "left" ? "←" : "→"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable items — single horizontal row */}
      <div
        ref={ref}
        className="scrollbar-hide"
        data-scroll-row={label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
        style={{
          display: "flex",
          flexWrap: "nowrap",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 4,
          scrollSnapType: "x mandatory",
        }}
      >
        {children}
        {loadingMore && (
          <div style={{
            flex: "0 0 150px", width: 150, height: 280,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
            border: "0.5px solid rgba(255,255,255,0.04)",
            scrollSnapAlign: "start",
          }}>
            <div style={{ fontSize: 10, color: "var(--text-faint)" }}>Loading...</div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ScrollRow;
