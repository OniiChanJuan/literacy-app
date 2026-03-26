"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const buttonStyle: React.CSSProperties = {
    background: "rgba(232,72,85,0.1)",
    border: "1px solid rgba(232,72,85,0.3)",
    color: "#E84855",
    padding: "10px 24px",
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 14,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.2s",
  };

  return (
    <div
      style={{
        textAlign: "center",
        padding: "80px 20px",
        maxWidth: 500,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          fontSize: 48,
          fontFamily: "var(--font-serif)",
          color: "rgba(255,255,255,0.15)",
          marginBottom: 16,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        404
      </div>

      <h1
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: "#fff",
          marginBottom: 12,
          marginTop: 0,
        }}
      >
        Page not found
      </h1>

      <p
        style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.4)",
          lineHeight: 1.6,
          marginBottom: 28,
        }}
      >
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 12,
          marginBottom: 32,
        }}
      >
        <Link
          href="/"
          style={buttonStyle}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(232,72,85,0.2)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(232,72,85,0.1)")
          }
        >
          Go Home
        </Link>
        <Link
          href="/explore"
          style={buttonStyle}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(232,72,85,0.2)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(232,72,85,0.1)")
          }
        >
          Explore
        </Link>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.3)",
          marginTop: 32,
          marginBottom: 12,
        }}
      >
        Try searching for what you&apos;re looking for:
      </p>

      <input
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          maxWidth: 360,
          padding: "12px 18px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          color: "#fff",
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
