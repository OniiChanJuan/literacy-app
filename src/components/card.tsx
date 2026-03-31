"use client";

import { memo, useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Item, TYPES, hexToRgba } from "@/lib/data";
import { getItemUrl } from "@/lib/slugs";
import { useRatings } from "@/lib/ratings-context";
import { scorePassesThreshold } from "@/lib/score-thresholds";
import Stars from "./stars";
import HoverPreview from "./hover-preview";
import { isAnime } from "@/lib/anime";

function isImageUrl(cover: string | undefined | null): boolean {
  return !!cover && (cover.startsWith("http") || cover.startsWith("/"));
}

const EXT_SCORE_META: Record<string, { label: string; max: number }> = {
  tmdb:              { label: "TMDB",       max: 10  },
  imdb:              { label: "IMDb",       max: 10  },
  mal:               { label: "MAL",        max: 10  },
  igdb_critics:      { label: "Critics",    max: 100 },
  igdb:              { label: "IGDB",       max: 100 },
  google_books:      { label: "Books",      max: 5   },
  rt_critics:        { label: "RT",         max: 100 },
  metacritic:        { label: "Meta",       max: 100 },
  pitchfork:         { label: "Pitchfork",  max: 10  },
  ign:               { label: "IGN",        max: 10  },
  steam:             { label: "Steam",      max: 100 },
  spotify_popularity:{ label: "Spotify",    max: 100 },
  aoty:              { label: "AOTY",       max: 100 },
  opencritic:        { label: "OpenCritic", max: 100 },
  anilist:           { label: "AniList",    max: 100 },
};

// Non-score ext keys to always skip
const EXT_SKIP_KEYS = new Set(["steam_label", "igdb_count", "igdb_critics_count", "google_books_count"]);

const EXT_SCORE_PRIORITY = [
  "imdb", "tmdb", "mal", "igdb_critics", "igdb",
  "google_books", "rt_critics",
  "metacritic", "pitchfork", "ign",
  // steam intentionally excluded — shown as text label on detail page only, not as a number on cards
  "spotify_popularity", "aoty", "opencritic", "anilist",
];

/** Get the best external score for display, respecting vote-count thresholds */
function getBestExtScore(ext: any, voteCount: number): { label: string; value: number; display: string } | null {
  if (!ext || typeof ext !== "object") return null;

  for (const key of EXT_SCORE_PRIORITY) {
    const val = ext[key];
    if (val === undefined || val === null) continue;
    if (!scorePassesThreshold(key, ext, voteCount)) continue;
    const m = EXT_SCORE_META[key] || { label: key.toUpperCase(), max: 10 };
    const normalized = (val / m.max) * 10;
    const scoreStr = m.max <= 10 ? val.toFixed(1) : String(Math.round(val));
    return { label: m.label, value: normalized, display: `${scoreStr} ${m.label}` };
  }
  return null;
}

function scoreColor(val: number): string {
  if (val >= 4.0) return "#2EC4B6";
  if (val >= 3.0) return "#F9A620";
  return "#E84855";
}


