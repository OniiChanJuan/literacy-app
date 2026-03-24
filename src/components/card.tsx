"use client";

import { memo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Item, TYPES } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import Stars from "./stars";
import HoverPreview from "./hover-preview";

function isImageUrl(cover: string | undefined | null): boolean {
  return !!cover && (cover.startsWith("http") || cover.startsWith("/"));
}

/** Get the best external score to display */
function getBestExtScore(ext: any): { label: string; value: number; display: string } | null {
  if (!ext || typeof ext !== "object") return null;
  const entries = Object.entries(ext) as [string, number][];
  if (entries.length === 0) return null;

  // Prioritize: IMDb, RT, Meta, MAL, Goodreads, Pitchfork, IGN, Steam
  const priority = ["imdb", "rt", "meta", "mal", "goodreads", "pitchfork", "ign", "steam"];
  for (const key of priority) {
    const val = ext[key];
    if (val !== undefined && val !== null) {
      // Normalize display
      if (key === "imdb" || key === "mal" || key === "ign" || key === "pitchfork") {
        return { label: key.toUpperCase(), value: val, display: val.toFixed?.(1) || String(val) };
      }
      if (key === "goodreads") {
        return { label: "GR", value: val, display: val.toFixed?.(1) || String(val) };
      }
      // RT, Meta, Steam are 0-100
      return { label: key.toUpperCase(), value: val / 10, display: `${val}%` };
    }
  }

  // Fallback: use the first entry
  const [k, v] = entries[0];
  return { label: k.toUpperCase(), value: v, display: String(v) };
}

function scoreColor(val: number): string {
  if (val >= 4.0) return "#2EC4B6";
  if (val >= 3.0) return "#F9A620";
  return "#E84855";
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

const Card = memo(function Card({ item, routeId, crossMedia }: { item: Item; routeId?: string; crossMedia?: boolean }) {
  const router = useRouter();
  const { ratings, rate } = useRatings();
  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const userRating = ratings[item.id] || 0;
  const href = `/item/${routeId || item.id}`;
  const hasImage = isImageUrl(item.cover);
  const [imgError, setImgError] = useState(false);

  const handleClick = useCallback(() => {
    router.push(href);
  }, [router, href]);

  const handleRate = useCallback((s: number) => {
    rate(item.id, s);
  }, [rate, item.id]);

  const extScore = getBestExtScore(item.ext);

  return (
    <HoverPreview item={item}>
    <div
      onClick={handleClick}
      style={{
        minWidth: 162,
        maxWidth: 162,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
        flexShrink: 0,
        border: "0.5px solid rgba(255,255,255,0.06)",
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
      {/* Cover — 65% of card */}
      <div style={{
        height: 212,
        position: "relative",
        ...(hasImage && !imgError
          ? { background: "#1a1a2e" }
          : { background: item.cover?.startsWith("linear") ? item.cover : `linear-gradient(135deg, ${t.color}22, ${t.color}08)` }),
      }}>
        {hasImage && !imgError && (
          <Image
            src={item.cover}
            alt={item.title}
            width={162}
            height={212}
            quality={70}
            sizes="120px"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onError={() => setImgError(true)}
          />
        )}

        {/* Fallback */}
        {(imgError || (!hasImage && !item.cover?.startsWith("linear"))) && (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 8,
          }}>
            <span style={{ fontSize: 20, marginBottom: 2 }}>{t.icon}</span>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.2 }}>
              {item.title?.slice(0, 30)}
            </span>
          </div>
        )}

        {/* Type badge — top left */}
        <div style={{
          position: "absolute",
          top: 4,
          left: 4,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          color: t.color,
          fontSize: 8,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 4,
          textTransform: "uppercase",
        }}>
          {t.label.replace(/s$/, "")}
        </div>

        {/* User rating badge — top right */}
        {userRating > 0 && (
          <div style={{
            position: "absolute",
            top: 4,
            right: 4,
            background: "rgba(0,0,0,0.7)",
            color: "#f1c40f",
            fontSize: 8,
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
            fontSize: 7,
            fontWeight: 600,
            padding: "1px 5px",
            borderRadius: 4,
          }}>
            Cross-media
          </div>
        )}
      </div>

      {/* Info area — 35% of card */}
      <div style={{ background: "var(--bg-card)", padding: "8px 8px 6px" }}>
        {/* Title */}
        <div style={{
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.2,
          marginBottom: 3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#fff",
        }}>
          {item.title}
        </div>

        {/* Score row */}
        {extScore ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            marginBottom: 2,
          }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: scoreColor(extScore.value),
            }}>
              {extScore.display}
            </span>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)" }}>
              {extScore.label}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginBottom: 2 }}>
            {item.year || "TBA"}
          </div>
        )}

        {/* Inline stars */}
        {!routeId && (
          <Stars
            rating={userRating}
            onRate={handleRate}
            size={10}
          />
        )}
      </div>
    </div>
    </HoverPreview>
  );
});

export default Card;
