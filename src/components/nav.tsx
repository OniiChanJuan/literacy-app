"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLibrary } from "@/lib/library-context";
import UserMenu from "./user-menu";
import GlobalSearch from "./global-search";

function dispatchForYouRefresh() {
  window.dispatchEvent(new CustomEvent("literacy:refresh-foryou"));
}

function dispatchExploreRefresh() {
  window.dispatchEvent(new CustomEvent("literacy:refresh-explore"));
}

const tabs = [
  { id: "foryou",  label: "For You",  icon: "✦", href: "/" },
  { id: "explore", label: "Explore",  icon: "◎", href: "/explore" },
  { id: "library", label: "Library",  icon: "▤", href: "/library" },
  { id: "people",  label: "People",   icon: "◉", href: "/people" },
];

export default function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { entries } = useLibrary();
  const trackedCount = Object.keys(entries).length;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const initial = session?.user?.name?.[0]?.toUpperCase() || "?";

  return (
    <header style={{
      background: "linear-gradient(180deg, rgba(232,72,85,0.06) 0%, transparent 100%)",
      backgroundColor: "#0b0b10",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <style>{`
        .nav-logo-text { font-size: 32px; }
        .nav-tabs { display: flex; }
        .nav-hamburger { display: none; }
        .nav-tab-link { min-height: auto; }
        @media (max-width: 640px) {
          .nav-logo-text { font-size: 24px !important; }
          .nav-tabs { display: none !important; }
          .nav-hamburger { display: flex !important; }
          .nav-tab-link { min-height: 44px; }
        }
      `}</style>

      {/* Top row: logo + right side */}
      <div className="content-width" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 28, marginBottom: 26 }}>

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
            Literacy
          </h1>
          <div style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            marginTop: 4,
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
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right", lineHeight: 1.4 }}>
                <span style={{ color: "#E84855", fontWeight: 700, fontSize: 17 }}>{trackedCount}</span>
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
          {/* Hamburger button — visible only on mobile */}
          <button
            className="nav-hamburger"
            onClick={() => setMobileMenuOpen(true)}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              fontSize: 24,
              cursor: "pointer",
              padding: 4,
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Open navigation menu"
          >
            ☰
          </button>
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
                padding: "11px 18px",
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

      {/* Mobile slide-out panel */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop overlay */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 199,
            }}
          />
          {/* Slide-out panel */}
          <nav
            className="nav-mobile-panel"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 260,
              background: "#141419",
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              zIndex: 200,
              display: "flex",
              flexDirection: "column",
              paddingTop: 56,
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "none",
                border: "none",
                color: "#fff",
                fontSize: 22,
                cursor: "pointer",
                padding: 4,
              }}
              aria-label="Close navigation menu"
            >
              ✕
            </button>
            {tabs.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.id}
                  href={t.href}
                  onClick={(e) => {
                    setMobileMenuOpen(false);
                    if (active && t.href === "/") { e.preventDefault(); dispatchForYouRefresh(); }
                    if (active && t.href === "/explore") { e.preventDefault(); dispatchExploreRefresh(); }
                  }}
                  style={{
                    padding: "16px 24px",
                    fontSize: 15,
                    fontWeight: active ? 700 : 500,
                    color: active ? "#fff" : "rgba(255,255,255,0.5)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textDecoration: "none",
                    transition: "color 0.15s",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{t.icon}</span>
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </header>
  );
}
