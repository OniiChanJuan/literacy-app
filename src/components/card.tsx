"use client";

import { memo, useCallback, useState } from "react";
import Link from "next/link";
import { Item, TYPES, hexToRgba } from "@/lib/data";
import CoverImage from "./cover-image";
import { getItemUrl } from "@/lib/slugs";
import { useRatings } from "@/lib/ratings-context";
import CardScore from "./card-score";
import Stars from "./stars";
import HoverPreview from "./hover-preview";
import { isAnime } from "@/lib/anime";

function isImageUrl(cover: string | undefined | null): boolean {
  return !!cover && (cover.startsWith("http") || cover.startsWith("/"));
}



const Card = memo(function Card({ item, routeId, crossMedia, optimized = false, ownerScore }: { item: Item; routeId?: string; crossMedia?: boolean; optimized?: boolean; ownerScore?: number }) {
  const { ratings, rate } = useRatings();
  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const userRating = ratings[item.id] || 0;
  // Profile context: when an owner's score is supplied the card reflects THEIR
  // rating read-only (badge + static stars), not the viewer's interactive one.
  const isOwnerView = ownerScore !== undefined;
  const displayRating = isOwnerView ? (ownerScore || 0) : userRating;
  const href = routeId ? `/item/${routeId}` : getItemUrl(item);
  const hasImage = isImageUrl(item.cover);
  const [imgError, setImgError] = useState(false);

  const handleRate = useCallback((s: number) => {
    rate(item.id, s);
  }, [rate, item.id]);

  return (
    <HoverPreview item={item}>
    <Link
      href={href}
      style={{
        // Sized by the shared layout tokens (globals.css) so every surface,
        // and the matching SkeletonCard, resize together. 150/210 today.
        flex: "0 0 var(--card-w)",
        width: "var(--card-w)",
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
      {/* Cover — height from --card-cover-h (210px today) */}
      <div style={{
        height: "var(--card-cover-h)",
        position: "relative",
        ...(hasImage && !imgError
          ? { background: "#1a1a2e" }
          : { background: item.cover?.startsWith("linear") ? item.cover : `linear-gradient(135deg, ${t.color}22, ${t.color}08)` }),
      }}>
        {hasImage && !imgError && (
          <CoverImage
            src={item.cover}
            alt={item.title}
            width={150}
            height={210}
            quality={70}
            sizes="150px"
            optimized={optimized}
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

        {/* Rating badge — top right. Gold = the user's own rating ("You"), kept
            distinct from the teal CrossShelf Score by color + position. On a
            profile it's the owner's rating (no "You" tag). */}
        {displayRating > 0 && (
          <div style={{
            position: "absolute",
            top: 4,
            right: 4,
            display: "flex",
            alignItems: "center",
            gap: 3,
            background: "rgba(0,0,0,0.72)",
            border: "0.5px solid rgba(218,165,32,0.55)",
            color: "#DAA520",
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 4,
          }}>
            ★ {displayRating}
            {!isOwnerView && (
              <span style={{ fontSize: 6.5, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(218,165,32,0.85)" }}>
                You
              </span>
            )}
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

      {/* Info area — visible at all times (not hover-gated) */}
      <div style={{ background: "var(--bg-card)", padding: "6px 8px 6px" }}>
        {/* Title */}
        <div style={{
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.2,
          marginBottom: 4,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#fff",
        }}>
          {item.title}
        </div>

        {/* CrossShelf Score unit — wordmark + 0–10 + fill bar (dash for comics
            / no external data). Shared with the For You grid + other surfaces. */}
        <div style={{ marginBottom: 3 }}>
          <CardScore item={item} numSize={12} />
        </div>

        {/* Genre (always visible, not hover-gated) */}
        {item.genre && item.genre.length > 0 && (
          <div style={{
            fontSize: 10, color: "rgba(232,230,225,0.2)", lineHeight: 1.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginBottom: !routeId ? 4 : 0,
          }}>
            {item.genre.slice(0, 2).join(" · ")}
          </div>
        )}

        {/* Rating affordance. Owner view: read-only gold stars of the owner's
            score. Normal view: interactive rate-stars when UNRATED — once rated,
            the gold "You" corner badge carries the rating (per the mockup). */}
        {!routeId && (
          isOwnerView ? (
            displayRating > 0 && (
              <div style={{ color: "#DAA520", fontSize: 9, letterSpacing: 1, lineHeight: 1 }}>
                {"★".repeat(displayRating)}{"☆".repeat(Math.max(0, 5 - displayRating))}
              </div>
            )
          ) : (
            userRating === 0 && (
              <Stars
                rating={userRating}
                onRate={handleRate}
                size={9}
              />
            )
          )
        )}
      </div>
    </Link>
    </HoverPreview>
  );
});

export default Card;
