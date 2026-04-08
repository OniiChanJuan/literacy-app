"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "cookie_consent_dismissed";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "true") {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable — show banner
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#141419",
        borderTop: "0.5px solid rgba(255,255,255,0.08)",
        padding: "12px 20px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <style>{`
        .cookie-btn:hover { background: rgba(255,255,255,0.15) !important; }
      `}</style>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
        CrossShelf uses essential cookies for authentication. We don&apos;t use
        tracking or advertising cookies.
      </span>
      <Link
        href="/cookies"
        style={{ fontSize: 12, color: "#3185FC", textDecoration: "none" }}
      >
        Cookie Policy
      </Link>
      <button
        onClick={dismiss}
        className="cookie-btn"
        style={{
          fontSize: 12,
          fontWeight: 600,
          padding: "6px 16px",
          borderRadius: 6,
          background: "rgba(255,255,255,0.1)",
          border: "0.5px solid rgba(255,255,255,0.15)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Got it
      </button>
    </div>
  );
}
