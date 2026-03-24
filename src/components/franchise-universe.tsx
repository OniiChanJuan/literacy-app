"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
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

interface ParentFranchise {
  id: number;
  name: string;
  icon: string;
}

interface FranchiseData {
  id: number;
  name: string;
  icon: string;
  color: string;
  totalItems: number;
  mediaTypes: number;
  otherItems: FranchiseItemData[];
  parentFranchise: ParentFranchise | null;
}

function scoreColor(val: number): string {
  if (val >= 8.0) return "#2EC4B6";
  if (val >= 6.0) return "#F9A620";
  return "#E84855";
}

export default function FranchiseUniverse({ itemId }: { itemId: number }) {
  const [franchise, setFranchise] = useState<FranchiseData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/franchises?itemId=${itemId}`)
      .then((r) => r.json())
      .then((data) => { setFranchise(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [itemId]);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 5);
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  // Update arrows after franchise loads AND after a short delay for images
  useEffect(() => {
    if (!franchise) return;
    // Immediate check
    updateArrows();
    // Delayed check after images might have loaded
    const t1 = setTimeout(updateArrows, 100);
    const t2 = setTimeout(updateArrows, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [franchise, updateArrows]);

  // Listen to scroll events
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  };

  if (!loaded || !franchise || franchise.otherItems.length === 0) return null;

  const c = franchise.color;

  return (
    <section style={{
      background: `linear-gradient(135deg, ${c}0F, ${c}0A)`,
      border: `0.5px solid ${c}1F`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 24,
      overflow: "hidden",
      maxWidth: "100%",
      boxSizing: "border-box",
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
          style={{ fontSize: 10, color: `${c}99`, textDecoration: "none", fontWeight: 500 }}
        >
          Explore this universe →
        </a>
      </div>

      {/* Card row with scroll arrows */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        {/* Left arrow */}
        {showLeft && (
          <button
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
            style={{
              position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              color: "#fff", fontSize: 12, cursor: "pointer", zIndex: 2,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0,
            }}
          >
            ←
          </button>
        )}

        {/* Right arrow */}
        {showRight && (
          <button
            onClick={() => scroll(1)}
            aria-label="Scroll right"
            style={{
              position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
              border: "0.5px solid rgba(255,255,255,0.1)",
              color: "#fff", fontSize: 12, cursor: "pointer", zIndex: 2,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0,
            }}
          >
            →
          </button>
        )}

        {/* Scrollable cards — width:0 + minWidth:100% prevents flex children from expanding parent */}
        <div
          ref={scrollRef}
          className="scrollbar-hide"
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            scrollBehavior: "smooth",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            width: 0,
            minWidth: "100%",
          }}
        >
          {franchise.otherItems.map((item) => (
            <MiniCard
              key={item.id}
              item={item}
              onClick={() => router.push(`/item/${item.id}`)}
            />
          ))}
        </div>
      </div>

      {/* Parent franchise link */}
      {franchise.parentFranchise && (
        <div style={{ marginTop: 10, textAlign: "right" }}>
          <a
            href={`/franchise/${franchise.parentFranchise.id}`}
            style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textDecoration: "none" }}
          >
            Part of the {franchise.parentFranchise.name} universe →
          </a>
        </div>
      )}
    </section>
  );
}

function MiniCard({ item, onClick }: { item: FranchiseItemData; onClick: () => void }) {
  const t = TYPES[item.type as keyof typeof TYPES] || { color: "#888", icon: "?", label: "Unknown" };
  const hasImage = item.cover?.startsWith("http");

  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 95,
        maxWidth: 95,
        width: 95,
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
      {/* Cover — exactly 70px tall */}
      <div style={{
        width: 95,
        height: 70,
        position: "relative",
        overflow: "hidden",
        background: hasImage ? "#1a1a2e" : `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
      }}>
        {hasImage ? (
          /* Use native img for consistent sizing — next/image wrapper div can cause height issues */
          <img
            src={item.cover}
            alt={item.title}
            loading="lazy"
            style={{
              width: 95,
              height: 70,
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div style={{
            width: 95, height: 70,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "rgba(255,255,255,0.15)",
          }}>
            {t.icon}
          </div>
        )}

        {/* Gradient overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(20,20,25,0.6) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />

        {/* Type badge — top-left */}
        <div style={{
          position: "absolute", top: 3, left: 3,
          background: "rgba(0,0,0,0.65)", color: t.color,
          fontSize: 7, fontWeight: 500, padding: "1px 5px", borderRadius: 4,
          display: "flex", alignItems: "center", gap: 2,
          lineHeight: 1.4,
        }}>
          {t.icon} {t.label}
        </div>

        {/* Upcoming badge — top-right */}
        {item.isUpcoming && (
          <div style={{
            position: "absolute", top: 3, right: 3,
            background: "linear-gradient(135deg, #9B5DE5, #C45BAA)",
            color: "#fff", fontSize: 7, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
          }}>
            {item.year || "Soon"}
          </div>
        )}
      </div>

      {/* Info area — exactly 36px */}
      <div style={{
        background: "#141419",
        padding: "6px 7px",
        height: 36,
        boxSizing: "border-box",
        overflow: "hidden",
      }}>
        <div style={{
          fontSize: 10, fontWeight: 500, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", lineHeight: 1.3,
          maxWidth: 81, /* 95 - 7px padding each side */
        }}>
          {item.title}
        </div>
        <div style={{
          fontSize: 8, marginTop: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
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
