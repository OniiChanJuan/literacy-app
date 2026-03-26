"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { TYPES, VIBES, TYPE_ORDER, ALL_GENRES, ALL_VIBES, type MediaType, type Item, type UpcomingItem } from "@/lib/data";
import { getTagDisplayName } from "@/lib/tags";
import Card from "@/components/card";
import UpcomingCard from "@/components/upcoming-card";
import ScrollRow from "@/components/scroll-row";
import { useScrollRestore } from "@/lib/use-scroll-restore";

interface SearchResult extends Item { source: string; routeId: string; }

// Popular tags for browsing — curated mix of universal + type-specific tags
const POPULAR_TAGS: { slug: string; color: string }[] = [
  // Themes
  { slug: "revenge", color: "#E84855" },
  { slug: "survival", color: "#FF6B6B" },
  { slug: "coming-of-age", color: "#F9A620" },
  { slug: "betrayal", color: "#C45BAA" },
  { slug: "redemption", color: "#2EC4B6" },
  { slug: "identity", color: "#3185FC" },
  { slug: "found-family", color: "#9B5DE5" },
  { slug: "war", color: "#888" },
  { slug: "forbidden-love", color: "#FF6B6B" },
  { slug: "political-intrigue", color: "#C45BAA" },
  // Settings
  { slug: "cyberpunk", color: "#00BBF9" },
  { slug: "post-apocalyptic", color: "#F9A620" },
  { slug: "medieval", color: "#A0522D" },
  { slug: "space", color: "#3185FC" },
  { slug: "dystopian", color: "#888" },
  { slug: "noir", color: "#aaa" },
  // Characters
  { slug: "anti-hero", color: "#E84855" },
  { slug: "morally-gray", color: "#888" },
  { slug: "ensemble-cast", color: "#9B5DE5" },
  { slug: "lone-wolf", color: "#2EC4B6" },
  // Tone
  { slug: "philosophical", color: "#3185FC" },
  { slug: "brutal", color: "#E84855" },
  { slug: "cozy", color: "#F9A620" },
  { slug: "suspenseful", color: "#C45BAA" },
  { slug: "melancholic", color: "#9B5DE5" },
  { slug: "darkly-comic", color: "#2EC4B6" },
  // Pacing
  { slug: "slow-burn", color: "#F9A620" },
  { slug: "fast-paced", color: "#E84855" },
  { slug: "bingeable", color: "#00BBF9" },
  // Narrative
  { slug: "twist-ending", color: "#C45BAA" },
  { slug: "based-on-true-story", color: "#888" },
];

// Genre lists per media type
const TYPE_GENRES: Record<string, string[]> = {
  movie: ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Thriller", "Romance", "Animation", "Documentary", "Fantasy", "Mystery", "Crime"],
  tv: ["Drama", "Comedy", "Thriller", "Sci-Fi", "Crime", "Documentary", "Animation", "Anime", "Fantasy", "Horror"],
  game: ["RPG", "Action", "Adventure", "Platformer", "Strategy", "Shooter", "Puzzle", "Simulation", "Horror", "Fighting"],
  book: ["Fiction", "Sci-Fi", "Fantasy", "Mystery", "Thriller", "Romance", "Literary Fiction", "Nonfiction", "Horror", "Historical"],
  manga: ["Shonen", "Seinen", "Shojo", "Isekai", "Slice of Life", "Horror", "Romance", "Fantasy", "Mecha"],
  music: ["Rock", "Hip-Hop", "Electronic", "R&B", "Indie", "Jazz", "Classical", "Pop", "Metal", "Alternative"],
  comic: ["Superhero", "Sci-Fi", "Horror", "Fantasy", "Crime", "Indie"],
  podcast: ["True Crime", "Comedy", "Interview", "Education", "Tech", "History", "Science", "Culture"],
};

type SortOption = "rating" | "popular" | "newest" | "oldest" | "az";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "rating", label: "Highest rated" },
  { value: "popular", label: "Most popular" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "az", label: "A-Z" },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 2, fontWeight: 600, marginBottom: 14 }}>
      {children}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px 20px", color: "var(--text-faint)" }}>Loading...</div>}>
      <ExploreContent />
    </Suspense>
  );
}

