"use client";

import { useState, useEffect, useRef, memo, useCallback, useMemo } from "react";
import { TYPES, type Item, type UpcomingItem, type MediaType } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import { useScrollRestore } from "@/lib/use-scroll-restore";
import { useSession } from "@/lib/supabase/use-session";
import Card from "@/components/card";
import TasteIdentityCard from "@/components/taste-identity-card";
import PickedForYouGrid from "@/components/picked-for-you-grid";
import CrossYourShelf from "@/components/cross-your-shelf";
import WhatsHappening from "@/components/whats-happening";
import UpcomingCard from "@/components/upcoming-card";
import ScrollRow from "@/components/scroll-row";
import { SkeletonRow } from "@/components/skeleton-card";
import ErrorBoundary from "@/components/error-boundary";
import Link from "next/link";
import Image from "next/image";
import { isAnime } from "@/lib/anime";

// ── Media Type Filter SVG Icons ──────────────────────────────────────────
type FilterType = MediaType | "anime";
const MEDIA_FILTER_ICONS: Record<FilterType, (color: string) => React.ReactNode> = {
  movie: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="12" x2="7" y2="12" /><line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" /><line x1="17" y1="12" x2="22" y2="12" /><line x1="17" y1="17" x2="22" y2="17" />
    </svg>
  ),
  tv: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="8" y1="22" x2="16" y2="22" /><line x1="12" y1="19" x2="12" y2="22" />
      <line x1="7" y1="2" x2="12" y2="5" /><line x1="17" y1="2" x2="12" y2="5" />
    </svg>
  ),
  book: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <path d="M4 4h2v16H4z" /><rect x="6" y="3" width="14" height="18" rx="1" />
      <line x1="10" y1="7" x2="16" y2="7" /><line x1="10" y1="11" x2="16" y2="11" />
    </svg>
  ),
  manga: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <path d="M2 4c0-1 1-2 2-2h7v20H4c-1 0-2-1-2-2z" />
      <path d="M11 2h7c1 0 2 1 2 2v16c0 1-1 2-2 2h-7z" />
      <line x1="5" y1="7" x2="8" y2="7" /><line x1="5" y1="10" x2="8" y2="10" /><line x1="5" y1="13" x2="7" y2="13" />
      <line x1="14" y1="7" x2="17" y2="7" /><line x1="14" y1="10" x2="17" y2="10" /><line x1="14" y1="13" x2="16" y2="13" />
    </svg>
  ),
  game: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="6" width="20" height="12" rx="4" />
      <circle cx="8" cy="12" r="1.5" /><line x1="8" y1="9" x2="8" y2="15" /><line x1="5" y1="12" x2="11" y2="12" />
      <circle cx="16" cy="10" r="1" fill={c} /><circle cx="18" cy="12" r="1" fill={c} />
    </svg>
  ),
  music: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="14" y2="5" />
    </svg>
  ),
  comic: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="13" y2="12" />
    </svg>
  ),
  podcast: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  ),
  anime: (c) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <ellipse cx="12" cy="12" rx="10" ry="6" />
      <circle cx="12" cy="12" r="3" fill={c} stroke="none" />
      <line x1="12" y1="6" x2="12" y2="4" /><line x1="12" y1="18" x2="12" y2="20" />
      <line x1="6.5" y1="8.5" x2="5" y2="7" /><line x1="17.5" y1="8.5" x2="19" y2="7" />
      <line x1="6.5" y1="15.5" x2="5" y2="17" /><line x1="17.5" y1="15.5" x2="19" y2="17" />
    </svg>
  ),
};

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const MEDIA_FILTER_ORDER: FilterType[] = ["movie", "tv", "anime", "book", "manga", "game", "music", "comic", "podcast"];
const MEDIA_FILTER_LABELS: Record<FilterType, string> = {
  movie: "Movies", tv: "TV", anime: "Anime", book: "Books", manga: "Manga",
  game: "Games", music: "Music", comic: "Comics", podcast: "Podcasts",
};

