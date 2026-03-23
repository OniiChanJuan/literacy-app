"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { id: "foryou",  label: "For You",  icon: "✦", href: "/" },
  { id: "explore", label: "Explore",  icon: "◎", href: "/explore" },
  { id: "library", label: "Library",  icon: "▤", href: "/library" },
  { id: "people",  label: "People",   icon: "◉", href: "/people" },
];

export default function Nav() {
  const pathname = usePathname();

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

        {/* Right side: stats + avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right", lineHeight: 1.4 }}>
            <span style={{ color: "#E84855", fontWeight: 700, fontSize: 17 }}>0</span>
            <br />tracked
          </div>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #E84855, #C45BAA)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
          }}>
            L
          </div>
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