function ExploreContent() {
  useScrollRestore();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state from URL
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedType, setSelectedType] = useState<MediaType | null>((searchParams.get("type") as MediaType) || null);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(searchParams.get("genre")?.split(",").filter(Boolean) || []);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(searchParams.get("vibe") || null);
  const [selectedTag, setSelectedTag] = useState<string | null>(searchParams.get("tag") || null);
  const [sort, setSort] = useState<SortOption>((searchParams.get("sort") as SortOption) || "rating");
  const [searchResults, setSearchResults] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [gridItems, setGridItems] = useState<Item[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});

  const hasGenreOrVibe = selectedGenres.length > 0 || selectedVibe !== null || selectedTag !== null;

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (selectedType) params.set("type", selectedType);
    if (selectedGenres.length) params.set("genre", selectedGenres.join(","));
    if (selectedVibe) params.set("vibe", selectedVibe);
    if (selectedTag) params.set("tag", selectedTag);
    if (sort !== "rating") params.set("sort", sort);
    const qs = params.toString();
    const newUrl = qs ? `/explore?${qs}` : "/explore";
    if (window.location.pathname + window.location.search !== newUrl) {
      router.replace(newUrl, { scroll: false });
    }
  }, [search, selectedType, selectedGenres, selectedVibe, selectedTag, sort, router]);

  // Load counts
  useEffect(() => {
    fetch("/api/catalog/counts").then((r) => r.json()).then((d) => { if (d.byType) setTypeCounts(d.byType); }).catch(() => {});
    fetch("/api/upcoming").then((r) => r.json()).then((d) => {
      if (d && Array.isArray(d.upcoming)) setUpcoming(d.upcoming);
      else if (Array.isArray(d)) setUpcoming(d);
      else setUpcoming([]);
    }).catch(() => {});
  }, []);

  // Search — grouped results
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) { setSearchResults(null); return; }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(search.trim())}&grouped=true`)
        .then((r) => r.json()).then((d) => { setSearchResults(d); setSearching(false); })
        .catch(() => { setSearchResults({ groups: {}, franchise: null, suggestions: [], totalResults: 0 }); setSearching(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch grid items when genre/vibe filter active
  useEffect(() => {
    if ((!selectedType && !selectedTag) || !hasGenreOrVibe) { setGridItems([]); return; }
    setGridLoading(true);
    let url = `/api/catalog?limit=60`;
    if (selectedType) url += `&type=${selectedType}`;
    if (selectedGenres.length) url += `&genre=${encodeURIComponent(selectedGenres.join(","))}`;
    if (selectedVibe) url += `&vibe=${encodeURIComponent(selectedVibe)}`;
    if (selectedTag) url += `&tag=${encodeURIComponent(selectedTag)}`;
    fetch(url).then((r) => r.json()).then((d) => {
      let items = Array.isArray(d) ? d : [];
      // Client-side sort
      if (sort === "newest") items.sort((a: Item, b: Item) => b.year - a.year);
      else if (sort === "oldest") items.sort((a: Item, b: Item) => a.year - b.year);
      else if (sort === "az") items.sort((a: Item, b: Item) => a.title.localeCompare(b.title));
      setGridItems(items);
      setGridLoading(false);
    }).catch(() => { setGridItems([]); setGridLoading(false); });
  }, [selectedType, selectedGenres, selectedVibe, selectedTag, sort, hasGenreOrVibe]);

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  };

  const clearAll = () => { setSelectedType(null); setSelectedGenres([]); setSelectedVibe(null); setSort("rating"); };

  const typeGenres = selectedType ? (TYPE_GENRES[selectedType] || ALL_GENRES.slice(0, 12)) : [];
  const typeColor = selectedType ? TYPES[selectedType].color : "#fff";

  // Show search results — organized by type
  if (searchResults !== null || searching) {
    const sr = searchResults || {};
    const groups = sr.groups || {};
    const franchise = sr.franchise;
    const suggestions = sr.suggestions || [];
    const bestMatch = sr.bestMatch;
    const totalResults = sr.totalResults || 0;
    const hasResults = totalResults > 0;

    return (
      <div className="content-width">
        <SearchBar search={search} setSearch={setSearch} />
        {searching && <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}>Searching across all media...</div>}
        {!searching && searchResults && (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
              {totalResults} result{totalResults !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
            </div>

            {/* Franchise match */}
            {franchise && (
              <Link
                href={`/franchise/${franchise.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  background: "rgba(232,72,85,0.06)", border: "0.5px solid rgba(232,72,85,0.15)",
                  borderRadius: 10, marginBottom: 16, textDecoration: "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(232,72,85,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(232,72,85,0.06)"; }}
              >
                <span style={{ fontSize: 24 }}>{franchise.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{franchise.name} universe</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                    {franchise.itemCount} entries across {franchise.typeCount} media type{franchise.typeCount !== 1 ? "s" : ""}
                  </div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>→</span>
              </Link>
            )}

            {/* Genre/vibe suggestions */}
            {suggestions.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {suggestions.map((s: any) => (
                  <Link
                    key={s.value}
                    href={`/explore?${s.type === "genre" ? "genre" : "vibe"}=${encodeURIComponent(s.value)}`}
                    style={{
                      fontSize: 11, padding: "5px 12px", borderRadius: 8,
                      background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.5)", textDecoration: "none",
                    }}
                  >
                    {s.label} →
                  </Link>
                ))}
              </div>
            )}

            {/* Best match — prominent card */}
            {bestMatch && hasResults && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Best match</div>
                <Link
                  href={`/item/${bestMatch.routeId || bestMatch.id}`}
                  style={{
                    display: "flex", gap: 14, padding: 14, borderRadius: 10,
                    background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)",
                    textDecoration: "none", transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                >
                  {bestMatch.cover?.startsWith("http") && (
                    <div style={{ width: 80, height: 110, borderRadius: 6, overflow: "hidden", flexShrink: 0, position: "relative" }}>
                      <img src={bestMatch.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{bestMatch.title}</span>
                      <span style={{
                        fontSize: 8, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                        background: TYPES[bestMatch.type as keyof typeof TYPES]?.color + "22",
                        color: TYPES[bestMatch.type as keyof typeof TYPES]?.color || "#888",
                        textTransform: "uppercase",
                      }}>
                        {TYPES[bestMatch.type as keyof typeof TYPES]?.label || bestMatch.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>{bestMatch.year}</div>
                    {bestMatch.desc && (
                      <div style={{
                        fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5,
                        overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {bestMatch.desc || bestMatch.description}
                      </div>
                    )}
                    {bestMatch.sourceLabel && bestMatch.source !== "local" && (
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.15)", marginTop: 4 }}>From {bestMatch.sourceLabel}</div>
                    )}
                  </div>
                </Link>
              </div>
            )}

            {/* Type-grouped results */}
            {Object.entries(groups).map(([type, group]: [string, any]) => (
              <div key={type} style={{ marginBottom: 16 }}>
                <ScrollRow
                  label={group.label}
                  sub={`${group.items.length} result${group.items.length !== 1 ? "s" : ""}`}
                >
                  {group.items.map((item: any) => (
                    <Card key={`${item.source}-${item.id}`} item={item} routeId={item.routeId} />
                  ))}
                </ScrollRow>
              </div>
            ))}

            {!hasResults && !searching && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 8 }}>
                  No results for &ldquo;{search}&rdquo;
                </div>
                <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginBottom: 16 }}>
                  Try a different spelling or search for the author/creator instead
                </div>
                <Link href="/explore" onClick={() => setSearch("")} style={{ fontSize: 12, color: "#E84855", textDecoration: "none" }}>
                  Browse titles on Explore →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="content-width">
      <SearchBar search={search} setSearch={setSearch} />

      {/* Compact media type row */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, marginBottom: 20 }}>
        {TYPE_ORDER.map((k) => {
          const t = TYPES[k];
          const active = selectedType === k;
          const count = typeCounts[k] || 0;
          return (
            <button
              key={k}
              onClick={() => {
                if (active) { clearAll(); } else { setSelectedType(k); setSelectedGenres([]); setSelectedVibe(null); }
              }}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "7px 14px", borderRadius: 8,
                background: active ? `${t.color}33` : `${t.color}14`,
                border: active ? `1px solid ${t.color}80` : `0.5px solid ${t.color}2E`,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = `${t.color}1F`; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? `${t.color}33` : `${t.color}14`; }}
            >
              <MediaTypeIcon type={k} color={t.color} />
              <span style={{ fontSize: 12, fontWeight: 500, color: t.color }}>{t.label}</span>
              <span style={{ fontSize: 10, color: `${t.color}66` }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── FILTERED VIEW: media type selected ─────────────────────────── */}
      {selectedType && (
        <div style={{ transition: "opacity 0.15s", opacity: 1 }}>
          {/* Genre sub-filter pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {typeGenres.map((g) => {
              const active = selectedGenres.includes(g);
              return (
                <button
                  key={g}
                  onClick={() => toggleGenre(g)}
                  style={{
                    fontSize: 11, padding: "5px 12px", borderRadius: 12, cursor: "pointer",
                    background: active ? `${typeColor}22` : "rgba(255,255,255,0.05)",
                    border: `0.5px solid ${active ? typeColor + "55" : "rgba(255,255,255,0.08)"}`,
                    color: active ? typeColor : "rgba(255,255,255,0.5)",
                    fontWeight: active ? 600 : 400, transition: "all 0.15s",
                  }}
                >
                  {g}
                </button>
              );
            })}
          </div>

          {/* Vibe pills + sort dropdown */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, flex: 1 }}>
              {ALL_VIBES.slice(0, 12).map((v) => {
                const vibe = VIBES[v];
                if (!vibe) return null;
                const active = selectedVibe === v;
                return (
                  <button
                    key={v}
                    onClick={() => setSelectedVibe(active ? null : v)}
                    style={{
                      fontSize: 9, padding: "3px 8px", borderRadius: 8, cursor: "pointer",
                      background: active ? `${vibe.color}22` : "rgba(255,255,255,0.06)",
                      border: active ? `0.5px solid ${vibe.color}44` : "none",
                      color: active ? vibe.color : "rgba(255,255,255,0.35)",
                      fontWeight: 500, transition: "all 0.15s",
                    }}
                  >
                    {vibe.icon} {vibe.label}
                  </button>
                );
              })}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              style={{
                fontSize: 10, background: "rgba(255,255,255,0.04)", padding: "4px 10px",
                borderRadius: 8, border: "0.5px solid rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.25)", outline: "none", cursor: "pointer", flexShrink: 0,
              }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Genre/vibe active → grid view */}
          {hasGenreOrVibe && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                  Showing: {selectedGenres.length > 0 ? selectedGenres.join(", ") + " " : ""}
                  {selectedType ? TYPES[selectedType].label.toLowerCase() : "all media"}
                  {selectedVibe && VIBES[selectedVibe] ? ` · ${VIBES[selectedVibe].label}` : ""}
                  {selectedTag ? ` · ${getTagDisplayName(selectedTag)}` : ""}
                  {" · sorted by "}{SORT_OPTIONS.find((o) => o.value === sort)?.label}
                </div>
                <button
                  onClick={() => { setSelectedGenres([]); setSelectedVibe(null); setSelectedTag(null); }}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 11 }}
                >
                  ✕ Clear filters
                </button>
              </div>
              {gridLoading ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-faint)", fontSize: 13 }}>Loading...</div>
              ) : gridItems.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {gridItems.map((item) => <Card key={item.id} item={item} />)}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No items match these filters.</div>
              )}
            </div>
          )}

          {/* No genre selected → genre rows */}
          {!hasGenreOrVibe && (
            <div>
              {/* Top overall row */}
              <GenreRow type={selectedType} genre={null} label={`Top ${TYPES[selectedType].label.toLowerCase()} overall`} />
              {/* Per-genre rows */}
              {typeGenres.map((g) => (
                <GenreRow key={g} type={selectedType} genre={g} label={`${g} ${TYPES[selectedType].label.toLowerCase()}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DEFAULT STOREFRONT: no type selected ───────────────────────── */}
      {!selectedType && (
        <>
          {/* Popular genres */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Popular genres</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ALL_GENRES.slice(0, 20).map((g) => (
                <button
                  key={g}
                  onClick={() => { setSelectedGenres([g]); }}
                  style={{
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                    color: "rgba(255,255,255,0.6)", cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Browse by vibe */}
          <div style={{ marginBottom: 28 }}>
            <SectionLabel>Browse by vibe</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ALL_VIBES.map((v) => {
                const vibe = VIBES[v];
                if (!vibe) return null;
                return (
                  <button
                    key={v}
                    onClick={() => { setSelectedVibe(v); }}
                    style={{
                      background: `${vibe.color}12`, border: `1px solid ${vibe.color}25`,
                      borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                      color: vibe.color, cursor: "pointer", transition: "all 0.15s",
                      display: "flex", alignItems: "center", gap: 5,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${vibe.color}25`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = `${vibe.color}12`; }}
                  >
                    <span>{vibe.icon}</span>
                    {vibe.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Browse by tag */}
          <div style={{ marginBottom: 28 }}>
            <SectionLabel>Browse by tag</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {POPULAR_TAGS.map((t) => {
                const active = selectedTag === t.slug;
                return (
                  <button
                    key={t.slug}
                    onClick={() => { setSelectedTag(active ? null : t.slug); }}
                    style={{
                      background: active ? `${t.color}30` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? t.color + "50" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 16, padding: "5px 12px", fontSize: 11, fontWeight: 500,
                      color: active ? t.color : "rgba(255,255,255,0.5)",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  >
                    {getTagDisplayName(t.slug)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Media type scroll rows */}
          {TYPE_ORDER.map((k) => {
            const t = TYPES[k];
            const count = typeCounts[k] || 0;
            if (count === 0) return null;
            return <MediaTypeRow key={k} type={k} label={`${t.icon} ${t.label}`} sub={`${count} titles`} />;
          })}
        </>
      )}

      {/* Coming soon — filtered by selected type */}
      {(() => {
        const filteredUpcoming = selectedType
          ? upcoming.filter((item) => item.type === selectedType)
          : upcoming;
        return filteredUpcoming.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <ScrollRow label="Coming Soon" sub={`${filteredUpcoming.length} upcoming releases`} icon="🔥" iconBg="#E8485522">
              {filteredUpcoming.map((item) => <UpcomingCard key={`upcoming-${item.id}`} item={item} />)}
            </ScrollRow>
          </div>
        ) : null;
      })()}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function SearchBar({ search, setSearch }: { search: string; setSearch: (s: string) => void }) {
  return (
    <div style={{ position: "relative", marginBottom: 24 }}>
      <input
        type="text"
        placeholder="Search titles, genres, vibes, people..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%", padding: "14px 18px 14px 42px",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, color: "#fff", fontSize: 14, outline: "none",
          boxSizing: "border-box", transition: "border-color 0.2s",
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
            background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 14,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function MediaTypeIcon({ type, color }: { type: string; color: string }) {
  const props = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "movie":
      return <svg {...props}><rect x="2" y="2" width="20" height="20" rx="2" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /><line x1="17" y1="17" x2="22" y2="17" /></svg>;
    case "tv":
      return <svg {...props}><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
    case "book":
      return <svg {...props}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
    case "manga":
      return <svg {...props}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /><line x1="14" y1="11" x2="20" y2="11" /><line x1="14" y1="15" x2="20" y2="15" /></svg>;
    case "comic":
      return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "game":
      return <svg {...props}><line x1="6" y1="11" x2="10" y2="11" /><line x1="8" y1="9" x2="8" y2="13" /><line x1="15" y1="12" x2="15.01" y2="12" /><line x1="18" y1="10" x2="18.01" y2="10" /><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" /></svg>;
    case "music":
      return <svg {...props}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="12" x2="12" y2="2" /></svg>;
    case "podcast":
      return <svg {...props}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;
    default:
      return null;
  }
}

function MediaTypeRow({ type, label, sub }: { type: string; label: string; sub: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    fetch(`/api/catalog?type=${type}&limit=20`)
      .then((r) => r.json()).then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]));
  }, [type]);
  if (items !== null && items.length < 4) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <ScrollRow label={label} sub={sub}>
        {items === null ? (
          <div style={{ display: "flex", gap: 10 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} style={{ flex: "0 0 150px", width: 150, height: 280, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        ) : items.map((item) => <Card key={item.id} item={item} />)}
      </ScrollRow>
    </div>
  );
}

function GenreRow({ type, genre, label }: { type: string; genre: string | null; label: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    let url = `/api/catalog?type=${type}&limit=15`;
    if (genre) url += `&genre=${encodeURIComponent(genre)}`;
    fetch(url).then((r) => r.json()).then((d) => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([]));
  }, [type, genre]);
  if (items !== null && items.length < 4) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <ScrollRow label={label} sub={`${items?.length || "..."} titles`}>
        {items === null ? (
          <div style={{ display: "flex", gap: 10 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} style={{ flex: "0 0 150px", width: 150, height: 280, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        ) : items.map((item) => <Card key={item.id} item={item} />)}
      </ScrollRow>
    </div>
  );
}