interface ReturningSoonItem {
  id: number;
  title: string;
  type: "tv";
  cover: string;
  seasonNumber: number;
  airDate: string;
  overview: string;
  year: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

interface FetchResult {
  data: Item[];
  hasMore: boolean;
}

async function fetchItems(url: string, retries = 2): Promise<FetchResult | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
        return null;
      }
      const data = await res.json();
      if (!Array.isArray(data)) return null;
      // Read server-supplied hasMore flag; fall back to length comparison
      const serverHasMore = res.headers.get("X-Has-More");
      const hasMore = serverHasMore !== null ? serverHasMore === "1" : false;
      return { data, hasMore };
    } catch {
      if (attempt < retries) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
      return null;
    }
  }
  return null;
}

function getBaseUrl(fetchUrl: string): { base: string; limit: number } {
  const url = new URL(fetchUrl, "http://x");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  return { base: fetchUrl, limit };
}

// ── Paginated Row (with infinite scroll) ────────────────────────────────

// Minimum items to show a row — fewer looks broken
const MIN_ROW_ITEMS = 4;

function PaginatedRow({ fetchUrl, label, sub, icon, iconBg, seeAllHref, delay = 0, mediaFilter, clientExclude, onLoad, alwaysShow, optimizeImages = false, lazy = false }: {
  fetchUrl: string; label: string; sub?: string; icon?: string; iconBg?: string; seeAllHref?: string; delay?: number; mediaFilter?: FilterType | null;
  /** Client-side set of item IDs to exclude from display (cross-row dedup) */
  clientExclude?: Set<number>;
  /** Called with raw fetched items so parent can track used IDs */
  onLoad?: (items: Item[]) => void;
  /** If true, show the row even if it has fewer than MIN_ROW_ITEMS items */
  alwaysShow?: boolean;
  /** Route images through Vercel optimizer — only use on the first above-the-fold row to stay under the 5k/month quota */
  optimizeImages?: boolean;
  /** If true, defer the initial fetch until the row scrolls near the viewport (IntersectionObserver). */
  lazy?: boolean;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [visible, setVisible] = useState(!lazy);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const { base } = getBaseUrl(fetchUrl);

  useEffect(() => {
    if (!lazy || visible) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy, visible]);

  const doFetch = useCallback(() => {
    setFailed(false);
    setItems(null);
    offsetRef.current = 0;
    setHasMore(true);
    const timer = setTimeout(() => {
      fetchItems(base).then((result) => {
        if (result && result.data.length > 0) {
          setItems(result.data);
          onLoadRef.current?.(result.data);
          offsetRef.current = result.data.length;
          setHasMore(result.hasMore);
        } else if (result) {
          setItems([]);
          setHasMore(false);
        } else {
          setFailed(true);
        }
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [base, delay]);

  useEffect(() => { if (visible) return doFetch(); }, [doFetch, visible]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const sep = base.includes("?") ? "&" : "?";
    fetchItems(`${base}${sep}offset=${offsetRef.current}`).then((result) => {
      if (result && result.data.length > 0) {
        setItems((prev) => {
          const existing = new Set((prev || []).map((i) => i.id));
          return [...(prev || []), ...result.data.filter((i) => !existing.has(i.id))];
        });
        offsetRef.current += result.data.length;
        setHasMore(result.hasMore);
      } else { setHasMore(false); }
      setLoadingMore(false);
      loadingRef.current = false;
    });
  }, [base, hasMore]);

  if (items === null && !failed) {
    return (
      <div ref={sentinelRef}>
        <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}><SkeletonRow count={8} /></ScrollRow>
      </div>
    );
  }
  if (failed) {
    return (
      <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 10px", minWidth: 200 }}>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Failed to load</span>
          <button onClick={doFetch} style={{
            fontSize: 10, color: "#E84855", background: "rgba(232,72,85,0.1)",
            border: "1px solid rgba(232,72,85,0.2)", borderRadius: 6,
            padding: "4px 10px", cursor: "pointer",
          }}>Retry</button>
        </div>
      </ScrollRow>
    );
  }
  if (!items || items.length === 0) return null;

  let displayed = mediaFilter
    ? mediaFilter === "anime"
      ? items.filter(isAnime)
      : items.filter((i) => i.type === mediaFilter)
    : items;
  if (mediaFilter && displayed.length === 0) return null;
  // Client-side cross-row deduplication
  if (clientExclude && clientExclude.size > 0) {
    displayed = displayed.filter((i) => !clientExclude.has(i.id));
  }
  // Final cover-art safety filter
  displayed = displayed.filter((i) => i.cover && i.cover.startsWith("http"));
  if (displayed.length === 0) return null;
  // Hide rows with too few items — looks broken; alwaysShow rows are exempt
  if (!alwaysShow && displayed.length < MIN_ROW_ITEMS) return null;

  return (
    <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}
      onLoadMore={hasMore ? handleLoadMore : undefined} loadingMore={loadingMore}>
      {displayed.map((item) => <Card key={item.id} item={item} optimized={optimizeImages} />)}
    </ScrollRow>
  );
}

// ── Lazy Row (loads on scroll into view) ────────────────────────────────

const LazyRow = memo(function LazyRow({ fetchUrl, label, sub, icon, iconBg, seeAllHref, mediaFilter }: {
  fetchUrl: string; label: string; sub?: string; icon?: string; iconBg?: string; seeAllHref?: string; mediaFilter?: FilterType | null;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [visible, setVisible] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const visRef = useRef<HTMLDivElement>(null);
  const { base } = getBaseUrl(fetchUrl);

  useEffect(() => {
    const el = visRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetchItems(base).then((result) => {
      if (result && result.data.length > 0) {
        setItems(result.data);
        offsetRef.current = result.data.length;
        setHasMore(result.hasMore);
      } else {
        setItems([]);
        setHasMore(false);
      }
    });
  }, [visible, base]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const sep = base.includes("?") ? "&" : "?";
    fetchItems(`${base}${sep}offset=${offsetRef.current}`).then((result) => {
      if (result && result.data.length > 0) {
        setItems((prev) => {
          const existing = new Set((prev || []).map((i) => i.id));
          return [...(prev || []), ...result.data.filter((i) => !existing.has(i.id))];
        });
        offsetRef.current += result.data.length;
        setHasMore(result.hasMore);
      } else { setHasMore(false); }
      setLoadingMore(false);
      loadingRef.current = false;
    });
  }, [base, hasMore]);

  if (items !== null && items.length === 0) return null;

  const displayed = mediaFilter && items
    ? mediaFilter === "anime"
      ? items.filter(isAnime)
      : items.filter((i) => i.type === mediaFilter)
    : items;
  if (mediaFilter && displayed && displayed.length === 0) return null;

  // Hide rows with too few items once loaded — looks broken otherwise
  if (displayed !== null && displayed.length > 0 && displayed.length < MIN_ROW_ITEMS) return null;

  return (
    <div ref={visRef}>
      <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}
        onLoadMore={hasMore ? handleLoadMore : undefined} loadingMore={loadingMore}>
        {displayed === null ? <SkeletonRow count={8} /> : displayed.map((item) => <Card key={item.id} item={item} />)}
      </ScrollRow>
    </div>
  );
});

// ── Taste DNA Bar ───────────────────────────────────────────────────────

interface TasteProfile {
  dark_vs_light: number;
  serious_vs_fun: number;
  slow_vs_fast: number;
  complex_vs_simple: number;
  realistic_vs_fantastical: number;
  violence_tolerance: number;
  emotional_intensity: number;
  world_building_preference: number;
  character_vs_plot: number;
  novelty_vs_familiar: number;
}

const TASTE_LABELS: Record<keyof TasteProfile, [string, string]> = {
  dark_vs_light: ["Dark & Intense", "Light & Uplifting"],
  serious_vs_fun: ["Serious Drama", "Fun & Lighthearted"],
  slow_vs_fast: ["Slow Burn", "Fast-Paced"],
  complex_vs_simple: ["Complex & Layered", "Straightforward"],
  realistic_vs_fantastical: ["Fantastical Worlds", "Grounded & Realistic"],
  violence_tolerance: ["Gritty & Intense", "Mild & Gentle"],
  emotional_intensity: ["Emotionally Rich", "Light Emotional Tone"],
  world_building_preference: ["Deep World-Building", "Focused Narratives"],
  character_vs_plot: ["Character-Driven", "Plot-Driven"],
  novelty_vs_familiar: ["Hidden Gems", "Popular Favorites"],
};

function getTasteTags(profile: TasteProfile): string[] {
  const entries = Object.entries(profile) as [keyof TasteProfile, number][];
  // Sort by how extreme (far from 0.5) each dimension is
  const ranked = entries
    .map(([key, val]) => ({ key, val, extremity: Math.abs(val - 0.5) }))
    .sort((a, b) => b.extremity - a.extremity);

  // Pick top 5 most extreme dimensions
  return ranked.slice(0, 5).map(({ key, val }) => {
    const [highLabel, lowLabel] = TASTE_LABELS[key];
    return val >= 0.5 ? highLabel : lowLabel;
  });
}

// ── Taste tag → Explore URL mapping ────────────────────────────────────
const TASTE_TAG_EXPLORE_MAP: Record<string, string> = {
  "Dark & Intense":        "/explore?vibe=dark",
  "Light & Uplifting":     "/explore?vibe=uplifting",
  "Serious Drama":         "/explore?genre=Drama",
  "Fun & Lighthearted":    "/explore?vibe=funny",
  "Slow Burn":             "/explore?vibe=slow-burn",
  "Fast-Paced":            "/explore?vibe=fast-paced",
  "Complex & Layered":     "/explore?vibe=cerebral",
  "Straightforward":       "/explore",
  "Fantastical Worlds":    "/explore?genre=Fantasy",
  "Grounded & Realistic":  "/explore",
  "Gritty & Intense":      "/explore?vibe=gritty",
  "Mild & Gentle":         "/explore?vibe=wholesome",
  "Emotionally Rich":      "/explore?vibe=emotional",
  "Light Emotional Tone":  "/explore?vibe=heartfelt",
  "Deep World-Building":   "/explore?vibe=immersive",
  "Focused Narratives":    "/explore",
  "Character-Driven":      "/explore",
  "Plot-Driven":           "/explore",
  "Hidden Gems":           "/explore?sort=hidden_gems",
  "Popular Favorites":     "/explore?sort=popular",
};

// Popular fallback genres when user has no ratings
const FALLBACK_GENRES = ["Drama", "Sci-Fi", "Fantasy", "Action", "Thriller", "Comedy", "Horror", "Mystery", "Romance", "Adventure"];

function TasteFilterBar({
  tasteProfile,
  topGenres,
  activeFilter,
  onFilterChange,
}: {
  tasteProfile: TasteProfile | null;
  topGenres: string[];
  activeFilter: FilterType | null;
  onFilterChange: (f: FilterType | null) => void;
}) {
  const { ratings } = useRatings();
  const { data: session } = useSession();
  const ratingCount = Object.keys(ratings).length;
  const tags = tasteProfile ? getTasteTags(tasteProfile) : [];
  const profileHref = session?.user?.id ? `/user/${session.user.id}` : "/library";

  // Genre pills: user's top genres, deduplicated against taste tags, fallback to popular
  const tasteTagGenreNames = new Set(tags.map((t) => t.toLowerCase()));
  const rawGenres = topGenres.length > 0 ? topGenres : FALLBACK_GENRES;
  const genrePills = rawGenres
    .filter((g) => !tasteTagGenreNames.has(g.toLowerCase()))
    .slice(0, 10);

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(232,72,85,0.03), rgba(155,93,229,0.015))",
      borderRadius: 10,
      padding: "12px 16px",
      marginBottom: 20,
    }}>
      {/* Main row — genre pills + media type filter grid (identity moved to TasteIdentityCard above) */}
      <div className="taste-filter-main" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        {/* Middle: Genre pills only. Taste/vibe tags are rendered in the
            TasteIdentityCard above to avoid duplication. */}
        <div className="taste-tags-section" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {genrePills.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "rgba(232,72,85,0.35)", fontWeight: 500, marginRight: 1, whiteSpace: "nowrap" }}>
                Genres
              </span>
              {genrePills.map((genre) => (
                <a
                  key={genre}
                  href={`/explore?genre=${encodeURIComponent(genre)}`}
                  className="taste-genre-pill"
                  style={{
                    fontSize: 11, padding: "3px 8px", borderRadius: 10,
                    background: "rgba(232,72,85,0.04)", border: "0.5px solid rgba(232,72,85,0.08)",
                    color: "rgba(232,72,85,0.35)", whiteSpace: "nowrap", cursor: "pointer",
                    textDecoration: "none", transition: "background 150ms, color 150ms",
                  }}
                >
                  {genre}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="taste-divider" style={{ width: "0.5px", alignSelf: "stretch", background: "rgba(255,255,255,0.06)", flexShrink: 0, margin: "0 4px" }} />

        {/* Right: Media type filter grid */}
        <div className="media-filter-grid-v2" style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, auto)",
          gap: 4,
          flexShrink: 0,
        }}>
          {MEDIA_FILTER_ORDER.map((type) => {
            const color = type === "anime" ? "#FF6B6B" : TYPES[type as MediaType].color;
            const isActive = activeFilter === type;
            return (
              <button
                key={type}
                onClick={() => onFilterChange(isActive ? null : type)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 2, padding: "5px 8px", borderRadius: 7, cursor: "pointer",
                  background: isActive ? `rgba(${hexToRgb(color)}, 0.22)` : `rgba(${hexToRgb(color)}, 0.08)`,
                  border: isActive ? `1px solid rgba(${hexToRgb(color)}, 0.5)` : `0.5px solid rgba(${hexToRgb(color)}, 0.18)`,
                  transition: "background 150ms, border 150ms",
                  minWidth: 46,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = `rgba(${hexToRgb(color)}, 0.14)`;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = `rgba(${hexToRgb(color)}, 0.08)`;
                }}
              >
                <span style={{ display: "block", lineHeight: 0, transform: "scale(0.8125)", transformOrigin: "center" }}>
                  {MEDIA_FILTER_ICONS[type](color)}
                </span>
                <span style={{ fontSize: 8, color, lineHeight: 1 }}>{MEDIA_FILTER_LABELS[type]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        .taste-tag-pill:hover {
          background: rgba(255,255,255,0.06) !important;
          color: rgba(255,255,255,0.5) !important;
        }
        .taste-genre-pill:hover {
          background: rgba(232,72,85,0.08) !important;
          color: rgba(232,72,85,0.5) !important;
        }
        @media (max-width: 768px) {
          .taste-filter-main {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .taste-tags-section {
            flex: none !important;
            width: 100% !important;
          }
          .media-filter-grid-v2 {
            width: 100% !important;
            grid-template-columns: repeat(5, 1fr) !important;
          }
          .taste-divider {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ForYouPage() {
  useScrollRestore();
  const [refreshKey, setRefreshKey] = useState(0);
  const [upcoming, setUpcoming] = useState<UpcomingItem[] | null>(null);
  const [returningSoon, setReturningSoon] = useState<ReturningSoonItem[]>([]);
  const [forYouData, setForYouData] = useState<{
    tasteProfile: TasteProfile | null;
    topGenres: string[];
    stats: {
      ratingCount: number;
      typesCount: number;
      avgScore: number;
      typeBreakdown: Record<string, number>;
      displayName: string;
      memberNumber: number | null;
      joinedAt: string | null;
      userId: string;
    } | null;
  } | null>(null);
  const [discoverItems, setDiscoverItems] = useState<Item[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType | null>(null);
  const { ratings } = useRatings();
  const ratingCount = Object.keys(ratings).length;

  // ── Cross-row deduplication ─────────────────────────────────────────
  // Track raw items returned by each catalog row so subsequent rows can exclude them
  const [pickedForYouItems, setPickedForYouItems] = useState<Item[]>([]);
  const [row3Items, setRow3Items] = useState<Item[]>([]);  // top_rated
  const [row4Items, setRow4Items] = useState<Item[]>([]);  // popular
  const [row5Items, setRow5Items] = useState<Item[]>([]);  // hidden_gems

  // ── Listen for refresh events from nav logo / For You tab ───────────
  useEffect(() => {
    function handleRefresh() {
      // Reset all state so rows remount cleanly with new random selections
      setUpcoming(null);
      setReturningSoon([]);
      setForYouData(null);
      setDiscoverItems([]);
      setPickedForYouItems([]);
      setRow3Items([]);
      setRow4Items([]);
      setRow5Items([]);
      setRefreshKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.addEventListener("literacy:refresh-foryou", handleRefresh);
    return () => window.removeEventListener("literacy:refresh-foryou", handleRefresh);
  }, []);

  // Rows 1-2 IDs — built from the paginated row callbacks (not the legacy fetch)
  const forYouIdSet = useMemo(() => {
    const ids = new Set<number>();
    pickedForYouItems.forEach((i) => ids.add(i.id));
    discoverItems.forEach((i) => ids.add(i.id));
    return ids;
  }, [pickedForYouItems, discoverItems]);

  // IDs to exclude from Discover Across Media (items already in Picked for you)
  const discoverExcludeIds = useMemo(() => new Set(pickedForYouItems.map((i) => i.id)), [pickedForYouItems]);

  // Each catalog row excludes all higher-priority rows
  const row3ExcludeIds = forYouIdSet;

  const row4ExcludeIds = useMemo(() => {
    const ids = new Set(forYouIdSet);
    row3Items.forEach((i) => ids.add(i.id));
    return ids;
  }, [forYouIdSet, row3Items]);

  const row5ExcludeIds = useMemo(() => {
    const ids = new Set(row4ExcludeIds);
    row4Items.forEach((i) => ids.add(i.id));
    return ids;
  }, [row4ExcludeIds, row4Items]);

  // Deep exclude for per-type lazy rows — all rows 1-5 combined
  const deepExcludeParam = useMemo(() => {
    const ids = new Set(row5ExcludeIds);
    row5Items.forEach((i) => ids.add(i.id));
    return ids.size > 0 ? `&exclude=${[...ids].join(",")}` : "";
  }, [row5ExcludeIds, row5Items]);

  useEffect(() => {
    fetch("/api/upcoming")
      .then((r) => r.json())
      .then((data) => {
        // New format: { upcoming: [...], returningSoon: [...] }
        if (data && Array.isArray(data.upcoming)) {
          setUpcoming(data.upcoming);
          setReturningSoon(data.returningSoon || []);
        } else if (Array.isArray(data)) {
          // Backwards compat: old format was just an array
          setUpcoming(data);
        } else {
          setUpcoming([]);
        }
      })
      .catch(() => setUpcoming([]));
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Lightweight profile endpoint — just tasteProfile + topGenres.
    // The heavy scoring pipeline now only runs via the ?section= paginated rows.
    fetch("/api/for-you/profile")
      .then((r) => r.json())
      .then((data) => setForYouData(data))
      .catch(() => setForYouData({ tasteProfile: null, topGenres: [], stats: null }));
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: sessionData, status: sessionStatus } = useSession();
  const authed = sessionStatus === "authenticated" && !!sessionData?.user;
  const tasteTagsForCard = forYouData?.tasteProfile ? getTasteTags(forYouData.tasteProfile) : [];

  return (
    <div className="content-width">
      {/* 1a. Taste identity card — personal stats up top */}
      <ErrorBoundary>
        <TasteIdentityCard
          stats={forYouData?.stats ?? null}
          tasteTags={tasteTagsForCard}
          authed={authed}
        />
      </ErrorBoundary>

      {/* 1b. Genre pills + media-type filter bar (only for authed users — there's nothing to filter by taste otherwise) */}
      {authed && (
        <ErrorBoundary>
          <TasteFilterBar
            tasteProfile={forYouData?.tasteProfile || null}
            topGenres={forYouData?.topGenres || []}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        </ErrorBoundary>
      )}

      {/* 3. Picked for you — editorial magazine-style grid (1 featured + 6 regular) */}
      {ratingCount >= 5 && (
        <ErrorBoundary>
          <PickedForYouGrid
            key={`picked-grid-${refreshKey}`}
            tasteTags={tasteTagsForCard}
            mediaFilter={activeFilter}
            onLoad={setPickedForYouItems}
            refreshKey={refreshKey}
          />
        </ErrorBoundary>
      )}

      {/* 4. Cross your shelf — editorial cross-media connections */}
      <ErrorBoundary>
        <CrossYourShelf key={`cross-${refreshKey}`} refreshKey={refreshKey} />
      </ErrorBoundary>

      {/* 5. What's happening — activity feed + trending sidebar */}
      <ErrorBoundary>
        <WhatsHappening key={`whats-${refreshKey}`} refreshKey={refreshKey} />
      </ErrorBoundary>

      {/* 3b. Discover across media — types user hasn't explored, now with infinite scroll */}
      {ratingCount >= 5 && (
        <ErrorBoundary>
          <PaginatedRow
            key={`discover-${refreshKey}`}
            fetchUrl="/api/for-you?section=discoverAcrossMedia&limit=30"
            label="Discover across media"
            sub="Your taste says you'd love these — in media you haven't tried yet"
            icon="🌐" iconBg="rgba(49,133,252,0.15)" seeAllHref="/explore"
            mediaFilter={activeFilter}
            clientExclude={discoverExcludeIds}
            onLoad={setDiscoverItems}
            alwaysShow
          />
        </ErrorBoundary>
      )}

      {/* 4. Universal curated rows — with cross-row deduplication */}
      <ErrorBoundary>
        <PaginatedRow
          key={`top-rated-${refreshKey}`}
          fetchUrl="/api/catalog?curated=top_rated&limit=30"
          label="Critically acclaimed"
          sub="Highest rated across all media"
          icon="⭐" iconBg="#D4AF3722" seeAllHref="/explore?sort=top_rated" delay={0}
          mediaFilter={activeFilter}
          clientExclude={row3ExcludeIds}
          onLoad={setRow3Items}
          lazy
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <PaginatedRow
          key={`popular-${refreshKey}`}
          fetchUrl="/api/catalog?curated=popular&limit=30"
          label="Popular right now"
          sub="Recent releases making waves"
          icon="🔥" iconBg="#E8485522" seeAllHref="/explore?sort=popular" delay={200}
          mediaFilter={activeFilter}
          clientExclude={row4ExcludeIds}
          onLoad={setRow4Items}
          lazy
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <PaginatedRow
          key={`hidden-gems-${refreshKey}`}
          fetchUrl="/api/catalog?curated=hidden_gems&limit=30"
          label="Hidden gems"
          sub="High scores, low radar"
          icon="💎" iconBg="#3185FC22" seeAllHref="/explore?sort=hidden_gems" delay={400}
          mediaFilter={activeFilter}
          clientExclude={row5ExcludeIds}
          onLoad={setRow5Items}
          lazy
        />
      </ErrorBoundary>

      {/* Per-type rows — use deepExcludeParam to server-side exclude all rows 1-5 */}
      <ErrorBoundary><LazyRow key={`anime-${refreshKey}`} fetchUrl={`/api/catalog?type=anime&forYou=1&limit=30${deepExcludeParam}`} label="Top anime" icon="🎌" iconBg="#FF6B6B22" seeAllHref="/explore?type=anime&sort=top_rated" mediaFilter={activeFilter} /></ErrorBoundary>
      <ErrorBoundary><LazyRow key={`movie-${refreshKey}`} fetchUrl={`/api/catalog?type=movie&forYou=1&limit=30${deepExcludeParam}`} label="Highest reviewed movies" icon="🎬" iconBg="#E8485522" seeAllHref="/explore?type=movie&sort=top_rated" mediaFilter={activeFilter} /></ErrorBoundary>
      <ErrorBoundary><LazyRow key={`game-${refreshKey}`} fetchUrl={`/api/catalog?type=game&forYou=1&limit=30${deepExcludeParam}`} label="Highest rated games" icon="🎮" iconBg="#2EC4B622" seeAllHref="/explore?type=game&sort=top_rated" mediaFilter={activeFilter} /></ErrorBoundary>
      <ErrorBoundary><LazyRow key={`manga-${refreshKey}`} fetchUrl={`/api/catalog?type=manga&forYou=1&limit=30${deepExcludeParam}`} label="Top manga" icon="🗾" iconBg="#FF6B6B22" seeAllHref="/explore?type=manga&sort=top_rated" mediaFilter={activeFilter} /></ErrorBoundary>
      <ErrorBoundary><LazyRow key={`book-${refreshKey}`} fetchUrl={`/api/catalog?type=book&forYou=1&limit=30${deepExcludeParam}`} label="Top books" icon="📖" iconBg="#3185FC22" seeAllHref="/explore?type=book&sort=top_rated" mediaFilter={activeFilter} /></ErrorBoundary>
      <ErrorBoundary><LazyRow key={`tv-${refreshKey}`} fetchUrl={`/api/catalog?type=tv&forYou=1&excludeAnime=1&limit=30${deepExcludeParam}`} label="Top shows" icon="📺" iconBg="#C45BAA22" seeAllHref="/explore?type=tv&sort=top_rated" mediaFilter={activeFilter} /></ErrorBoundary>
      <ErrorBoundary><LazyRow key={`music-${refreshKey}`} fetchUrl={`/api/catalog?type=music&forYou=1&limit=30${deepExcludeParam}`} label="Albums worth hearing" icon="🎵" iconBg="#9B5DE522" seeAllHref="/explore?type=music&sort=top_rated" mediaFilter={activeFilter} /></ErrorBoundary>
      <ErrorBoundary><LazyRow key={`comic-${refreshKey}`} fetchUrl={`/api/catalog?type=comic&forYou=1&limit=30${deepExcludeParam}`} label="Comics to pick up" icon="💥" iconBg="#F9A62022" seeAllHref="/explore?type=comic&sort=top_rated" mediaFilter={activeFilter} /></ErrorBoundary>
      <ErrorBoundary><LazyRow key={`podcast-${refreshKey}`} fetchUrl={`/api/catalog?type=podcast&forYou=1&limit=30${deepExcludeParam}`} label="Podcasts worth your time" icon="🎙️" iconBg="#00BBF922" seeAllHref="/explore?type=podcast&sort=top_rated" mediaFilter={activeFilter} /></ErrorBoundary>

      {/* Coming Soon — only truly unreleased titles */}
      {(() => {
        const filteredUpcoming = activeFilter && upcoming ? upcoming.filter(i => i.type === activeFilter) : upcoming;
        if (activeFilter && filteredUpcoming && filteredUpcoming.length === 0) return null;
        return (
          <ScrollRow
            label="Coming soon"
            sub={filteredUpcoming === null ? "" : `${filteredUpcoming.length} upcoming`}
            icon="📅" iconBg="rgba(155,93,229,0.15)"
          >
            {filteredUpcoming === null ? (
              <SkeletonRow count={8} />
            ) : filteredUpcoming.length >= 1 ? (
              filteredUpcoming.map((item) => (
                <UpcomingCard key={`upcoming-${item.id}`} item={item} />
              ))
            ) : (
              <div style={{ padding: "20px", color: "var(--text-faint)", fontSize: 12 }}>No upcoming releases</div>
            )}
          </ScrollRow>
        );
      })()}

      {/* Returning Soon — existing shows with upcoming new seasons */}
      {(() => {
        if (activeFilter && activeFilter !== "tv") return null;
        return returningSoon.length > 0 ? (
          <ScrollRow label="Returning soon" sub="New seasons of shows you know" icon="📺" iconBg="rgba(196,91,170,0.15)">
            {returningSoon.map((show) => (
              <ReturningSoonCard key={`returning-${show.id}`} show={show} />
            ))}
          </ScrollRow>
        ) : null;
      })()}

    </div>
  );
}

// ── Returning Soon Card ─────────────────────────────────────────────────

function ReturningSoonCard({ show }: { show: ReturningSoonItem }) {
  const airDate = new Date(show.airDate);
  const month = airDate.toLocaleString("en-US", { month: "short" });
  const day = airDate.getDate();

  return (
    <Link
      href={`/item/tmdb-tv-${show.id}`}
      style={{
        flex: "0 0 150px",
        width: 150,
        borderRadius: 8,
        overflow: "hidden",
        textDecoration: "none",
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
        border: "0.5px solid rgba(196,91,170,0.15)",
        scrollSnapAlign: "start",
        display: "block",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.35)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.2)";
      }}
    >
      {/* Cover */}
      <div style={{ height: 210, position: "relative", background: "#1a1a2e" }}>
        {show.cover && (
          <img
            src={show.cover}
            alt={show.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}

        {/* Season badge */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top, rgba(196,91,170,0.9), transparent)",
          padding: "18px 8px 6px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "1px" }}>
            Season {show.seasonNumber}
          </div>
        </div>

        {/* Date badge */}
        <div style={{
          position: "absolute",
          top: 6,
          right: 6,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
          color: "#f1c40f",
          fontSize: 8,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 6,
        }}>
          {month} {day}
        </div>
      </div>

      {/* Info */}
      <div style={{ background: "var(--bg-card)", padding: "6px 8px 5px" }}>
        <div style={{
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#fff",
          marginBottom: 2,
        }}>
          {show.title}
        </div>
        <div style={{ fontSize: 9, color: "#C45BAA" }}>
          Season {show.seasonNumber} — {month} {day}
        </div>
      </div>
    </Link>
  );
}
