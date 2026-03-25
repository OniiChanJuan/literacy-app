"use client";

import { useState, useEffect, useRef, memo, useCallback } from "react";
import { TYPES, type Item, type UpcomingItem } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import { useScrollRestore } from "@/lib/use-scroll-restore";
import Card from "@/components/card";
import UpcomingCard from "@/components/upcoming-card";
import ScrollRow from "@/components/scroll-row";
import { SkeletonRow } from "@/components/skeleton-card";
import Link from "next/link";
import Image from "next/image";

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

function PaginatedRow({ fetchUrl, label, sub, icon, iconBg, seeAllHref, delay = 0 }: {
  fetchUrl: string; label: string; sub?: string; icon?: string; iconBg?: string; seeAllHref?: string; delay?: number;
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

  return (
    <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}
      onLoadMore={hasMore ? handleLoadMore : undefined} loadingMore={loadingMore}>
      {items.map((item) => <Card key={item.id} item={item} />)}
    </ScrollRow>
  );
}

// ── Lazy Row (loads on scroll into view) ────────────────────────────────

const LazyRow = memo(function LazyRow({ fetchUrl, label, sub, icon, iconBg, seeAllHref }: {
  fetchUrl: string; label: string; sub?: string; icon?: string; iconBg?: string; seeAllHref?: string;
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

  return (
    <div ref={visRef}>
      <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}
        onLoadMore={hasMore ? handleLoadMore : undefined} loadingMore={loadingMore}>
        {items === null ? <SkeletonRow count={8} /> : items.map((item) => <Card key={item.id} item={item} />)}
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
      {/* 1. Welcome banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(232,72,85,0.08), rgba(49,133,252,0.08), rgba(46,196,182,0.08))",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: "28px 24px",
        marginBottom: 20,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📚 🎬 🎮 🎵</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 800, marginBottom: 5, color: "#fff" }}>
          Rate anything. Discover everything.
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", maxWidth: 380, margin: "0 auto", lineHeight: 1.5 }}>
          Rate below and Literacy will find connections across media you&apos;d never expect.
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
          Your taste shapes your recommendations across every medium
        </div>
      </div>

      {/* 2. Taste DNA bar (3+ ratings) */}
      <TasteDnaBar tasteProfile={forYouData?.tasteProfile || null} />

      {/* 3. Personalized rows (5+ ratings) — taste-matched */}
      {forYouData && forYouData.personalPicks.length > 0 && (
        <ScrollRow
          label="Picked for you"
          sub="Matched to your taste profile across all media"
          icon="✨"
          iconBg="rgba(232,72,85,0.15)"
        >
          {forYouData.personalPicks.map((item) => <Card key={item.id} item={item} />)}
        </ScrollRow>
      )}

      {/* 3b. Discover across media — types user hasn't explored */}
      {forYouData && forYouData.discoverAcrossMedia.length > 0 && (
        <ScrollRow
          label="Discover across media"
          sub="Your taste says you'd love these — in media you haven't tried yet"
          icon="🌐"
          iconBg="rgba(49,133,252,0.15)"
        >
          {forYouData.discoverAcrossMedia.map((item) => <Card key={item.id} item={item} />)}
        </ScrollRow>
      )}

      {/* 4. Universal curated rows */}
      <PaginatedRow
        fetchUrl="/api/catalog?curated=top_rated&limit=20"
        label="Critically acclaimed"
        sub="Highest rated across all media"
        icon="⭐"
        iconBg="#D4AF3722"
        seeAllHref="/explore"
        delay={0}
      />

      <PaginatedRow
        fetchUrl="/api/catalog?curated=popular&limit=20"
        label="Popular right now"
        sub="Recent releases making waves"
        icon="🔥"
        iconBg="#E8485522"
        seeAllHref="/explore"
        delay={200}
      />

      <PaginatedRow
        fetchUrl="/api/catalog?curated=hidden_gems&limit=20"
        label="Hidden gems"
        sub="High scores, low radar"
        icon="💎"
        iconBg="#3185FC22"
        seeAllHref="/explore"
        delay={400}
      />

      {/* Per-editorial-label rows — these are the curated "best of" per type */}
      <LazyRow
        fetchUrl="/api/catalog?type=movie&limit=20"
        label="Highest reviewed movies"
        icon="🎬"
        iconBg="#E8485522"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=game&limit=20"
        label="Most discussed games"
        icon="🎮"
        iconBg="#2EC4B622"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=manga&limit=20"
        label="Top manga"
        icon="🗾"
        iconBg="#FF6B6B22"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=book&limit=20"
        label="The community is reading"
        icon="📖"
        iconBg="#3185FC22"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=tv&limit=20"
        label="Top shows"
        icon="📺"
        iconBg="#C45BAA22"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=music&limit=20"
        label="Albums worth hearing"
        icon="🎵"
        iconBg="#9B5DE522"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=comic&limit=20"
        label="Comics to pick up"
        icon="💥"
        iconBg="#F9A62022"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=podcast&limit=20"
        label="Podcasts worth your time"
        icon="🎙️"
        iconBg="#00BBF922"
        seeAllHref="/explore"
      />

      {/* Coming Soon — only truly unreleased titles */}
      <ScrollRow
        label="Coming soon"
        sub={upcoming === null ? "" : `${upcoming.length} upcoming`}
        icon="📅"
        iconBg="rgba(155,93,229,0.15)"
      >
        {upcoming === null ? (
          <SkeletonRow count={8} />
        ) : upcoming.length >= 1 ? (
          upcoming.map((item) => (
            <UpcomingCard key={`upcoming-${item.id}`} item={item} />
          ))
        ) : (
          <div style={{ padding: "20px", color: "var(--text-faint)", fontSize: 12 }}>
            No upcoming releases
          </div>
        )}
      </ScrollRow>

      {/* Returning Soon — existing shows with upcoming new seasons */}
      {returningSoon.length > 0 && (
        <ScrollRow
          label="Returning soon"
          sub="New seasons of shows you know"
          icon="📺"
          iconBg="rgba(196,91,170,0.15)"
        >
          {returningSoon.map((show) => (
            <ReturningSoonCard key={`returning-${show.id}`} show={show} />
          ))}
        </ScrollRow>
      )}
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
