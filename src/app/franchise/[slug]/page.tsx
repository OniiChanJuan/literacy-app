"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { ALL_ITEMS, TYPES, VIBES, type Item, type MediaType } from "@/lib/data";
import { getFranchise, getFranchiseTypes, type Franchise, type FranchiseItem } from "@/lib/franchises";
import { parseTmdbId } from "@/lib/tmdb";
import BackButton from "@/components/back-button";
import RatingPanel from "@/components/rating-panel";
import { AggregateScorePanel } from "@/components/aggregate-score";
import CommunityReviews from "@/components/community-reviews";
import StatusTracker from "@/components/status-tracker";
import ExternalScores from "@/components/external-scores";
import WatchProviders from "@/components/watch-providers";
import PlatformButtons from "@/components/platform-buttons";

function isImageUrl(cover: string): boolean {
  return cover.startsWith("http");
}

export default function FranchisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const franchise = getFranchise(slug);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [activeType, setActiveType] = useState<MediaType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!franchise) { setLoading(false); return; }

    // Fetch all items in parallel
    const fetches = franchise.items.map(async (fi) => {
      // Try local first
      const localId = parseInt(fi.routeId);
      if (!isNaN(localId)) {
        const local = ALL_ITEMS.find((i) => i.id === localId);
        if (local) return { routeId: fi.routeId, item: local };
      }

      // Fetch from API
      let apiUrl = "";
      if (fi.routeId.startsWith("tmdb-")) {
        const parts = fi.routeId.match(/^tmdb-(movie|tv)-(\d+)$/);
        if (parts) apiUrl = `/api/tmdb/${parts[1]}/${parts[2]}`;
      } else if (fi.routeId.startsWith("jikan-")) {
        const parts = fi.routeId.match(/^jikan-(manga|anime)-(\d+)$/);
        if (parts) apiUrl = `/api/jikan/${parts[1]}/${parts[2]}`;
      } else if (fi.routeId.startsWith("igdb-")) {
        const parts = fi.routeId.match(/^igdb-game-(\d+)$/);
        if (parts) apiUrl = `/api/igdb/${parts[1]}`;
      }

      if (!apiUrl) return null;

      try {
        const res = await fetch(apiUrl);
        if (!res.ok) return null;
        const item = await res.json();
        return { routeId: fi.routeId, item };
      } catch {
        return null;
      }
    });

    Promise.all(fetches).then((results) => {
      const map: Record<string, Item> = {};
      for (const r of results) {
        if (r) map[r.routeId] = r.item;
      }
      setItems(map);

      // Set initial active type to first available
      if (franchise) {
        const types = getFranchiseTypes(franchise);
        setActiveType(types[0] || null);
      }
      setLoading(false);
    });
  }, [franchise, slug]);

  if (!franchise) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px" }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🔍</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
          Franchise not found
        </div>
        <Link href="/" style={{ color: "#3185FC", fontSize: 13, textDecoration: "none" }}>
          Back to home
        </Link>
      </div>
    );
  }

  const types = getFranchiseTypes(franchise);
  const activeItems = franchise.items.filter((fi) => fi.type === activeType);

  return (
    <div>
      <BackButton />

      {/* Hero banner */}
      <div style={{
        background: franchise.cover,
        borderRadius: 20,
        padding: "56px 36px 40px",
        marginBottom: 0,
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
      }}>
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(11,11,16,0.85) 0%, rgba(11,11,16,0.2) 60%, transparent 100%)",
          borderRadius: 20,
        }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{franchise.icon}</div>
          <h1 style={{
            fontFamily: "var(--font-serif)",
            fontSize: 42,
            fontWeight: 900,
            lineHeight: 1.1,
            color: "#fff",
            marginBottom: 10,
          }}>
            {franchise.name}
          </h1>
          <p style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            maxWidth: 500,
            margin: "0 auto",
            lineHeight: 1.6,
          }}>
            {franchise.description}
          </p>
        </div>
      </div>

      {/* Color accent line */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, transparent, ${franchise.color}, transparent)`,
        marginBottom: 28,
        borderRadius: 2,
      }} />

      {/* Media type tabs */}
      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 32,
        borderBottom: "1px solid var(--border)",
      }}>
        {types.map((type) => {
          const t = TYPES[type];
          const active = activeType === type;
          const count = franchise.items.filter((fi) => fi.type === type).length;
          return (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "12px 20px",
                background: "none",
                border: "none",
                borderBottom: active ? `2.5px solid ${franchise.color}` : "2.5px solid transparent",
                color: active ? "#fff" : "var(--text-muted)",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s",
                marginBottom: -1,
              }}
            >
              <span>{t.icon}</span>
              {t.label}
              {count > 1 && (
                <span style={{
                  fontSize: 10,
                  background: active ? `${franchise.color}33` : "rgba(255,255,255,0.06)",
                  padding: "1px 6px",
                  borderRadius: 8,
                  color: active ? franchise.color : "var(--text-faint)",
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-faint)", fontSize: 13 }}>
          Loading franchise items...
        </div>
      )}

      {/* Tab content — one section per item of the active type */}
      {!loading && activeItems.map((fi) => {
        const item = items[fi.routeId];
        if (!item) return (
          <div key={fi.routeId} style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--text-faint)",
            fontSize: 13,
            background: `${franchise.color}08`,
            borderRadius: 16,
            border: `1px solid ${franchise.color}15`,
            marginBottom: 24,
          }}>
            Could not load {fi.title}
          </div>
        );

        return (
          <FranchiseItemView
            key={fi.routeId}
            item={item}
            fi={fi}
            franchise={franchise}
          />
        );
      })}
    </div>
  );
}

function FranchiseItemView({ item, fi, franchise }: {
  item: Item;
  fi: FranchiseItem;
  franchise: Franchise;
}) {
  const hasImage = isImageUrl(item.cover);
  const t = TYPES[item.type];
  const tmdbParsed = parseTmdbId(fi.routeId);

  return (
    <div style={{
      marginBottom: 40,
      background: `${franchise.color}06`,
      border: `1px solid ${franchise.color}15`,
      borderRadius: 20,
      padding: 28,
    }}>
      {/* Item header with cover + title */}
      <div style={{ display: "flex", gap: 24, marginBottom: 28 }}>
        {/* Cover */}
        {hasImage ? (
          <img
            src={item.cover}
            alt={item.title}
            style={{
              width: 120,
              height: 180,
              objectFit: "cover",
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: 120,
            height: 180,
            borderRadius: 12,
            background: item.cover || `${franchise.color}22`,
            flexShrink: 0,
          }} />
        )}

        {/* Title + meta */}
        <div style={{ flex: 1 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: t.color,
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 6,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 10,
          }}>
            {t.icon} {t.label.replace(/s$/, "")}
          </div>

          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontSize: 26,
            fontWeight: 800,
            color: "#fff",
            margin: "0 0 8px",
            lineHeight: 1.2,
          }}>
            {fi.title}
          </h2>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {item.year > 0 && (
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{item.year}</span>
            )}
            {item.genre.slice(0, 3).map((g) => (
              <span key={g} style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                background: "var(--surface-4)",
                padding: "2px 8px",
                borderRadius: 5,
              }}>
                {g}
              </span>
            ))}
          </div>

          {/* Link to standalone page */}
          <Link
            href={`/item/${fi.routeId}`}
            style={{
              fontSize: 11,
              color: franchise.color,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            View full page →
          </Link>
        </div>
      </div>

      {/* Description */}
      {item.desc && (
        <p style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          marginBottom: 20,
        }}>
          {item.desc.length > 300 ? item.desc.slice(0, 300) + "..." : item.desc}
        </p>
      )}

      {/* Vibes */}
      {item.vibes.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
          {item.vibes.map((v) => {
            const vibe = VIBES[v];
            if (!vibe) return null;
            return (
              <span key={v} style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                color: "#fff",
                background: vibe.color + "33",
                border: `1px solid ${vibe.color}55`,
                padding: "4px 12px",
                borderRadius: 16,
              }}>
                <span>{vibe.icon}</span>
                {vibe.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Two-column layout: left = people + platforms, right = scores + rating */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
        {/* Left */}
        <div>
          {/* People */}
          {item.people.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>
                People
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {item.people.slice(0, 6).map((p, i) => (
                  <div key={i} style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "var(--surface-1)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}>
                    <span style={{ color: "var(--text-faint)", fontSize: 10 }}>{p.role}</span>
                    <span style={{ color: "#fff", fontWeight: 600 }}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Platforms */}
          {(item.type === "movie" || item.type === "tv") ? (
            <WatchProviders
              title={item.title}
              year={item.year}
              mediaType={item.type}
              tmdbId={tmdbParsed ? item.id : undefined}
            />
          ) : (
            item.platforms.length > 0 && (
              <PlatformButtons platforms={item.platforms} mediaType={item.type} />
            )
          )}

          {/* Community Reviews */}
          {!isNaN(parseInt(fi.routeId)) && (
            <CommunityReviews itemId={parseInt(fi.routeId)} />
          )}
        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Community Score */}
          {!isNaN(parseInt(fi.routeId)) && (
            <div style={{
              background: `${franchise.color}08`,
              border: `1px solid ${franchise.color}15`,
              borderRadius: 14,
              padding: 20,
            }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 12 }}>
                Community Score
              </div>
              <AggregateScorePanel itemId={parseInt(fi.routeId)} />
            </div>
          )}

          {/* External Scores */}
          {Object.keys(item.ext).length > 0 && (
            <ExternalScores ext={item.ext} />
          )}

          {/* Your Rating */}
          {!isNaN(parseInt(fi.routeId)) && (
            <RatingPanel itemId={parseInt(fi.routeId)} />
          )}

          {/* Status Tracker */}
          {!isNaN(parseInt(fi.routeId)) && (
            <StatusTracker item={item} />
          )}
        </div>
      </div>
    </div>
  );
}
