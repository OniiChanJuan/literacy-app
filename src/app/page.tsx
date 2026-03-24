"use client";

import { useState, useEffect, useRef, memo, useCallback } from "react";
import { TYPES, type Item, type UpcomingItem } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import Card from "@/components/card";
import UpcomingCard from "@/components/upcoming-card";
import ScrollRow from "@/components/scroll-row";
import { SkeletonRow } from "@/components/skeleton-card";

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

/** Eager fetch row */
function EagerRow({ fetchUrl, label, sub, icon, iconBg, seeAllHref, delay = 0 }: {
  fetchUrl: string; label: string; sub?: string; icon?: string; iconBg?: string; seeAllHref?: string; delay?: number;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);

  const doFetch = useCallback(() => {
    setFailed(false);
    setItems(null);
    const timer = setTimeout(() => {
      fetchItems(fetchUrl).then((data) => {
        if (data && data.length > 0) setItems(data);
        else if (data) setItems([]); // empty = no items for this type
        else setFailed(true);
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [fetchUrl, delay]);

  useEffect(() => {
    return doFetch();
  }, [doFetch]);

  // Show skeleton while loading
  if (items === null && !failed) {
    return (
      <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}>
        <SkeletonRow count={8} />
      </ScrollRow>
    );
  }

  // Show retry on failure
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

  // Hide row only if genuinely empty (0 items for this category)
  if (!items || items.length === 0) return null;

  return (
    <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}>
      {items.map((item) => <Card key={item.id} item={item} />)}
    </ScrollRow>
  );
}

/** Lazy fetch row */
const LazyRow = memo(function LazyRow({ fetchUrl, label, sub, icon, iconBg, seeAllHref }: {
  fetchUrl: string; label: string; sub?: string; icon?: string; iconBg?: string; seeAllHref?: string;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
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
    fetchItems(fetchUrl).then((data) => {
      if (data && data.length >= 4) setItems(data);
      else setItems([]);
    });
  }, [visible, fetchUrl]);

  if (items !== null && items.length < 4) return null;

  return (
    <div ref={ref}>
      <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg} seeAllHref={seeAllHref}>
        {items === null ? <SkeletonRow count={8} /> : items.map((item) => <Card key={item.id} item={item} />)}
      </ScrollRow>
    </div>
  );
});

// ── Taste DNA Bar ───────────────────────────────────────────────────────

function TasteDnaBar() {
  const { ratings } = useRatings();
  const ratingCount = Object.keys(ratings).length;

  if (ratingCount < 3) return null;

  // Get top genres/vibes from rated items (we'd need item data for this — use a placeholder approach)
  const topTags = ["Sci-Fi", "Dark", "Epic", "Atmospheric", "Thriller"];

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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
        {topTags.map((tag) => (
          <span key={tag} style={{
            fontSize: 9,
            padding: "3px 8px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.5)",
          }}>
            {tag}
          </span>
        ))}
      </div>
      <a href="/library" style={{ fontSize: 10, color: "#E84855", textDecoration: "none" }}>
        View profile →
      </a>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function ForYouPage() {
  const [upcoming, setUpcoming] = useState<UpcomingItem[] | null>(null);
  const { ratings } = useRatings();
  const ratingCount = Object.keys(ratings).length;

  useEffect(() => {
    fetch("/api/upcoming")
      .then((r) => r.json())
      .then((data) => setUpcoming(Array.isArray(data) ? data : []))
      .catch(() => setUpcoming([]));
  }, []);

  // Get user's highest rated item for personalized row
  const highestRatedId = ratingCount > 0
    ? parseInt(Object.entries(ratings).sort(([, a], [, b]) => b - a)[0][0])
    : null;

  return (
    <div>
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

      {/* 2. Taste DNA bar */}
      <TasteDnaBar />

      {/* 3. Personalized rows (only with 5+ ratings) */}
      {ratingCount >= 5 && highestRatedId && (
        <EagerRow
          fetchUrl={`/api/catalog?limit=12`}
          label="Because you rated highly"
          sub="Items matching your top-rated genres and vibes"
          icon="✨"
          iconBg="rgba(232,72,85,0.15)"
        />
      )}

      {/* 4. Universal rows */}
      <EagerRow
        fetchUrl="/api/catalog?curated=top_rated&limit=12"
        label="Critically acclaimed"
        sub="Highest rated across all media"
        icon="⭐"
        iconBg="#D4AF3722"
        seeAllHref="/explore"
        delay={0}
      />

      <EagerRow
        fetchUrl="/api/catalog?curated=popular&limit=12"
        label="Popular right now"
        sub="Recent releases making waves"
        icon="🔥"
        iconBg="#E8485522"
        seeAllHref="/explore"
        delay={300}
      />

      <EagerRow
        fetchUrl="/api/catalog?curated=hidden_gems&limit=12"
        label="Hidden gems"
        sub="High scores, low radar"
        icon="💎"
        iconBg="#3185FC22"
        seeAllHref="/explore"
        delay={600}
      />

      {/* Per-type rows */}
      <LazyRow
        fetchUrl="/api/catalog?type=movie&limit=12"
        label="Highest reviewed movies"
        icon="🎬"
        iconBg="#E8485522"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=game&limit=12"
        label="Most discussed games"
        icon="🎮"
        iconBg="#2EC4B622"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=manga&limit=12"
        label="Top manga"
        icon="🗾"
        iconBg="#FF6B6B22"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=book&limit=12"
        label="The community is reading"
        icon="📖"
        iconBg="#3185FC22"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=tv&limit=12"
        label="Top shows"
        icon="📺"
        iconBg="#C45BAA22"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=music&limit=12"
        label="Albums worth hearing"
        icon="🎵"
        iconBg="#9B5DE522"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=comic&limit=12"
        label="Comics to pick up"
        icon="💥"
        iconBg="#F9A62022"
        seeAllHref="/explore"
      />

      <LazyRow
        fetchUrl="/api/catalog?type=podcast&limit=12"
        label="Podcasts worth your time"
        icon="🎙️"
        iconBg="#00BBF922"
        seeAllHref="/explore"
      />

      {/* Coming Soon */}
      <ScrollRow
        label="Coming soon"
        sub={upcoming === null ? "" : `${upcoming.length} upcoming`}
        icon="📅"
        iconBg="rgba(155,93,229,0.15)"
      >
        {upcoming === null ? (
          <SkeletonRow count={8} />
        ) : upcoming.length >= 4 ? (
          upcoming.map((item) => (
            <UpcomingCard key={`upcoming-${item.id}`} item={item} />
          ))
        ) : (
          <div style={{ padding: "20px", color: "var(--text-faint)", fontSize: 12 }}>
            No upcoming releases
          </div>
        )}
      </ScrollRow>
    </div>
  );
}
