"use client";

import Image from "next/image";
import Link from "next/link";

interface DlcItem {
  id: number;
  title: string;
  type: string;
  year: number;
  cover: string;
  slug?: string | null;
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

function formatScore(score: number, max: number): string {
  if (max === 100) return `${Math.round(score)}`;
  if (max === 10) return score.toFixed(1);
  if (max === 5) return score.toFixed(1);
  return `${Math.round(score)}`;
}

function getSubtypeLabel(subtype: string | null): string {
  if (subtype === "expansion") return "Expansion";
  if (subtype === "edition") return "Edition";
  if (subtype === "season_pass") return "Season Pass";
  return "DLC";
}

function getSubtypeColor(subtype: string | null): string {
  if (subtype === "edition") return "#9B5DE5";
  if (subtype === "expansion") return "#F9A620";
  return "#2EC4B6";
}

export default function DlcSection({ dlcs, baseGameTitle, typeColor }: DlcSectionProps) {
  if (dlcs.length === 0) return null;

  const editions = dlcs.filter((d) => d.itemSubtype === "edition");
  const expansions = dlcs.filter((d) => d.itemSubtype === "expansion");
  const dlcItems = dlcs.filter((d) => d.itemSubtype !== "edition" && d.itemSubtype !== "expansion");

  const parts: string[] = [];
  if (dlcItems.length > 0) parts.push(`${dlcItems.length} DLC${dlcItems.length !== 1 ? "s" : ""}`);
  if (expansions.length > 0) parts.push(`${expansions.length} expansion${expansions.length !== 1 ? "s" : ""}`);
  if (editions.length > 0) parts.push(`${editions.length} edition${editions.length !== 1 ? "s" : ""}`);
  const countLabel = parts.join(", ");

  // Section title adapts to what's present
  const hasEditions = editions.length > 0;
  const hasDlcs = dlcItems.length > 0 || expansions.length > 0;
  let sectionTitle = "DLC & Expansions";
  if (hasEditions && hasDlcs) sectionTitle = "DLC, Expansions & Editions";
  else if (hasEditions && !hasDlcs) sectionTitle = "Editions";

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
            {sectionTitle}
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

      {/* Cards row */}
      <div style={{
        display: "flex", flexWrap: "nowrap", gap: 12, overflowX: "auto", scrollbarWidth: "none" as any,
        paddingBottom: 4,
      }}>
        {dlcs.map((dlc) => {
          const hasImage = dlc.cover?.startsWith("http");
          const subtypeLabel = getSubtypeLabel(dlc.itemSubtype);
          const subtypeColor = getSubtypeColor(dlc.itemSubtype);
          const isEdition = dlc.itemSubtype === "edition";

          return (
            <Link
              key={dlc.id}
              href={dlc.slug ? `/game/${dlc.slug}` : `/item/${dlc.id}`}
              style={{
                flex: "0 0 150px", width: 150, borderRadius: 8,
                overflow: "hidden", textDecoration: "none",
                border: `0.5px solid ${isEdition ? "rgba(155,93,229,0.15)" : "rgba(255,255,255,0.08)"}`,
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
                  background: "rgba(0,0,0,0.85)",
                  color: subtypeColor,
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

                {isEdition ? (
                  <div style={{ fontSize: 8, color: "rgba(155,93,229,0.5)" }}>
                    Same game, all content
                  </div>
                ) : dlc.bestScore ? (
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>
                    <span style={{ color: scoreColor(dlc.bestScore.score, dlc.bestScore.maxScore), fontWeight: 600 }}>
                      {formatScore(dlc.bestScore.score, dlc.bestScore.maxScore)}
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

/** Badge shown on DLC/edition detail pages linking back to the base game */
export function DlcBadge({ parentId, parentTitle, subtype }: { parentId: number; parentTitle: string; subtype?: string | null }) {
  const isEdition = subtype === "edition";
  const label = isEdition ? "Edition of" : "DLC for";
  const color = isEdition ? "#9B5DE5" : "#2EC4B6";

  return (
    <Link
      href={`/item/${parentId}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: isEdition ? "rgba(155,93,229,0.08)" : "rgba(46,196,182,0.08)",
        border: `1px solid ${isEdition ? "rgba(155,93,229,0.15)" : "rgba(46,196,182,0.15)"}`,
        borderRadius: 8, padding: "6px 14px",
        fontSize: 11, color,
        textDecoration: "none", fontWeight: 500,
        marginBottom: 12, transition: "background 0.15s",
      }}
    >
      ← {label} {parentTitle}
    </Link>
  );
}
