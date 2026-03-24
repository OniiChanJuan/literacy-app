"use client";

import Image from "next/image";
import Link from "next/link";
import { TYPES } from "@/lib/data";

interface DlcItem {
  id: number;
  title: string;
  type: string;
  year: number;
  cover: string;
  itemSubtype: string | null;
  bestScore?: { source: string; score: number; maxScore: number } | null;
}

interface DlcSectionProps {
  dlcs: DlcItem[];
  baseGameTitle: string;
  typeColor: string;
}

function scoreColor(score: number, max: number): string {
  const normalized = (score / max) * 10;
  if (normalized >= 7.5) return "#2EC4B6";
  if (normalized >= 5) return "#F9A620";
  return "#E84855";
}

function formatScore(score: number, max: number, source: string): string {
  if (max === 100) return `${Math.round(score)}`;
  if (max === 10) return score.toFixed(1);
  if (max === 5) return score.toFixed(1);
  return `${Math.round(score)}`;
}

export default function DlcSection({ dlcs, baseGameTitle, typeColor }: DlcSectionProps) {
  if (dlcs.length === 0) return null;

  const expansionCount = dlcs.filter((d) => d.itemSubtype === "expansion").length;
  const dlcCount = dlcs.filter((d) => d.itemSubtype !== "expansion").length;

  const countLabel = [
    expansionCount > 0 ? `${expansionCount} expansion${expansionCount !== 1 ? "s" : ""}` : "",
    dlcCount > 0 ? `${dlcCount} DLC${dlcCount !== 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(", ");

  return (
    <section style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{
            fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700,
            color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px",
            margin: 0,
          }}>
            DLC & Expansions
          </h2>
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{countLabel}</span>
        </div>
      </div>

      {/* Accent line */}
      <div style={{
        height: 1.5, borderRadius: 1,
        background: `linear-gradient(to right, ${typeColor}66, ${typeColor}11)`,
        marginBottom: 16,
      }} />

      {/* DLC cards row */}
      <div style={{
        display: "flex", gap: 10, overflowX: "auto",
        scrollbarWidth: "none",
        paddingBottom: 4,
      }}>
        {dlcs.map((dlc) => {
          const hasImage = dlc.cover?.startsWith("http");
          const subtypeLabel = dlc.itemSubtype === "expansion" ? "Expansion" : "DLC";

          return (
            <Link
              key={dlc.id}
              href={`/item/${dlc.id}`}
              style={{
                minWidth: 140, maxWidth: 140, borderRadius: 8,
                overflow: "hidden", flexShrink: 0, textDecoration: "none",
                border: "0.5px solid rgba(255,255,255,0.08)",
                background: "#141419",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              {/* Cover area */}
              <div style={{
                height: 85, position: "relative", overflow: "hidden",
                background: hasImage ? "#1a1a2e" : `linear-gradient(135deg, ${typeColor}33, ${typeColor}11)`,
              }}>
                {hasImage && (
                  <Image
                    src={dlc.cover}
                    alt={dlc.title}
                    fill
                    sizes="140px"
                    style={{ objectFit: "cover" }}
                  />
                )}
                {/* Gradient overlay */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, rgba(20,20,25,0.6) 0%, transparent 50%)",
                }} />
                {/* Subtype badge */}
                <div style={{
                  position: "absolute", top: 4, left: 4,
                  background: "rgba(0,0,0,0.65)",
                  color: typeColor,
                  fontSize: 7, fontWeight: 500,
                  padding: "1px 5px", borderRadius: 4,
                }}>
                  {subtypeLabel}
                </div>
                {/* Year badge */}
                {dlc.year > 0 && (
                  <div style={{
                    position: "absolute", top: 4, right: 4,
                    background: "rgba(0,0,0,0.55)",
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 7, fontWeight: 500,
                    padding: "1px 5px", borderRadius: 4,
                  }}>
                    {dlc.year}
                  </div>
                )}
              </div>

              {/* Info area */}
              <div style={{ padding: "7px 8px" }}>
                <div style={{
                  fontSize: 10, fontWeight: 500, color: "#fff",
                  lineHeight: 1.3,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  marginBottom: 4,
                }}>
                  {dlc.title}
                </div>

                {/* Score */}
                {dlc.bestScore ? (
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>
                    <span style={{ color: scoreColor(dlc.bestScore.score, dlc.bestScore.maxScore), fontWeight: 600 }}>
                      {formatScore(dlc.bestScore.score, dlc.bestScore.maxScore, dlc.bestScore.source)}
                    </span>
                    {" "}
                    {dlc.bestScore.source}
                  </div>
                ) : (
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.15)" }}>
                    No scores yet
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Badge shown on DLC detail pages linking back to the base game */
export function DlcBadge({ parentId, parentTitle }: { parentId: number; parentTitle: string }) {
  return (
    <Link
      href={`/item/${parentId}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "rgba(46,196,182,0.08)",
        border: "1px solid rgba(46,196,182,0.15)",
        borderRadius: 8, padding: "6px 14px",
        fontSize: 11, color: "#2EC4B6",
        textDecoration: "none", fontWeight: 500,
        marginBottom: 12, transition: "background 0.15s",
      }}
    >
      ← DLC for {parentTitle}
    </Link>
  );
}
