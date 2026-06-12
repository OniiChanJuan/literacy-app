"use client";

/**
 * BottomNav — fixed mobile tab bar (For You / Explore / Library / People).
 *
 * Visible only at the mobile breakpoint (<=640px, where nav.tsx hides its
 * top tab row), fixed to the bottom with safe-area padding so the iOS home
 * indicator never overlaps it. Tapping the active tab fires the same
 * refresh events as the desktop tabs (see lib/nav-tabs.ts).
 *
 * Body clearance for the bar lives in globals.css (padding-bottom on body
 * at <=640px) so page content never hides behind it.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_TABS, handleActiveTabTap } from "@/lib/nav-tabs";

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      <style>{`
        .bottom-nav { display: none; }
        @media (max-width: 640px) {
          .bottom-nav { display: flex; }
        }
      `}</style>
      <nav
        className="bottom-nav"
        aria-label="Primary"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 150, /* above content + sticky header (50), below the nav slide-out panel (199/200) */
          height: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
          paddingBottom: "var(--safe-bottom)",
          background: "rgba(11,11,16,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid var(--border)",
          alignItems: "stretch",
        }}
      >
        {NAV_TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.id}
              href={t.href}
              onClick={(e) => handleActiveTabTap(e, t.href, active)}
              aria-current={active ? "page" : undefined}
              style={{
                flex: 1,
                minHeight: "var(--touch-target)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                textDecoration: "none",
                color: active ? "#fff" : "var(--text-faint)",
                transition: "color 0.15s",
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1, color: active ? "var(--accent)" : "inherit" }}>
                {t.icon}
              </span>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: 0.2 }}>
                {t.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
