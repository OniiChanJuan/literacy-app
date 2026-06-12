"use client";

/**
 * useScrollDirection — smart-hide primitive for fixed mobile bars.
 *
 * Tracks window scroll and reports the current direction plus whether the
 * page is at (or near) the top. Intended consumers: the item-detail action
 * bar and (optionally) the bottom tab nav — hide on scroll-down to give the
 * content room, reveal on scroll-up or at top.
 *
 *   const { direction, atTop } = useScrollDirection();
 *   const hidden = direction === "down" && !atTop;
 *
 * Implementation notes:
 * - rAF-throttled passive listener; at most one state update per frame.
 * - `threshold` (px) of accumulated movement must pass before the direction
 *   flips, so tiny jitters (iOS momentum bounce, Android URL-bar resize)
 *   don't strobe the bar.
 * - Resets to "up" at the top so bars are always visible on a fresh page.
 */

import { useEffect, useRef, useState } from "react";

export type ScrollDirection = "up" | "down";

export function useScrollDirection(threshold = 12): { direction: ScrollDirection; atTop: boolean } {
  const [direction, setDirection] = useState<ScrollDirection>("up");
  const [atTop, setAtTop] = useState(true);
  const lastY = useRef(0);
  const acc = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastY.current = window.scrollY;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        const y = window.scrollY;
        const delta = y - lastY.current;
        lastY.current = y;

        const nowAtTop = y <= 4;
        setAtTop(nowAtTop);
        if (nowAtTop) { acc.current = 0; setDirection("up"); return; }

        // Accumulate same-direction movement; reset when direction reverses.
        acc.current = Math.sign(delta) === Math.sign(acc.current)
          ? acc.current + delta
          : delta;

        if (acc.current > threshold) setDirection("down");
        else if (acc.current < -threshold) setDirection("up");
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return { direction, atTop };
}
