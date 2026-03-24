"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { TYPES } from "@/lib/data";

interface FranchiseItemData {
  id: number;
  title: string;
  type: string;
  year: number;
  cover: string;
  isUpcoming: boolean;
  releaseDate: string | null;
  score: { label: string; display: string; value: number } | null;
}

interface FranchiseData {
  id: number;
  name: string;
  icon: string;
  color: string;
  totalItems: number;
  mediaTypes: number;
  otherItems: FranchiseItemData[];
}

function scoreColor(val: number): string {
  if (val >= 8.0) return "#2EC4B6";
  if (val >= 6.0) return "#F9A620";
  return "#E84855";
}

export default function FranchiseUniverse({ itemId }: { itemId: number }) {
  const [franchise, setFranchise] = useState<FranchiseData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/franchises?itemId=${itemId}`)
      .then((r) => r.json())
      .then((data) => {
        setFranchise(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [itemId]);

  if (!loaded || !franchise || franchise.otherItems.length === 0) return null;

  const c = franchise.color;

  return (
    <section style={{
      background: `linear-gradient(135deg, ${c}0F, ${c}0A)`,
      border: `0.5px solid ${c}1F`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>{franchise.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>
            This universe
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            {franchise.totalItems} entries across {franchise.mediaTypes} media
          </span>
        </div>
        <a
          href={`/franchise/${franchise.id}`}
          style={{
            fontSize: 10,
            color: `${c}99`,
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          See full timeline →
        </a>
      </div>

      {/* Horizontal scroll of mini cards */}
      <div style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }} className="scrollbar-hide">
        {franchise.otherItems.map((item) => (
          <MiniCard
            key={item.id}
            item={item}
            franchiseColor={c}
            onClick={() => router.push(`/item/${item.id}`)}
          />
        ))}
      </div>
    </section>
  );
}

function MiniCard({
  item,
  franchiseColor,
  onClick,
}: {
  item: FranchiseItemData;
  franchiseColor: string;
  onClick: () => void;
}) {
  const t = TYPES[item.type as keyof typeof TYPES] || { color: "#888", icon: "?", label: "Unknown" };
  const hasImage = item.cover?.startsWith("http");

  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 95,
        borderRadius: 8,
        overflow: "hidden",
        border: "0.5px solid rgba(255,255,255,0.06)",
        background: "none",
        padding: 0,
        cursor: "pointer",
        textAlign: "left",
        transition: "transform 0.15s, box-shadow 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      {/* Cover */}
      <div style={{
        width: "100%",
        height: 70,
        position: "relative",
        overflow: "hidden",
        background: hasImage ? "#1a1a2e" : `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
      }}>
        {hasImage && (
          <Image
            src={item.cover}
            alt={item.title}
            width={95}
            height={70}
            quality={60}
            sizes="95px"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        {/* Gradient overlay */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(20,20,25,0.6) 0%, transparent 60%)",
        }} />

        {/* Type badge — top-left */}
        <div style={{
          position: "absolute",
          top: 3,
          left: 3,
          background: "rgba(0,0,0,0.65)",
          color: t.color,
          fontSize: 7,
          fontWeight: 500,
          padding: "1px 5px",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}>
          {t.icon} {t.label.replace(/s$/, "")}
        </div>

        {/* Upcoming year badge — top-right */}
        {item.isUpcoming && (
          <div style={{
            position: "absolute",
            top: 3,
            right: 3,
            background: "linear-gradient(135deg, #9B5DE5, #C45BAA)",
            color: "#fff",
            fontSize: 7,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 4,
          }}>
            {item.year || "Soon"}
          </div>
        )}
      </div>

      {/* Info area */}
      <div style={{ background: "#141419", padding: "6px 7px" }}>
        <div style={{
          fontSize: 10,
          fontWeight: 500,
          color: "#fff",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {item.title}
        </div>
        <div style={{ fontSize: 8, marginTop: 2 }}>
          {item.isUpcoming ? (
            <span style={{ color: "rgba(155,93,229,0.6)" }}>Coming soon</span>
          ) : item.score ? (
            <span>
              <span style={{ color: scoreColor(item.score.value), fontWeight: 600 }}>
                {item.score.display}
              </span>
              {" "}
              <span style={{ color: "rgba(255,255,255,0.2)" }}>{item.score.label}</span>
            </span>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.2)" }}>{item.year}</span>
          )}
        </div>
      </div>
    </button>
  );
}
