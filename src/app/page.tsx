"use client";

import { useState, useEffect, useCallback, useRef, memo } from "react";
import { TYPES, TYPE_ORDER, type Item, type UpcomingItem } from "@/lib/data";
import Card from "@/components/card";
import UpcomingCard from "@/components/upcoming-card";
import ScrollRow from "@/components/scroll-row";
import { SkeletonRow } from "@/components/skeleton-card";

interface CatalogRow {
  key: string;
  label: string;
  sub: string;
  icon: string;
  iconBg: string;
  items: Item[];
}

/** Lazy row — only fetches data when scrolled near viewport */
const LazyRow = memo(function LazyRow({
  fetchUrl,
  label,
  sub,
  icon,
  iconBg,
}: {
  fetchUrl: string;
  label: string;
  sub: string;
  icon: string;
  iconBg: string;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, [visible, fetchUrl]);

  if (items !== null && items.length === 0) return null;

  return (
    <div ref={ref}>
      <ScrollRow label={label} sub={sub} icon={icon} iconBg={iconBg}>
        {items === null ? (
          <SkeletonRow count={6} />
        ) : (
          items.map((item) => <Card key={item.id} item={item} />)
        )}
      </ScrollRow>
    </div>
  );
});

export default function ForYouPage() {
  const [upcoming, setUpcoming] = useState<UpcomingItem[] | null>(null);

  useEffect(() => {
    fetch("/api/upcoming")
      .then((r) => r.json())
      .then((data) => setUpcoming(Array.isArray(data) ? data : []))
      .catch(() => setUpcoming([]));
  }, []);

  return (
    <div>
      {/* Welcome banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(232,72,85,0.08), rgba(49,133,252,0.08), rgba(46,196,182,0.08))",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: "30px 24px",
        marginBottom: 40,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📚 🎬 🎮 🎵</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 800, marginBottom: 6, color: "#fff" }}>
          Rate anything. Discover everything.
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
          Rate below and Literacy will find connections across media you&apos;d never expect.
        </div>
      </div>

      {/* Curated rows — each makes its own API call with DB-level sorting */}
      <LazyRow
        fetchUrl="/api/catalog?curated=top_rated&limit=20"
        label="Critically Acclaimed"
        sub="Highest rated across all media"
        icon="⭐"
        iconBg="#D4AF3722"
      />

      <LazyRow
        fetchUrl="/api/catalog?curated=popular&limit=20"
        label="Popular Right Now"
        sub="Recent releases making waves"
        icon="🔥"
        iconBg="#E8485522"
      />

      <LazyRow
        fetchUrl="/api/catalog?curated=hidden_gems&limit=20"
        label="Hidden Gems"
        sub="Highly rated but under the radar"
        icon="💎"
        iconBg="#3185FC22"
      />

      {/* Coming Soon */}
      <ScrollRow
        label="Coming Soon"
        sub={upcoming === null ? "" : `${upcoming.length} upcoming releases`}
        icon="🔥"
        iconBg="#E8485522"
      >
        {upcoming === null ? (
          <SkeletonRow count={6} />
        ) : upcoming.length > 0 ? (
          upcoming.map((item) => (
            <UpcomingCard key={`upcoming-${item.id}`} item={item} />
          ))
        ) : (
          <div style={{ padding: "40px 20px", color: "var(--text-faint)", fontSize: 13 }}>
            No upcoming releases found
          </div>
        )}
      </ScrollRow>

      {/* Section label */}
      <div style={{
        fontSize: 10,
        color: "rgba(255,255,255,0.2)",
        textTransform: "uppercase",
        letterSpacing: 2,
        fontWeight: 600,
        marginBottom: 28,
      }}>
        Browse by media
      </div>

      {/* Per-type rows — each lazy loads independently */}
      {TYPE_ORDER.map((type) => {
        const meta = TYPES[type];
        return (
          <LazyRow
            key={type}
            fetchUrl={`/api/catalog?type=${type}&limit=20`}
            label={meta.label}
            sub=""
            icon={meta.icon}
            iconBg={meta.color + "22"}
          />
        );
      })}
    </div>
  );
}
