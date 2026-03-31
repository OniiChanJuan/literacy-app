"use client";

import { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { TYPES, type UpcomingItem } from "@/lib/data";
import { getItemUrl } from "@/lib/slugs";
import { useLibrary } from "@/lib/library-context";

function isImageUrl(cover: string): boolean {
  return cover.startsWith("http") || cover.startsWith("/");
}

export default function UpcomingCard({ item }: { item: UpcomingItem }) {
  const { entries, setStatus } = useLibrary();
  const t = TYPES[item.type];
  const isWanted = entries[item.id]?.status === "want_to";

  const release = new Date(item.releaseDate);
  const month = release.toLocaleString("en-US", { month: "short" });
  const day = release.getDate();
  const year = release.getFullYear();

  const hasImage = item.cover && isImageUrl(item.cover);
  const hasGradient = item.cover && !isImageUrl(item.cover);

  return (
    <Link
      href={getItemUrl(item)}
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
        ...(hasGradient ? { background: item.cover } : { background: "#1a1a2e" }),
      }}>
        {hasImage && (
          <Image
            src={item.cover}
            alt={item.title}
            width={150}
            height={210}
            quality={70}
            sizes="150px"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}

        {!hasImage && !hasGradient && (
          <div style={{
            width: "100%",
            height: "100%",
            background: `linear-gradient(135deg, ${t.color}33, ${t.color}11)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px 12px",
          }}>
            <span style={{ fontSize: 32, marginBottom: 8 }}>{t.icon}</span>
            <span style={{
              fontFamily: "var(--font-serif)",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              textAlign: "center",
              lineHeight: 1.3,
              marginBottom: 8,
            }}>
              {item.title}
            </span>
            <span style={{ fontSize: 11, color: t.color, fontWeight: 600 }}>
              {month} {day}, {year}
            </span>
          </div>
        )}

        {/* Type badge — top left */}
        <div style={{
          position: "absolute",
          top: 6,
          left: 6,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)",
          color: t.color,
          fontSize: 8,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 6,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 3,
        }}>
          <span style={{ fontSize: 10 }}>{t.icon}</span> {t.label.replace(/s$/, "")}
        </div>

        {/* Release date badge — top right */}
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
          {month} {day}, {year}
        </div>

        {/* "UPCOMING" ribbon at bottom of cover */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top, rgba(232,72,85,0.9), transparent)",
          padding: "16px 10px 6px",
          textAlign: "center",
          fontSize: 9,
          fontWeight: 800,
          color: "#fff",
          textTransform: "uppercase",
          letterSpacing: "2px",
        }}>
          Coming Soon
        </div>
      </div>

      {/* Info */}
      <div style={{ background: "var(--bg-card)", padding: "8px 8px 6px" }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.25,
          marginBottom: 4,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#fff",
        }}>
          {item.title}
        </div>

        {/* Want count + Want To button */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
            {(item.wantCount || 0).toLocaleString()} want
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setStatus(item.id, isWanted ? null : "want_to");
            }}
            style={{
              background: isWanted ? "#9B5DE522" : "rgba(255,255,255,0.06)",
              border: isWanted ? "1px solid #9B5DE555" : "1px solid rgba(255,255,255,0.1)",
              color: isWanted ? "#9B5DE5" : "var(--text-muted)",
              fontSize: 9,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 6,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {isWanted ? "✓ Wanted" : "＋ Want"}
          </button>
        </div>
      </div>
    </Link>
  );
}
