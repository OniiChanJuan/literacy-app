"use client";

import { useState, useEffect, useRef, memo, useCallback } from "react";
import { TYPES, type Item, type UpcomingItem, type MediaType } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import { useScrollRestore } from "@/lib/use-scroll-restore";
import Card from "@/components/card";
import UpcomingCard from "@/components/upcoming-card";
import ScrollRow from "@/components/scroll-row";
import { SkeletonRow } from "@/components/skeleton-card";
import Link from "next/link";
import Image from "next/image";

// ── Media Type Filter SVG Icons ──────────────────────────────────────────
const MEDIA_FILTER_ICONS: Record<MediaType, (color: string) => React.ReactNode> = {
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
};

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

const MEDIA_FILTER_ORDER: MediaType[] = ["movie", "tv", "book", "manga", "game", "music", "comic", "podcast"];
const MEDIA_FILTER_LABELS: Record<MediaType, string> = {
  movie: "Movies", tv: "TV", book: "Books", manga: "Manga",
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

async function fetchItems(url: string, retries = 2): Promise<Item[] | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
        return null;
      }
      const data = await res.json();
      return Array.isArray(data) ? data : null;
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

function PaginatedRow({ fetchUrl, label, sub, icon, iconBg, seeAllHref, delay = 0, mediaFilter }: {
  fetchUrl: string; label: string; sub?: string; icon?: string; iconBg?: string; seeAllHref?: string; delay?: number; mediaFilter?: MediaType | null;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const { base, limit } = getBaseUrl(fetchUrl);

  const doFetch = useCallback(() => {
    setFailed(false);
    setItems(null);
    offsetRef.current = 0;
    setHasMore(true);
    const timer = setTimeout(() => {
      fetchItems(base).then((data) => {
        if (data && data.length > 0) {
          setItems(data);
          offsetRef.current = data.length;
          setHasMore(data.length >= limit);
        } else if (data) {
          setItems([]);
        } else {
          setFailed(true);
        }
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [base, limit, delay]);

  useEffect(() => { return doFetch(); }, [doFetch]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const sep = base.includes("?") ? "&" : "?";
    fetchItems(`${base}${sep}offset=${offsetRef.current}`).then((data) => {
      if (data && data.length > 0) {
        setItems((prev) => {
          const existing = new Set((prev || []).map((i) => i.id));
          return [...(prev || []), ...data.filter((i) => !existing.has(i.id))];
        });
        offsetRef.current += data.length;
        setHasMore(data.length >= limit);
      } else { setHasMore(false); }
      setLoadingMore(false);
      loadingRef.current = false;
    });
  }, [base, limit, hasMore]);

  if (items === null && !failed) {
    return <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}><SkeletonRow count={8} /></ScrollRow>;
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

  const displayed = mediaFilter ? items.filter((i) => i.type === mediaFilter) : items;
  if (mediaFilter && displayed.length === 0) return null;

  return (
    <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}
      onLoadMore={hasMore ? handleLoadMore : undefined} loadingMore={loadingMore}>
      {displayed.map((item) => <Card key={item.id} item={item} />)}
    </ScrollRow>
  );
}

// ── Lazy Row (loads on scroll into view) ────────────────────────────────

const LazyRow = memo(function LazyRow({ fetchUrl, label, sub, icon, iconBg, seeAllHref, mediaFilter }: {
  fetchUrl: string; label: string; sub?: string; icon?: string; iconBg?: string; seeAllHref?: string; mediaFilter?: MediaType | null;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [visible, setVisible] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const visRef = useRef<HTMLDivElement>(null);
  const { base, limit } = getBaseUrl(fetchUrl);

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
    fetchItems(base).then((data) => {
      if (data && data.length > 0) {
        setItems(data);
        offsetRef.current = data.length;
        setHasMore(data.length >= limit);
      } else { setItems([]); }
    });
  }, [visible, base, limit]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const sep = base.includes("?") ? "&" : "?";
    fetchItems(`${base}${sep}offset=${offsetRef.current}`).then((data) => {
      if (data && data.length > 0) {
        setItems((prev) => {
          const existing = new Set((prev || []).map((i) => i.id));
          return [...(prev || []), ...data.filter((i) => !existing.has(i.id))];
        });
        offsetRef.current += data.length;
        setHasMore(data.length >= limit);
      } else { setHasMore(false); }
      setLoadingMore(false);
      loadingRef.current = false;
    });
  }, [base, limit, hasMore]);

  if (items !== null && items.length === 0) return null;

  const displayed = mediaFilter && items ? items.filter((i) => i.type === mediaFilter) : items;
  if (mediaFilter && displayed && displayed.length === 0) return null;

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

function TasteDnaBar({ tasteProfile }: { tasteProfile: TasteProfile | null }) {
  const { ratings } = useRatings();
  const ratingCount = Object.keys(ratings).length;
  if (ratingCount < 3) return null;

  const tags = tasteProfile ? getTasteTags(tasteProfile) : [];

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "0.5px solid rgba(255,255,255,0.06)",
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 18,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>Your taste</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{ratingCount} rated</span>
      </div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {tags.map((tag) => (
            <span key={tag} style={{
              fontSize: 9, padding: "3px 8px", borderRadius: 8,
              background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)",
            }}>{tag}</span>
          ))}
        </div>
      )}
      <a href="/library" style={{ fontSize: 10, color: "#E84855", textDecoration: "none" }}>View profile →</a>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ForYouPage() {
  useScrollRestore();
  const [upcoming, setUpcoming] = useState<UpcomingItem[] | null>(null);
  const [returningSoon, setReturningSoon] = useState<ReturningSoonItem[]>([]);
  const [forYouData, setForYouData] = useState<{
    personalPicks: Item[];
    discoverAcrossMedia: Item[];
    tasteProfile: TasteProfile | null;
  } | null>(null);
  const [activeFilter, setActiveFilter] = useState<MediaType | null>(null);
  const { ratings } = useRatings();
  const ratingCount = Object.keys(ratings).length;

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
  }, []);

  useEffect(() => {
    fetch("/api/for-you")
      .then((r) => r.json())
      .then((data) => setForYouData(data))
      .catch(() => setForYouData({ personalPicks: [], discoverAcrossMedia: [], tasteProfile: null }));
  }, []);

  return (
    <div className="content-width">
      {/* 1. Compact banner with media type filters */}
      <div className="compact-banner" style={{
        background: "linear-gradient(135deg, rgba(232,72,85,0.06), rgba(155,93,229,0.03))",
        borderBottom: "0.5px solid rgba(255,255,255,0.04)",
        padding: "14px 20px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        borderRadius: 12,
      }}>
        {/* Left: tagline */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 500, color: "#fff" }}>
            Rate anything. Discover everything.
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
            Your taste shapes recommendations across every medium
          </div>
        </div>

        {/* Right: media type filter buttons (desktop grid) */}
        <div className="media-filter-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 56px)",
          gap: 6,
        }}>
          {MEDIA_FILTER_ORDER.map((type) => {
            const color = TYPES[type].color;
            const isActive = activeFilter === type;
            return (
              <button
                key={type}
                onClick={() => setActiveFilter(isActive ? null : type)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  height: 48,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: isActive ? `rgba(${hexToRgb(color)}, 0.2)` : `rgba(${hexToRgb(color)}, 0.08)`,
                  border: isActive ? `1px solid rgba(${hexToRgb(color)}, 0.5)` : `0.5px solid rgba(${hexToRgb(color)}, 0.2)`,
                  transition: "background 150ms ease",
                  padding: 0,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = `rgba(${hexToRgb(color)}, 0.12)`;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = `rgba(${hexToRgb(color)}, 0.08)`;
                }}
              >
                {MEDIA_FILTER_ICONS[type](color)}
                <span style={{ fontSize: 9, color, lineHeight: 1 }}>{MEDIA_FILTER_LABELS[type]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Responsive styles for filter grid */}
      <style>{`
        @media (max-width: 768px) {
          .compact-banner {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .media-filter-grid {
            grid-template-columns: repeat(4, 1fr) !important;
            width: 100% !important;
          }
          .media-filter-grid button {
            height: 42px !important;
          }
          .media-filter-grid svg {
            width: 14px !important;
            height: 14px !important;
          }
        }
      `}</style>

      {/* 2. Taste DNA bar (3+ ratings) */}
      <TasteDnaBar tasteProfile={forYouData?.tasteProfile || null} />

      {/* 3. Personalized rows (5+ ratings) — taste-matched */}
      {forYouData && forYouData.personalPicks.length > 0 && (() => {
        const filtered = activeFilter ? forYouData.personalPicks.filter(i => i.type === activeFilter) : forYouData.personalPicks;
        return filtered.length > 0 ? (
          <ScrollRow label="Picked for you" sub="Matched to your taste profile across all media" icon="✨" iconBg="rgba(232,72,85,0.15)">
            {filtered.map((item) => <Card key={item.id} item={item} />)}
          </ScrollRow>
        ) : null;
      })()}

      {/* 3b. Discover across media — types user hasn't explored */}
      {forYouData && forYouData.discoverAcrossMedia.length > 0 && (() => {
        const filtered = activeFilter ? forYouData.discoverAcrossMedia.filter(i => i.type === activeFilter) : forYouData.discoverAcrossMedia;
        return filtered.length > 0 ? (
          <ScrollRow label="Discover across media" sub="Your taste says you'd love these — in media you haven't tried yet" icon="🌐" iconBg="rgba(49,133,252,0.15)">
            {filtered.map((item) => <Card key={item.id} item={item} />)}
          </ScrollRow>
        ) : null;
      })()}

      {/* 4. Universal curated rows */}
      <PaginatedRow
        fetchUrl="/api/catalog?curated=top_rated&limit=20"
        label="Critically acclaimed"
        sub="Highest rated across all media"
        icon="⭐" iconBg="#D4AF3722" seeAllHref="/explore" delay={0}
        mediaFilter={activeFilter}
      />

      <PaginatedRow
        fetchUrl="/api/catalog?curated=popular&limit=20"
        label="Popular right now"
        sub="Recent releases making waves"
        icon="🔥" iconBg="#E8485522" seeAllHref="/explore" delay={200}
        mediaFilter={activeFilter}
      />

      <PaginatedRow
        fetchUrl="/api/catalog?curated=hidden_gems&limit=20"
        label="Hidden gems"
        sub="High scores, low radar"
        icon="💎" iconBg="#3185FC22" seeAllHref="/explore" delay={400}
        mediaFilter={activeFilter}
      />

      {/* Per-editorial-label rows — these are the curated "best of" per type */}
      <LazyRow fetchUrl="/api/catalog?type=movie&limit=20" label="Highest reviewed movies" icon="🎬" iconBg="#E8485522" seeAllHref="/explore" mediaFilter={activeFilter} />
      <LazyRow fetchUrl="/api/catalog?type=game&limit=20" label="Most discussed games" icon="🎮" iconBg="#2EC4B622" seeAllHref="/explore" mediaFilter={activeFilter} />
      <LazyRow fetchUrl="/api/catalog?type=manga&limit=20" label="Top manga" icon="🗾" iconBg="#FF6B6B22" seeAllHref="/explore" mediaFilter={activeFilter} />
      <LazyRow fetchUrl="/api/catalog?type=book&limit=20" label="The community is reading" icon="📖" iconBg="#3185FC22" seeAllHref="/explore" mediaFilter={activeFilter} />
      <LazyRow fetchUrl="/api/catalog?type=tv&limit=20" label="Top shows" icon="📺" iconBg="#C45BAA22" seeAllHref="/explore" mediaFilter={activeFilter} />
      <LazyRow fetchUrl="/api/catalog?type=music&limit=20" label="Albums worth hearing" icon="🎵" iconBg="#9B5DE522" seeAllHref="/explore" mediaFilter={activeFilter} />
      <LazyRow fetchUrl="/api/catalog?type=comic&limit=20" label="Comics to pick up" icon="💥" iconBg="#F9A62022" seeAllHref="/explore" mediaFilter={activeFilter} />
      <LazyRow fetchUrl="/api/catalog?type=podcast&limit=20" label="Podcasts worth your time" icon="🎙️" iconBg="#00BBF922" seeAllHref="/explore" mediaFilter={activeFilter} />

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

      {/* Empty state when filter yields no results across all rows */}
      {activeFilter && forYouData && upcoming !== null && (() => {
        const hasPersonal = forYouData.personalPicks.some(i => i.type === activeFilter);
        const hasDiscover = forYouData.discoverAcrossMedia.some(i => i.type === activeFilter);
        // If we have personalized items or the curated rows will handle it, don't show empty state
        if (hasPersonal || hasDiscover) return null;
        return null; // PaginatedRow/LazyRow handle their own visibility
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
