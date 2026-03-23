"use client";

import { useState, useMemo, useEffect } from "react";
import { ALL_ITEMS, ITEMS, TYPES, VIBES, TYPE_ORDER, ALL_GENRES, ALL_VIBES, isUpcoming, type MediaType, type Item, type UpcomingItem } from "@/lib/data";
import Card from "@/components/card";
import UpcomingCard from "@/components/upcoming-card";
import ScrollRow from "@/components/scroll-row";

interface SearchResult extends Item {
  source: string;
  routeId: string;
}

type Mode = "all" | "type" | "genre" | "vibe";

// ── Section label ───────────────────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 10,
      color: "rgba(255,255,255,0.25)",
      textTransform: "uppercase",
      letterSpacing: 2,
      fontWeight: 600,
      marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

export default function ExplorePage() {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [selectedType, setSelectedType] = useState<MediaType | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);

  // Determine if any filter is active
  const hasActiveFilter = selectedType !== null || selectedGenre !== null || selectedVibe !== null;

  // API search with debounce
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(search.trim())}`)
        .then((r) => r.json())
        .then((data) => { setSearchResults(Array.isArray(data) ? data : []); setSearching(false); })
        .catch(() => { setSearchResults([]); setSearching(false); });
    }, 400);
    return () => clearTimeout(timeout);
  }, [search]);

  // Fetch upcoming
  useEffect(() => {
    fetch("/api/upcoming")
      .then((r) => r.json())
      .then((data) => setUpcoming(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Highest rated items (by first external score)
  const highestRated = useMemo(() => {
    return [...ITEMS]
      .filter((i) => Object.keys(i.ext).length > 0)
      .sort((a, b) => {
        const aScore = Object.values(a.ext)[0] || 0;
        const bScore = Object.values(b.ext)[0] || 0;
        return bScore - aScore;
      })
      .slice(0, 15);
  }, []);

  // Filtered results
  const filteredItems = useMemo(() => {
    if (selectedType) return ALL_ITEMS.filter((i) => i.type === selectedType);
    if (selectedGenre) return ALL_ITEMS.filter((i) => i.genre.includes(selectedGenre));
    if (selectedVibe) return ALL_ITEMS.filter((i) => i.vibes.includes(selectedVibe));
    return [];
  }, [selectedType, selectedGenre, selectedVibe]);

  const clearFilters = () => {
    setSelectedType(null);
    setSelectedGenre(null);
    setSelectedVibe(null);
  };

  const modes: { id: Mode; label: string }[] = [
    { id: "all",   label: "All" },
    { id: "type",  label: "By Media" },
    { id: "genre", label: "By Genre" },
    { id: "vibe",  label: "By Vibe" },
  ];

  return (
    <div>
      {/* 1. Search bar */}
      <div style={{ position: "relative", marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Search titles, genres, vibes, people..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "14px 18px 14px 42px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            color: "#fff",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
        />
        <span style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.3 }}>⌕</span>
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "rgba(255,255,255,0.3)",
              cursor: "pointer", fontSize: 14,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Search results — override everything when searching */}
      {searchResults !== null || searching ? (
        <div>
          {searching && <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}>Searching...</div>}
          {!searching && searchResults && (
            <>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
              </div>
              {searchResults.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16 }}>
                  {searchResults.map((item) => (
                    <Card key={`${item.source}-${item.id}`} item={item} routeId={item.routeId} />
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "32px 20px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  No matches found. Try a different search.
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* 2. Browse mode tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
            {modes.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { setMode(m.id); clearFilters(); }}
                  style={{
                    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                    color: active ? "#fff" : "rgba(255,255,255,0.4)",
                    border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Active filter results */}
          {hasActiveFilter && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 800, color: "#fff" }}>
                    {selectedType && `${TYPES[selectedType].icon} ${TYPES[selectedType].label}`}
                    {selectedGenre && selectedGenre}
                    {selectedVibe && VIBES[selectedVibe] && `${VIBES[selectedVibe].icon} ${VIBES[selectedVibe].label}`}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{filteredItems.length} items</span>
                </div>
                <button
                  onClick={clearFilters}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 11 }}
                >
                  ✕ Clear filter
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16 }}>
                {filteredItems.map((item) =>
                  isUpcoming(item)
                    ? <UpcomingCard key={item.id} item={item as UpcomingItem} />
                    : <Card key={item.id} item={item} />
                )}
              </div>
              {filteredItems.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 20px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  No items match this filter.
                </div>
              )}
            </div>
          )}

          {/* Default curated storefront — only shown when no filter is active */}
          {!hasActiveFilter && (
            <>
              {/* 3. Browse by media type — 4-column grid */}
              {(mode === "all" || mode === "type") && (
                <div style={{ marginBottom: 32 }}>
                  <SectionLabel>Browse by media type</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {TYPE_ORDER.map((k) => {
                      const t = TYPES[k];
                      const count = ALL_ITEMS.filter((i) => i.type === k).length;
                      return (
                        <button
                          key={k}
                          onClick={() => { setSelectedType(k); setMode("type"); }}
                          style={{
                            background: `${t.color}0A`,
                            border: `1px solid ${t.color}33`,
                            borderRadius: 14,
                            padding: "18px 16px",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = `${t.color}18`; e.currentTarget.style.transform = "translateY(-2px)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = `${t.color}0A`; e.currentTarget.style.transform = ""; }}
                        >
                          <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: t.color, marginBottom: 3 }}>
                            {t.label}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-faint)" }}>
                            {count} title{count !== 1 ? "s" : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Popular genres */}
              {(mode === "all" || mode === "genre") && (
                <div style={{ marginBottom: 32 }}>
                  <SectionLabel>Popular genres</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {ALL_GENRES.slice(0, 16).map((g) => {
                      const count = ALL_ITEMS.filter((i) => i.genre.includes(g)).length;
                      return (
                        <button
                          key={g}
                          onClick={() => { setSelectedGenre(g); setMode("genre"); }}
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 20,
                            padding: "6px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "rgba(255,255,255,0.6)",
                            cursor: "pointer",
                            transition: "all 0.15s",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                        >
                          {g}
                          <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. Browse by vibe */}
              {(mode === "all" || mode === "vibe") && (
                <div style={{ marginBottom: 32 }}>
                  <SectionLabel>Browse by vibe</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {ALL_VIBES.map((v) => {
                      const vibe = VIBES[v];
                      if (!vibe) return null;
                      const count = ALL_ITEMS.filter((i) => i.vibes.includes(v)).length;
                      return (
                        <button
                          key={v}
                          onClick={() => { setSelectedVibe(v); setMode("vibe"); }}
                          style={{
                            background: `${vibe.color}12`,
                            border: `1px solid ${vibe.color}25`,
                            borderRadius: 20,
                            padding: "6px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            color: vibe.color,
                            cursor: "pointer",
                            transition: "all 0.15s",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = `${vibe.color}25`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = `${vibe.color}12`; }}
                        >
                          <span>{vibe.icon}</span>
                          {vibe.label}
                          <span style={{ fontSize: 10, opacity: 0.6 }}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 6. Highest rated across all media */}
              {mode === "all" && highestRated.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <ScrollRow
                    label="Highest Rated"
                    sub="Top-rated across all media"
                    icon="⭐"
                  >
                    {highestRated.map((item) => <Card key={item.id} item={item} />)}
                  </ScrollRow>
                </div>
              )}

              {/* 7. Coming soon */}
              {mode === "all" && upcoming.length > 0 && (
                <div>
                  <ScrollRow
                    label="Coming Soon"
                    sub={`${upcoming.length} upcoming releases`}
                    icon="🔥"
                    iconBg="#E8485522"
                  >
                    {upcoming.map((item) => (
                      <UpcomingCard key={`upcoming-${item.id}`} item={item} />
                    ))}
                  </ScrollRow>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
