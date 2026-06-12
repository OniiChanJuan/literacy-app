"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/supabase/use-session";
import { useLibrary } from "@/lib/library-context";
import UserMenu from "./user-menu";
import GlobalSearch from "./global-search";
import { NAV_TABS as tabs, dispatchForYouRefresh, dispatchExploreRefresh } from "@/lib/nav-tabs";

export default function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { entries } = useLibrary();
  const trackedCount = Object.keys(entries).length;

  return (
    <header style={{
      background: "linear-gradient(180deg, rgba(232,72,85,0.06) 0%, transparent 100%)",
      backgroundColor: "#0b0b10",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <style>{`
        .nav-logo-text { font-size: 30px; }
        .nav-tabs { display: flex; }
        /* Mobile header (mockup: design/mobile/crossshelf-mobile-for-you-signed-in.html):
           compact 18px Playfair logo, 8px tagline, teal Playfair tracked count.
           Primary tabs live in the fixed BottomNav below 640px. */
        @media (max-width: 640px) {
          .nav-logo-text { font-size: 18px !important; font-weight: 500 !important; }
          .nav-tagline { font-size: 8px !important; }
          .nav-tabs { display: none !important; }
          .nav-tracked { font-size: 7px !important; letter-spacing: 1px; text-transform: uppercase; color: rgba(232,230,225,0.55) !important; }
          .nav-tracked-num { color: #2EC4B6 !important; font-family: var(--font-serif) !important; font-size: 14px !important; font-weight: 500 !important; }
        }
      `}</style>

      {/* Top row: logo + right side */}
      <div className="content-width" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, marginBottom: 14 }}>

        {/* Logo */}
        <Link
          href="/"
          onClick={(e) => { if (pathname === "/") { e.preventDefault(); dispatchForYouRefresh(); } }}
          style={{ textDecoration: "none", cursor: "pointer" }}
        >
          <h1 className="nav-logo-text" style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 900,
            letterSpacing: "-0.5px",
            lineHeight: 1,
            background: "linear-gradient(135deg, #fff, rgba(255,255,255,0.7))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            CrossShelf
          </h1>
          <div className="nav-tagline" style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
            marginTop: 2,
            letterSpacing: "2px",
            textTransform: "uppercase",
          }}>
            Fluent in every medium
          </div>
        </Link>

        {/* Right side: search + auth + hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Suspense fallback={null}><GlobalSearch /></Suspense>
          {session?.user ? (
            <>
              <div className="nav-tracked" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right", lineHeight: 1.4 }}>
                <span className="nav-tracked-num" style={{ color: "#E84855", fontWeight: 700, fontSize: 17 }}>{trackedCount}</span>
                <br />tracked
              </div>
              <UserMenu />
            </>
          ) : (
            <Link
              href="/login"
              style={{
                padding: "8px 18px",
                borderRadius: 10,
                background: "#E84855",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      {/* Tab bar — hidden on mobile via className */}
      <div className="nav-tabs content-width" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingTop: 0, paddingBottom: 0 }}>
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.id}
              href={t.href}
              className="nav-tab-link"
              onClick={(e) => {
                if (active && t.href === "/") { e.preventDefault(); dispatchForYouRefresh(); }
                if (active && t.href === "/explore") { e.preventDefault(); dispatchExploreRefresh(); }
              }}
              style={{
                background: "none",
                border: "none",
                color: active ? "#fff" : "rgba(255,255,255,0.35)",
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                borderBottom: active ? "2px solid #E84855" : "2px solid transparent",
                display: "flex",
                alignItems: "center",
                gap: 5,
                textDecoration: "none",
                transition: "color 0.15s",
                marginBottom: -1,
              }}
            >
              <span style={{ fontSize: 13 }}>{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </div>

    </header>
  );
}
