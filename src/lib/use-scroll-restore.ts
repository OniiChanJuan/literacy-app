"use client";

import { useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";

const STORAGE_PREFIX = "scroll:";
const ROW_STORAGE_PREFIX = "row-scroll:";

/**
 * Saves and restores window scroll position for the current page.
 * Also saves/restores horizontal scroll positions for scroll rows.
 */
export function useScrollRestore() {
  const pathname = usePathname();
  const restored = useRef(false);

  // Save scroll position before navigating away
  useEffect(() => {
    const saveScroll = () => {
      try {
        sessionStorage.setItem(STORAGE_PREFIX + pathname, String(window.scrollY));

        // Save all horizontal scroll row positions
        const rows = document.querySelectorAll("[data-scroll-row]");
        rows.forEach((row) => {
          const id = row.getAttribute("data-scroll-row");
          if (id && row instanceof HTMLElement) {
            sessionStorage.setItem(ROW_STORAGE_PREFIX + pathname + ":" + id, String(row.scrollLeft));
          }
        });
      } catch {
        // sessionStorage might be full or unavailable
      }
    };

    // Save on any click that might navigate (links, cards)
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a, [role='link'], button[data-nav]");
      if (link) saveScroll();
    };

    // Save before unload too
    window.addEventListener("beforeunload", saveScroll);
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      window.removeEventListener("beforeunload", saveScroll);
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [pathname]);

  // Restore scroll position when returning to page
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const restoreScroll = () => {
      try {
        const saved = sessionStorage.getItem(STORAGE_PREFIX + pathname);
        if (saved) {
          const y = parseInt(saved);
          if (y > 0) {
            // Use requestAnimationFrame to ensure content is rendered
            requestAnimationFrame(() => {
              window.scrollTo(0, y);
              // Double-check after a moment in case lazy content shifted things
              setTimeout(() => window.scrollTo(0, y), 100);
            });
          }
        }

        // Restore horizontal scroll rows
        requestAnimationFrame(() => {
          setTimeout(() => {
            const rows = document.querySelectorAll("[data-scroll-row]");
            rows.forEach((row) => {
              const id = row.getAttribute("data-scroll-row");
              if (id && row instanceof HTMLElement) {
                const savedLeft = sessionStorage.getItem(ROW_STORAGE_PREFIX + pathname + ":" + id);
                if (savedLeft) {
                  row.scrollLeft = parseInt(savedLeft);
                }
              }
            });
          }, 200); // Delay to let rows render
        });
      } catch {
        // Ignore
      }
    };

    restoreScroll();

    // Reset restored flag when pathname changes
    return () => { restored.current = false; };
  }, [pathname]);
}

/**
 * Helper to tag a scroll row element for position saving.
 * Use: <div data-scroll-row="critically-acclaimed" ...>
 */
export function scrollRowId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
