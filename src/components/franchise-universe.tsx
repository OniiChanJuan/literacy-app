"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ALL_ITEMS, TYPES, isUpcoming, type Item } from "@/lib/data";
import { getFranchiseForItem, type Franchise, type FranchiseItem } from "@/lib/franchises";

interface ResolvedItem {
  routeId: string;
  title: string;
  cover: string;
  type: Item["type"];
  year: number;
  score: string | null; // "★ 4.3" or null
  isUpcoming: boolean;
}

function resolveLocalItem(fi: FranchiseItem): ResolvedItem | null {
  const numId = parseInt(fi.routeId);
  if (isNaN(numId)) return null;
  const item = ALL_ITEMS.find((i) => i.id === numId);
  if (!item) return null;

  // Get best external score
  const ext = Object.values(item.ext);
  const firstScore = ext.length > 0 ? ext[0] : null;
  const scoreStr = firstScore ? `★ ${(firstScore / 10).toFixed(1)}` : null;

  return {
    routeId: fi.routeId,
    title: item.title,
    cover: item.cover,
    type: item.type,
    year: item.year,
    score: scoreStr,
    isUpcoming: isUpcoming(item),
  };
}

export default function FranchiseUniverse({ routeId }: { routeId: string }) {
  const franchise = getFranchiseForItem(routeId);
  const router = useRouter();
  const [externalItems, setExternalItems] = useState<Record<string, ResolvedItem>>({});

  // Get other items (exclude current)
  const otherFranchiseItems = franchise?.items.filter((fi) => fi.routeId !== routeId) || [];

  // Fetch external items on mount
  useEffect(() => {
    if (!franchise) return;

    const externalFis = otherFranchiseItems.filter((fi) => isNaN(parseInt(fi.routeId)));
    if (externalFis.length === 0) return;

    externalFis.forEach((fi) => {
      // Try to fetch basic info from our search API
      fetch(`/api/search?q=${encodeURIComponent(fi.title)}&limit=1`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) {
            const match = data[0];
            setExternalItems((prev) => ({
              ...prev,
              [fi.routeId]: {
                routeId: fi.routeId,
                title: fi.title,
                cover: match.cover || "",
                type: fi.type,
                year: match.year || 0,
                score: null,
                isUpcoming: false,
              },
            }));
          } else {
            // Fallback — just show title
            setExternalItems((prev) => ({
              ...prev,
              [fi.routeId]: {
                routeId: fi.routeId,
                title: fi.title,
                cover: "",
                type: fi.type,
                year: 0,
                score: null,
                isUpcoming: false,
              },
            }));
          }
        })
        .catch(() => {
          setExternalItems((prev) => ({
            ...prev,
            [fi.routeId]: {
              routeId: fi.routeId,
              title: fi.title,
              cover: "",
              type: fi.type,
              year: 0,
              score: null,
              isUpcoming: false,
            },
          }));
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [franchise?.slug]);

  if (!franchise || otherFranchiseItems.length === 0) return null;

  // Resolve all items
  const resolved: ResolvedItem[] = otherFranchiseItems
    .map((fi) => {
      const local = resolveLocalItem(fi);
      if (local) return local;
      return externalItems[fi.routeId] || null;
    })
    .filter(Boolean) as ResolvedItem[];

  if (resolved.length === 0) return null;

  return (
    <section style={{
      background: `${franchise.color}0F`,
      border: `0.5px solid ${franchise.color}1F`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 32,
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 500,
          color: "rgba(255,255,255,0.7)",
        }}>
          <span>{franchise.icon}</span>
          This universe
        </div>
        <a
          href={`/franchise/${franchise.slug}`}
          onClick={(e) => { e.preventDefault(); router.push(`/franchise/${franchise.slug}`); }}
          style={{
            fontSize: 10,
            color: `${franchise.color}99`,
            textDecoration: "none",
            fontWeight: 500,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = franchise.color)}
          onMouseLeave={(e) => (e.currentTarget.style.color = `${franchise.color}99`)}
        >
          See full franchise →
        </a>
      </div>

      {/* Horizontal scroll of mini cards */}
      <div style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}>
        {resolved.map((ri) => (
          <MiniCard
            key={ri.routeId}
            item={ri}
            franchiseColor={franchise.color}
            onClick={() => router.push(`/item/${ri.routeId}`)}
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
  item: ResolvedItem;
  franchiseColor: string;
  onClick: () => void;
}) {
  const t = TYPES[item.type];
  const hasImage = item.cover.startsWith("http");
  const isGradient = item.cover && !hasImage;

  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 90,
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
      {/* Cover area */}
      <div style={{
        width: "100%",
        height: 65,
        position: "relative",
        overflow: "hidden",
        background: isGradient ? item.cover : "#1a1a2e",
      }}>
        {hasImage && (
          <Image
            src={item.cover}
            alt={item.title}
            width={90}
            height={65}
            quality={60}
            sizes="90px"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
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
          background: "rgba(0,0,0,0.6)",
          color: t.color,
          fontSize: 7,
          fontWeight: 600,
          padding: "1px 5px",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}>
          {t.icon}
        </div>

        {/* "Soon" badge for upcoming — top-right */}
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
            Soon
          </div>
        )}
      </div>

      {/* Info area */}
      <div style={{
        background: "#141419",
        padding: "5px 6px",
      }}>
        <div style={{
          fontSize: 9,
          fontWeight: 500,
          color: "#fff",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {item.title}
        </div>
        <div style={{
          fontSize: 8,
          color: "rgba(255,255,255,0.3)",
          marginTop: 1,
        }}>
          {item.score || (item.year > 0 ? item.year : "")}
        </div>
      </div>
    </button>
  );
}
