"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLibrary } from "@/lib/library-context";
import UserMenu from "./user-menu";
import GlobalSearch from "./global-search";

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

  const initial = session?.user?.name?.[0]?.toUpperCase() || "?";

  return (
    <header style={{
      padding: "28px 28px 0",
      background: "linear-gradient(180deg, rgba(232,72,85,0.06) 0%, transparent 100%)",
      backgroundColor: "#0b0b10",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      {/* Top row: logo + right side */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>

        {/* Logo */}
        <div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 32,
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
        </div>

        {/* Right side: search + auth */}
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
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.id}
              href={t.href}
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
    </header>
  );
}
