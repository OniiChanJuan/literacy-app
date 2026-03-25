"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { TYPES, type UpcomingItem } from "@/lib/data";
import { useLibrary } from "@/lib/library-context";

function isImageUrl(cover: string): boolean {
  return cover.startsWith("http") || cover.startsWith("/");
}

export default function UpcomingCard({ item }: { item: UpcomingItem }) {
  const router = useRouter();
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
    <div
      onClick={() => router.push(`/item/${item.id}`)}
      style={{
        flex: "1 0 130px",
        maxWidth: 180,
        minWidth: 130,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.2s, box-shadow 0.2s",
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
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
      {/* Cover */}
      <div style={{
        height: 95,
        position: "relative",
        ...(hasGradient ? { background: item.cover } : { background: "#1a1a2e" }),
      }}>
        {/* Image cover */}
        {hasImage && (
          <Image
            src={item.cover}
            alt={item.title}
            width={180}
            height={95}
            quality={70}
            sizes="(max-width: 768px) 130px, 180px"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}

        {/* Styled placeholder for items with no cover */}
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

        {/* Release date badge — top right */}
        <div style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
          color: "#f1c40f",
          fontSize: 10,
          fontWeight: 700,
          padding: "3px 8px",
          borderRadius: 8,
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
      <div style={{ background: "var(--bg-card)", padding: "12px 12px 10px" }}>
        <div style={{
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1.25,
          marginBottom: 6,
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
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {(item.wantCount || 0).toLocaleString()} want this
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
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 8,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {isWanted ? "✓ Wanted" : "＋ Want"}
          </button>
        </div>
      </div>
    </div>
  );
}
