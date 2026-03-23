"use client";

import { useState, useMemo, useEffect } from "react";
import { ALL_ITEMS, TYPES, VIBES, TYPE_ORDER, ALL_GENRES, ALL_VIBES, isUpcoming, type MediaType, type Item, type UpcomingItem } from "@/lib/data";
import Card from "@/components/card";
import UpcomingCard from "@/components/upcoming-card";

interface SearchResult extends Item {
  source: "local" | "tmdb";
  routeId: string;
}

type Mode = "all" | "type" | "genre" | "vibe";

export default function ExplorePage() {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<Mode>("all");

  // All mode filters
  const [filterTypes, setFilterTypes] = useState<MediaType[]>([]);
  const [filterGenres, setFilterGenres] = useState<string[]>([]);

  // Selection for tile modes
  const [selectedType, setSelectedType] = useState<MediaType | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);

  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const toggle = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  // API-powered search with debounce
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(search.trim())}`)
        .then((r) => r.json())
        .then((data) => {
          setSearchResults(Array.isArray(data) ? data : []);
          setSearching(false);
        })
        .catch(() => {
          setSearchResults([]);
          setSearching(false);
        });
    }, 400);
    return () => clearTimeout(timeout);
  }, [search]);

  // All-mode filtered results
  const allFiltered = useMemo(() => {
    return ALL_ITEMS.filter((i) => {
      if (filterTypes.length && !filterTypes.includes(i.type)) return false;
      if (filterGenres.length && !i.genre.some((g) => filterGenres.includes(g))) return false;
      return true;
    });
  }, [filterTypes, filterGenres]);

  const modes: { id: Mode; label: string }[] = [
    { id: "all",   label: "All" },
    { id: "type",  label: "By Media" },
    { id: "genre", label: "By Genre" },
    { id: "vibe",  label: "By Vibe" },
  ];

  return (
    <div>
      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search titles, genres, vibes, people..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 18px 12px 40px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            color: "#fff",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
        />
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.3 }}>
          ⌕
        </span>
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

      {/* Search results — shown instead of modes when searching */}
      {searchResults !== null || searching ? (
        <div>
          {searching && (
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}>
              Searching...
            </div>
          )}
          {!searching && searchResults && (
            <>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
              </div>
              {searchResults.length > 0 ? (
                <SearchResultGrid results={searchResults} />
              ) : (
                <Empty text="No matches found. Try a different search." />
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {modes.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  style={{
                    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                    color: active ? "#fff" : "rgba(255,255,255,0.4)",
                    border: active ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontSize: 12,
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

          {/* ── All mode ───────────────────────────────────────────────── */}
          {mode === "all" && (
            <div>
              {/* Type filter pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
                {TYPE_ORDER.map((k) => {
                  const t = TYPES[k];
                  const active = filterTypes.includes(k);
                  return (
                    <button
                      key={k}
                      onClick={() => setFilterTypes(toggle(filterTypes, k))}
                      style={{
                        background: active ? t.color : "rgba(255,255,255,0.05)",
                        color: active ? "#fff" : "rgba(255,255,255,0.5)",
                        border: "none",
                        borderRadius: 18,
                        padding: "6px 13px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {t.icon} {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Genre filter toggle */}
              <GenreFilterBar genres={filterGenres} onToggle={(g) => setFilterGenres(toggle(filterGenres, g))} />

              {/* Clear all */}
              {(filterTypes.length > 0 || filterGenres.length > 0) && (
                <button
                  onClick={() => { setFilterTypes([]); setFilterGenres([]); }}
                  style={{
                    background: "none", border: "none", color: "rgba(255,255,255,0.35)",
                    cursor: "pointer", fontSize: 11, marginBottom: 16, padding: 0,
                  }}
                >
                  ✕ Clear filters
                </button>
              )}

              <ItemGrid items={allFiltered} />
              {allFiltered.length === 0 && <Empty text="No items match your filters." />}
            </div>
          )}

          {/* ── By Media mode ──────────────────────────────────────────── */}
          {mode === "type" && (
            <div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 10,
                marginBottom: 28,
              }}>
                {TYPE_ORDER.map((k) => {
                  const t = TYPES[k];
                  const count = ALL_ITEMS.filter((i) => i.type === k).length;
                  const active = selectedType === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setSelectedType(active ? null : k)}
                      style={{
                        background: active ? t.color : "rgba(255,255,255,0.03)",
                        border: active ? "none" : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 14,
                        padding: "16px 14px",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    >
                      <div style={{ fontSize: 24, marginBottom: 6 }}>{t.icon}</div>
                      <div style={{
                        fontSize: 13, fontWeight: 700,
                        color: active ? "#fff" : "rgba(255,255,255,0.75)",
                        marginBottom: 2,
                      }}>
                        {t.label}
                      </div>
                      <div style={{
                        fontSize: 10,
                        color: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)",
                      }}>
                        {count} title{count !== 1 ? "s" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedType && (
                <div>
                  <SectionHeader
                    icon={TYPES[selectedType].icon}
                    label={TYPES[selectedType].label}
                  />
                  <ItemGrid items={ALL_ITEMS.filter((i) => i.type === selectedType)} />
                </div>
              )}
            </div>
          )}

          {/* ── By Genre mode ──────────────────────────────────────────── */}
          {mode === "genre" && (
            <div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 10,
                marginBottom: 28,
              }}>
                {ALL_GENRES.map((g) => {
                  const count = ALL_ITEMS.filter((i) => i.genre.includes(g)).length;
                  const active = selectedGenre === g;
                  return (
                    <button
                      key={g}
                      onClick={() => setSelectedGenre(active ? null : g)}
                      style={{
                        background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.03)",
                        border: active
                          ? "1px solid rgba(255,255,255,0.25)"
                          : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 14,
                        padding: "14px",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.03)"; }}
                    >
                      <div style={{
                        fontSize: 13, fontWeight: 700,
                        color: active ? "#fff" : "rgba(255,255,255,0.75)",
                        marginBottom: 2,
                      }}>
                        {g}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                        {count} title{count !== 1 ? "s" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedGenre && (
                <div>
                  <SectionHeader label={selectedGenre} />
                  <ItemGrid items={ALL_ITEMS.filter((i) => i.genre.includes(selectedGenre))} />
                </div>
              )}
              {!selectedGenre && <Empty text="Tap a genre to see matching media" />}
            </div>
          )}

          {/* ── By Vibe mode ───────────────────────────────────────────── */}
          {mode === "vibe" && (
            <div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 10,
                marginBottom: 28,
              }}>
                {ALL_VIBES.map((v) => {
                  const vibe = VIBES[v];
                  if (!vibe) return null;
                  const count = ALL_ITEMS.filter((i) => i.vibes.includes(v)).length;
                  const active = selectedVibe === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setSelectedVibe(active ? null : v)}
                      style={{
                        background: active ? vibe.color + "22" : "rgba(255,255,255,0.03)",
                        border: active
                          ? `1px solid ${vibe.color}55`
                          : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 14,
                        padding: "14px",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? vibe.color + "22" : "rgba(255,255,255,0.03)"; }}
                    >
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{vibe.icon}</div>
                      <div style={{
                        fontSize: 13, fontWeight: 700,
                        color: active ? "#fff" : "rgba(255,255,255,0.75)",
                        marginBottom: 2,
                      }}>
                        {vibe.label}
                      </div>
                      <div style={{
                        fontSize: 10,
                        color: active ? vibe.color : "rgba(255,255,255,0.3)",
                      }}>
                        {count} title{count !== 1 ? "s" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedVibe && VIBES[selectedVibe] && (
                <div>
                  <SectionHeader
                    icon={VIBES[selectedVibe].icon}
                    label={VIBES[selectedVibe].label}
                  />
                  <ItemGrid items={ALL_ITEMS.filter((i) => i.vibes.includes(selectedVibe))} />
                </div>
              )}
              {!selectedVibe && <Empty text="Tap a vibe to discover media that matches the mood" />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components (local to this page) ─────────────────────────────────────

function SearchResultGrid({ results }: { results: SearchResult[] }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
      gap: 16,
    }}>
      {results.map((item) => (
        <Card key={`${item.source}-${item.id}`} item={item} routeId={item.routeId} />
      ))}
    </div>
  );
}

function ItemGrid({ items }: { items: Item[] }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
      gap: 16,
    }}>
      {items.map((item) =>
        isUpcoming(item)
          ? <UpcomingCard key={item.id} item={item as UpcomingItem} />
          : <Card key={item.id} item={item} />
      )}
    </div>
  );
}

function SectionHeader({ label, icon }: { label: string; icon?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800,
      marginBottom: 16, color: "#fff",
    }}>
      {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
      {label}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      textAlign: "center", padding: "32px 20px",
      color: "rgba(255,255,255,0.3)", fontSize: 13,
    }}>
      {text}
    </div>
  );
}

function GenreFilterBar({ genres, onToggle }: { genres: string[]; onToggle: (g: string) => void }) {
  const [showGenres, setShowGenres] = useState(false);

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setShowGenres(!showGenres)}
        style={{
          background: "none", border: "none",
          color: "rgba(255,255,255,0.4)",
          cursor: "pointer", fontSize: 11, padding: 0,
          marginBottom: showGenres ? 7 : 0,
        }}
      >
        {showGenres ? "▾ Hide genres" : "▸ Filter by genre"}
      </button>
      {showGenres && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {ALL_GENRES.map((g) => {
            const active = genres.includes(g);
            return (
              <button
                key={g}
                onClick={() => onToggle(g)}
                style={{
                  background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.04)",
                  color: active ? "#fff" : "rgba(255,255,255,0.4)",
                  border: active
                    ? "1px solid rgba(255,255,255,0.2)"
                    : "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: "4px 11px",
                  fontSize: 11,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {g}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
