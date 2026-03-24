"use client";

import { memo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Item, TYPES } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import { ScoreBadge } from "./aggregate-score";
import Stars from "./stars";
import HoverPreview from "./hover-preview";

function isImageUrl(cover: string | undefined | null): boolean {
  return !!cover && (cover.startsWith("http") || cover.startsWith("/"));
}

const Card = memo(function Card({ item, routeId }: { item: Item; routeId?: string }) {
  const router = useRouter();
  const { ratings, rate } = useRatings();
  const t = TYPES[item.type];
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

  return (
    <HoverPreview item={item}>
    <div
      onClick={handleClick}
      style={{
        minWidth: 190,
        maxWidth: 190,
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.25)";
      }}
    >
      {/* Cover */}
      <div style={{
        height: 250,
        position: "relative",
        ...(hasImage && !imgError
          ? { background: "#1a1a2e" }
          : { background: item.cover?.startsWith("linear") ? item.cover : "#1a1a2e" }),
      }}>
        {hasImage && !imgError && (
          <Image
            src={item.cover}
            alt={item.title}
            width={190}
            height={250}
            quality={75}
            sizes="190px"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            onError={() => setImgError(true)}
          />
        )}

        {/* Fallback when image fails */}
        {imgError && (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
            padding: 16,
          }}>
            <span style={{ fontSize: 32, marginBottom: 8 }}>{t.icon}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 1.3 }}>
              {item.title}
            </span>
          </div>
        )}

        {/* Type badge — top left */}
        <div style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          color: t.color,
          fontSize: 10,
          fontWeight: 700,
          padding: "3px 9px",
          borderRadius: 8,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}>
          <span style={{ fontSize: 12 }}>{t.icon}</span> {t.label.replace(/s$/, "")}
        </div>

        {/* Gold rating badge — top right */}
        {userRating > 0 && (
          <div style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(8px)",
            color: "#f1c40f",
            fontSize: 12,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 3,
          }}>
          ★ {userRating}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ background: "var(--bg-card)", padding: "12px 12px 10px" }}>
        <div style={{
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1.25,
          marginBottom: 4,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#fff",
        }}>
          {item.title}
        </div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {item.year || "TBA"}
          </span>
          {!routeId && <ScoreBadge itemId={item.id} />}
          {routeId && item.ext.imdb && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f5c518" }}>{item.ext.imdb}</span>
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>TMDB</span>
            </div>
          )}
        </div>
        {!routeId && (
          <Stars
            rating={userRating}
            onRate={handleRate}
            size={14}
          />
        )}
      </div>
    </div>
    </HoverPreview>
  );
});

export default Card;
