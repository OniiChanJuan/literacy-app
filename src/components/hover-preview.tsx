"use client";

import { useState, useRef, useCallback } from "react";
import { Item, TYPES, VIBES } from "@/lib/data";

interface HoverPreviewProps {
  item: Item;
  children: React.ReactNode;
}

export default function HoverPreview({ item, children }: HoverPreviewProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<"right" | "left">("right");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      // Determine if popup should go left or right based on position
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPosition(rect.left > window.innerWidth / 2 ? "left" : "right");
      }
      setShow(true);
    }, 800);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  }, []);

  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const extEntries = Object.entries(item.ext || {}) as [string, number][];

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ position: "relative", display: "inline-block" }}
    >
      {children}

      {show && (
        <div
          style={{
            position: "absolute",
            top: 0,
            [position === "right" ? "left" : "right"]: "calc(100% + 12px)",
            width: 320,
            background: "#141419",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            zIndex: 100,
            padding: 20,
            pointerEvents: "none",
          }}
        >
          {/* Type + Year */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{
              background: t.color,
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 5,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>
              {t.icon} {t.label.replace(/s$/, "")}
            </span>
            {item.year > 0 && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{item.year}</span>
            )}
          </div>

          {/* Title */}
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.2,
            marginBottom: 8,
          }}>
            {item.title}
          </div>

          {/* Genres */}
          {item.genre?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {item.genre.slice(0, 4).map((g) => (
                <span key={g} style={{
                  fontSize: 10,
                  color: "var(--text-secondary)",
                  background: "rgba(255,255,255,0.06)",
                  padding: "2px 7px",
                  borderRadius: 4,
                }}>
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Vibes */}
          {item.vibes?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {item.vibes.map((v) => {
                const vibe = VIBES[v];
                if (!vibe) return null;
                return (
                  <span key={v} style={{
                    fontSize: 9,
                    color: vibe.color,
                    background: vibe.color + "22",
                    padding: "2px 7px",
                    borderRadius: 10,
                  }}>
                    {vibe.icon} {vibe.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Scores */}
          {extEntries.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {extEntries.slice(0, 3).map(([source, score]) => (
                <span key={source} style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 700, color: "#fff" }}>{score}</span>{" "}
                  {source.toUpperCase()}
                </span>
              ))}
            </div>
          )}

          {/* Description snippet */}
          {item.desc && (
            <p style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
              margin: "0 0 10px",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
              {item.desc}
            </p>
          )}

          {/* People */}
          {item.people?.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
              {item.people.slice(0, 3).map((p: any) => `${p.name}`).join(" · ")}
            </div>
          )}

          {/* Click hint */}
          <div style={{
            fontSize: 10,
            color: "var(--text-faint)",
            textAlign: "center",
            paddingTop: 8,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}>
            Click to view full page
          </div>
        </div>
      )}
    </div>
  );
}
