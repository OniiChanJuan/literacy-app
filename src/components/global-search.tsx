"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TYPES, type MediaType } from "@/lib/data";

interface SearchResult {
  id: number;
  title: string;
  type: MediaType;
  year?: number;
  cover?: string;
  routeId?: string;
  slug?: string | null;
  source?: string;
}

interface GroupedResults {
  bestMatch: SearchResult | null;
  groups: Record<string, { label: string; items: SearchResult[] }>;
  franchise: { id: number; name: string; icon: string; itemCount: number; typeCount: number } | null;
  totalResults: number;
}

export default function GlobalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupedResults | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isExplore = pathname === "/explore";

  // Sync from explore page URL search param
  useEffect(() => {
    if (isExplore) {
      const q = searchParams.get("q") || "";
      if (q && q !== query) setQuery(q);
    }
  }, [searchParams, isExplore]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}&grouped=true`)
        .then((r) => r.json())
        .then((d) => { setResults(d); setLoading(false); })
        .catch(() => { setResults(null); setLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleSubmit = useCallback(() => {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
  }, [query, router]);

  const handleResultClick = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Max 3 results per type in dropdown
  const dropdownGroups = results?.groups
    ? Object.entries(results.groups).slice(0, 4).map(([type, group]) => ({
        type: type as MediaType,
        label: group.label,
        items: group.items.slice(0, 3),
      }))
    : [];

  const hasResults = dropdownGroups.some((g) => g.items.length > 0) || results?.franchise;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {/* Collapsed: icon button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Search"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            transition: "all 0.15s",
          }}
        >
          ⌕
        </button>
      )}

      {/* Expanded: input */}
      {open && (
        <div style={{ position: "relative" }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search everything..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            className="search-input-expanded"
            style={{
              width: 280,
              padding: "8px 32px 8px 34px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              color: "#fff",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
              transition: "width 0.2s ease",
            }}
          />
          <span style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 14,
            opacity: 0.4,
            pointerEvents: "none",
          }}>
            ⌕
          </span>
          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.3)",
                cursor: "pointer",
                fontSize: 12,
                padding: 2,
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Dropdown results */}
      {open && query.trim().length >= 2 && (
        <div className="search-dropdown" style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: 350,
          maxHeight: 440,
          overflowY: "auto",
          background: "#1a1a22",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          zIndex: 100,
          padding: "6px 0",
        }}>
          {loading && !results && (
            <div style={{ padding: "8px 0" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px" }}>
                  <div className="skeleton-shimmer" style={{ width: 30, height: 42, borderRadius: 4, background: "rgba(255,255,255,0.04)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton-shimmer" style={{ height: 10, width: `${60 + i * 10}%`, borderRadius: 3, marginBottom: 6, background: "rgba(255,255,255,0.06)" }} />
                    <div className="skeleton-shimmer" style={{ height: 8, width: "30%", borderRadius: 3, background: "rgba(255,255,255,0.04)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && results && !hasResults && (
            <div style={{ padding: "16px", textAlign: "center" }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 6 }}>
                No results for &ldquo;{query}&rdquo;
              </div>
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
                Try a different spelling or search by creator
              </div>
            </div>
          )}

          {/* Franchise match */}
          {results?.franchise && (
            <Link
              href={`/franchise/${results.franchise.id}`}
              onClick={handleResultClick}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                textDecoration: "none",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 20 }}>{results.franchise.icon}</span>
              <div>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{results.franchise.name}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>
                  Franchise &middot; {results.franchise.itemCount} items &middot; {results.franchise.typeCount} media types
                </div>
              </div>
            </Link>
          )}

          {/* Grouped results */}
          {dropdownGroups.map((group) => (
            <div key={group.type}>
              <div style={{
                padding: "8px 14px 4px",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: TYPES[group.type]?.color || "rgba(255,255,255,0.3)",
              }}>
                {TYPES[group.type]?.icon} {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={`${item.source}-${item.routeId || item.id}`}
                  href={item.routeId ? `/item/${item.routeId}` : (item.slug ? `/${item.type}/${item.slug}` : `/item/${item.id}`)}
                  onClick={handleResultClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 14px",
                    textDecoration: "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {item.cover ? (
                    <img
                      src={item.cover}
                      alt=""
                      style={{
                        width: 30,
                        height: 42,
                        objectFit: "cover",
                        borderRadius: 4,
                        flexShrink: 0,
                        background: "rgba(255,255,255,0.05)",
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 30,
                      height: 42,
                      borderRadius: 4,
                      flexShrink: 0,
                      background: "rgba(255,255,255,0.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                    }}>
                      {TYPES[item.type]?.icon || "?"}
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {item.title}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
                      {item.year || ""}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ))}

          {/* See all results */}
          {results && results.totalResults > 0 && (
            <button
              onClick={handleSubmit}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 14px",
                background: "none",
                border: "none",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                color: "#E84855",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "center",
                marginTop: 2,
              }}
            >
              See all {results.totalResults} results →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