const Card = memo(function Card({ item, routeId, crossMedia }: { item: Item; routeId?: string; crossMedia?: boolean }) {
  const { ratings, rate } = useRatings();
  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const userRating = ratings[item.id] || 0;
  const href = routeId ? `/item/${routeId}` : getItemUrl(item);
  const hasImage = isImageUrl(item.cover);
  const [imgError, setImgError] = useState(false);

  const handleRate = useCallback((s: number) => {
    rate(item.id, s);
  }, [rate, item.id]);

  const extScore = getBestExtScore(item.ext, item.voteCount ?? 0);

  // Literacy score derived from external score until real community ratings are available
  const literacyScore = extScore ? Math.min(5, extScore.value * 0.55).toFixed(1) : null;
  const literacyScoreNum = literacyScore ? parseFloat(literacyScore) : 0;
  const recPct = extScore ? Math.min(99, Math.round(extScore.value * 10.5)) : null;

  return (
    <HoverPreview item={item}>
    <Link
      href={href}
      style={{
        flex: "0 0 150px",
        width: 150,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        scrollSnapAlign: "start",
        display: "block",
        textDecoration: "none",
        color: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.35)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.2)";
      }}
    >
      {/* Cover — fixed 210px height */}
      <div style={{
        height: 210,
        position: "relative",
        ...(hasImage && !imgError
          ? { background: "#1a1a2e" }
          : { background: item.cover?.startsWith("linear") ? item.cover : `linear-gradient(135deg, ${t.color}22, ${t.color}08)` }),
      }}>
        {hasImage && !imgError && (
          <Image
            src={item.cover}
            alt={item.title}
            width={150}
            height={210}
            quality={70}
            sizes="150px"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onError={() => setImgError(true)}
          />
        )}

        {/* Placeholder — intentional styled fallback, not a broken image */}
        {(imgError || (!hasImage && !item.cover?.startsWith("linear"))) && (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "0 10px",
            gap: 6,
          }}>
            <span style={{ fontSize: 32, opacity: 0.7 }}>{t.icon}</span>
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: "rgba(255,255,255,0.55)",
              textAlign: "center",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }}>
              {item.title}
            </span>
          </div>
        )}

        {/* Type badge row — top left */}
        <div style={{
          position: "absolute",
          top: 4,
          left: 4,
          display: "flex",
          alignItems: "center",
          gap: 3,
        }}>
          <div style={{
            background: hexToRgba(t.color, 0.85),
            color: "#fff",
            fontSize: 8,
            fontWeight: 500,
            padding: "2px 6px",
            borderRadius: 4,
            textTransform: "uppercase",
          }}>
            {t.label.replace(/s$/, "")}
          </div>
          {isAnime(item) && (
            <div style={{
              background: "rgba(255,107,107,0.85)",
              backdropFilter: "blur(4px)",
              color: "#fff",
              fontSize: 8,
              fontWeight: 500,
              padding: "2px 6px",
              borderRadius: 4,
              textTransform: "uppercase",
            }}>
              ANIME
            </div>
          )}
        </div>

        {/* User rating badge — top right */}
        {userRating > 0 && (
          <div style={{
            position: "absolute",
            top: 4,
            right: 4,
            background: "rgba(0,0,0,0.7)",
            color: "#f1c40f",
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 4,
          }}>
            ★ {userRating}
          </div>
        )}

        {/* Cross-media badge — bottom left */}
        {crossMedia && (
          <div style={{
            position: "absolute",
            bottom: 3,
            left: 3,
            background: "rgba(232,72,85,0.8)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 4px",
            borderRadius: 3,
          }}>
            Cross-media
          </div>
        )}
      </div>

      {/* Info area */}
      <div style={{ background: "var(--bg-card)", padding: "6px 8px 5px" }}>
        {/* Title */}
        <div style={{
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.2,
          marginBottom: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#fff",
        }}>
          {item.title}
        </div>

        {/* Score row: Literacy score + recommend % */}
        {literacyScore ? (
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 1 }}>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: scoreColor(literacyScoreNum),
            }}>
              {literacyScore} ★
            </span>
            {recPct !== null && (
              <>
                <span style={{ fontSize: 7, color: "rgba(255,255,255,0.15)" }}>|</span>
                <span style={{
                  fontSize: 8,
                  fontWeight: 600,
                  color: recPct >= 70 ? "#2EC4B6" : recPct >= 40 ? "#F9A620" : "#E84855",
                }}>
                  {recPct}% 👍
                </span>
              </>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginBottom: 1 }}>
            {item.year || "TBA"}
          </div>
        )}

        {/* External score source label */}
        {extScore && (
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>
            {extScore.display}
          </div>
        )}

        {/* Inline stars */}
        {!routeId && (
          <Stars
            rating={userRating}
            onRate={handleRate}
            size={9}
          />
        )}
      </div>
    </Link>
    </HoverPreview>
  );
});

export default Card;
