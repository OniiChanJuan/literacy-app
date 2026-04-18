"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { Item, MediaType } from "@/lib/data";
import { TYPES, hexToRgba } from "@/lib/data";

// Mirrors the FilterType defined in src/app/page.tsx so we don't couple to it.
type FilterType = MediaType | "anime";

// ── Hard-pinned grid card stylesheet ──────────────────────────────────────────
// Pure block layout. Every element has an explicit pixel height. No flex,
// no aspect-ratio, no min/max heights, no percentage heights — every size
// is a literal number, so nothing can calculate its own dimensions from
// the image's natural aspect.
//
// Card = block. Cover = block, height 180 (regular) / 374 (featured).
// Cover img = width/height 100% of its block container, object-fit cover.
// Meta = block wrapper with height 60 / 120; its INTERNAL layout is flex
// (for stacking title/score/genre) but that doesn't affect its own size.
const GRID_CSS = `
.picked-regular {
  display: block !important;
  width: 100% !important;
  height: 240px !important;
  overflow: hidden !important;
  border-radius: 10px !important;
  box-sizing: border-box !important;
  position: relative !important;
}
.picked-featured {
  display: block !important;
  width: 100% !important;
  height: 494px !important;
  grid-row: span 2 !important;
  overflow: hidden !important;
  border-radius: 10px !important;
  box-sizing: border-box !important;
  position: relative !important;
}
.picked-regular-cover {
  display: block !important;
  width: 100% !important;
  height: 180px !important;
  overflow: hidden !important;
  position: relative !important;
}
.picked-featured-cover {
  display: block !important;
  width: 100% !important;
  height: 374px !important;
  overflow: hidden !important;
  position: relative !important;
}
.picked-regular-cover > img,
.picked-featured-cover > img {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  object-position: center top !important;
  display: block !important;
}
.picked-regular-meta {
  width: 100% !important;
  height: 60px !important;
  padding: 8px 10px !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
.picked-featured-meta {
  width: 100% !important;
  height: 120px !important;
  padding: 12px 14px !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
`;
import HoverPreview from "./hover-preview";
import { getItemUrl } from "@/lib/slugs";
import { isAnime } from "@/lib/anime";
import { getBestExtScore } from "@/lib/format-ext-score";

interface PickedForYouGridProps {
  /** User's top taste tags (vibes) — used in the subtitle. */
  tasteTags: string[];
  /** Current media-type filter from the page. */
  mediaFilter: FilterType | null;
  /** Called with the raw fetched items so the page can track IDs for dedup. */
  onLoad?: (items: Item[]) => void;
  /** Remount key from page refreshes (For You refresh button). */
  refreshKey?: number;
}

interface FeaturedAgg {
  count: number;
  recPct: number;
}

const FEATURED_AVATAR_COLORS = ["#E84855", "#2EC4B6", "#9B5DE5"];

export default function PickedForYouGrid({
  tasteTags,
  mediaFilter,
  onLoad,
  refreshKey,
}: PickedForYouGridProps) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [featuredAgg, setFeaturedAgg] = useState<FeaturedAgg | null>(null);

  // Fetch 7 items for the grid (1 featured + 6 regular)
  useEffect(() => {
    setFailed(false);
    setItems(null);
    setFeaturedAgg(null);
    let cancelled = false;
    fetch("/api/for-you?section=personalPicks&limit=7")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Item[]) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        setItems(arr);
        onLoad?.(arr);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter by active media filter (same behavior as PaginatedRow).
  // Cover-art sanity filter too, so we don't show broken featured cards.
  const displayed = useMemo(() => {
    if (!items) return null;
    let filtered = items.filter((i) => i.cover && i.cover.startsWith("http"));
    if (mediaFilter === "anime") filtered = filtered.filter(isAnime);
    else if (mediaFilter) filtered = filtered.filter((i) => i.type === mediaFilter);
    return filtered;
  }, [items, mediaFilter]);

  // For the featured item, fetch real aggregate so we can show the
  // community indicator with a real "N with similar taste rated this" count.
  useEffect(() => {
    const featured = displayed?.[0];
    if (!featured) { setFeaturedAgg(null); return; }
    let cancelled = false;
    fetch(`/api/items/${featured.id}/aggregate`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (cancelled) return;
        setFeaturedAgg({
          count: Number(d?.count ?? 0),
          recPct: Number(d?.recPct ?? 0),
        });
      })
      .catch(() => { if (!cancelled) setFeaturedAgg(null); });
    return () => { cancelled = true; };
  }, [displayed]);

  const subtitle = useMemo(() => {
    const top = tasteTags.slice(0, 3);
    if (top.length === 0) return "Matched to your taste profile";
    return `Based on your taste in ${top.join(", ")}`;
  }, [tasteTags]);

  if (failed) return null;
  if (!displayed) return <GridSkeleton />;
  if (displayed.length === 0) return null;

  const [featured, ...rest] = displayed;
  const regulars = rest.slice(0, 6);

  return (
    <section className="picked-for-you-section" style={{ marginBottom: 40 }}>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: GRID_CSS }} />
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        marginBottom: 14, gap: 12,
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 20,
            fontWeight: 500,
            color: "#fff",
            lineHeight: 1.1,
          }}>
            Picked for you
          </div>
          <div style={{ fontSize: 12, color: "rgba(232,230,225,0.25)", marginTop: 4 }}>
            {subtitle}
          </div>
        </div>
        <Link
          href="/explore?sort=picked"
          style={{ fontSize: 12, color: "#2EC4B6", textDecoration: "none", flexShrink: 0 }}
        >
          See all →
        </Link>
      </div>

      {/* Editorial grid. Row heights are fixed so every regular card has
          identical dimensions (cover + meta) and the featured card's
          column spans both rows for a total height of 2*row + gap. */}
      <div
        className="picked-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr 1fr 1fr",
          // Rows are explicitly fixed at 240px so every regular card
          // cell is identical regardless of content; featured spans both.
          gridTemplateRows: "240px 240px",
          gap: 14,
          width: "100%",
        }}
      >
        {featured && <FeaturedCard item={featured} agg={featuredAgg} />}
        {regulars.map((it) => (
          <RegularCard key={it.id} item={it} />
        ))}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .picked-grid {
            grid-template-columns: 1fr 1fr !important;
            grid-template-rows: auto auto auto auto !important;
          }
          .picked-featured {
            grid-column: span 2 !important;
            grid-row: auto !important;
          }
        }
        @media (max-width: 480px) {
          .picked-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto !important;
          }
          .picked-featured {
            grid-column: auto !important;
          }
        }
      `}</style>
    </section>
  );
}

// ─── Featured card (1.3fr column, spans both rows) ───────────────────────────

function FeaturedCard({ item, agg }: { item: Item; agg: FeaturedAgg | null }) {
  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const href = getItemUrl(item);
  const best = getBestExtScore(item.ext, item.voteCount ?? 0);

  // Numeric score path → 0-5 Literacy scale + liked %
  const numeric = best && best.kind === "numeric"
    ? {
        normalized10: (best.value / best.max) * 10,
        display: `${best.valueStr} ${best.label}`,
      }
    : null;
  const literacyScore = numeric ? Math.min(5, numeric.normalized10 * 0.55).toFixed(1) : null;
  const recPct = agg && agg.count > 0
    ? agg.recPct
    : numeric
      ? Math.min(99, Math.round(numeric.normalized10 * 10.5))
      : null;
  const steamBest = best && best.kind === "steam-text" ? best : null;
  const communityCount = agg?.count ?? 0;

  return (
    <HoverPreview item={item}>
      <Link
        href={href}
        className="picked-featured"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          cursor: "pointer",
          textDecoration: "none",
          color: "inherit",
          transition: "transform 200ms, border-color 200ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)";
        }}
      >
        <div
          className="picked-featured-cover"
          style={{
            background: `linear-gradient(135deg, ${hexToRgba(t.color, 0.12)}, ${hexToRgba(t.color, 0.04)})`,
          }}
        >
          {item.cover && item.cover.startsWith("http") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover}
              alt={item.title}
              loading="lazy"
              decoding="async"
            />
          )}

          {/* Type badge */}
          <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 4 }}>
            <span style={{
              background: hexToRgba(t.color, 0.88),
              color: "#fff",
              fontSize: 9,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 5,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}>
              {t.label.replace(/s$/, "")}
            </span>
            {isAnime(item) && (
              <span style={{
                background: "rgba(255,107,107,0.88)",
                color: "#fff",
                fontSize: 9,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 5,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}>
                ANIME
              </span>
            )}
          </div>
        </div>

        <div
          className="picked-featured-meta"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            fontWeight: 600,
            color: "#fff",
            lineHeight: 1.2,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}>
            {item.title}
          </div>

          <div style={{
            fontSize: 11,
            color: "rgba(232,230,225,0.25)",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minHeight: 14,
          }}>
            {item.genre && item.genre.length > 0 ? item.genre.slice(0, 3).join(" · ") : ""}
          </div>

          {/* Score row — larger than regular cards */}
          {literacyScore ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#2EC4B6", lineHeight: 1 }}>
                {literacyScore}
              </span>
              <div style={{
                flex: 1, minWidth: 0,
                height: 4, background: "rgba(255,255,255,0.05)",
                borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, (parseFloat(literacyScore) / 5) * 100))}%`,
                  height: "100%", background: "#2EC4B6", borderRadius: 2,
                }} />
              </div>
              {recPct !== null && (
                <span style={{ fontSize: 12, color: "rgba(232,230,225,0.35)", lineHeight: 1 }}>
                  {recPct}%
                </span>
              )}
            </div>
          ) : steamBest ? (
            <div style={{
              fontSize: 14, fontWeight: 700, color: steamBest.color, lineHeight: 1.2,
            }}>
              {steamBest.textLabel} <span style={{ color: "rgba(232,230,225,0.35)", fontWeight: 400, fontSize: 11 }}>· Steam</span>
            </div>
          ) : null}

          {/* Community indicator — only on featured */}
          {communityCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex" }} aria-hidden>
                {FEATURED_AVATAR_COLORS.map((c, i) => (
                  <span
                    key={c}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: c,
                      border: "1.5px solid var(--bg-card, #141419)",
                      marginLeft: i === 0 ? 0 : -4,
                    }}
                  />
                ))}
              </div>
              <span style={{
                fontSize: 10,
                color: "rgba(232,230,225,0.3)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {communityCount} with similar taste rated this
              </span>
            </div>
          )}
        </div>
      </Link>
    </HoverPreview>
  );
}

// ─── Regular card (fills remaining 6 slots) ──────────────────────────────────

function RegularCard({ item }: { item: Item }) {
  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const href = getItemUrl(item);
  const best = getBestExtScore(item.ext, item.voteCount ?? 0);

  const numeric = best && best.kind === "numeric"
    ? {
        normalized10: (best.value / best.max) * 10,
      }
    : null;
  const literacyScore = numeric ? Math.min(5, numeric.normalized10 * 0.55).toFixed(1) : null;
  const recPct = numeric ? Math.min(99, Math.round(numeric.normalized10 * 10.5)) : null;
  const steamBest = best && best.kind === "steam-text" ? best : null;

  return (
    <HoverPreview item={item}>
      <Link
        href={href}
        className="picked-regular"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          cursor: "pointer",
          textDecoration: "none",
          color: "inherit",
          transition: "transform 200ms, border-color 200ms",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)";
        }}
      >
        <div
          className="picked-regular-cover"
          style={{
            background: `linear-gradient(135deg, ${hexToRgba(t.color, 0.12)}, ${hexToRgba(t.color, 0.04)})`,
          }}
        >
          {item.cover && item.cover.startsWith("http") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover}
              alt={item.title}
              loading="lazy"
              decoding="async"
            />
          )}

          {/* Type badge */}
          <div style={{ position: "absolute", top: 6, left: 6, display: "flex", gap: 3 }}>
            <span style={{
              background: hexToRgba(t.color, 0.85),
              color: "#fff",
              fontSize: 8,
              fontWeight: 500,
              padding: "2px 6px",
              borderRadius: 4,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}>
              {t.label.replace(/s$/, "")}
            </span>
            {isAnime(item) && (
              <span style={{
                background: "rgba(255,107,107,0.85)",
                color: "#fff",
                fontSize: 8,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 4,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}>
                ANIME
              </span>
            )}
          </div>
        </div>

        <div
          className="picked-regular-meta"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#fff",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {item.title}
          </div>

          {literacyScore ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, height: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#2EC4B6", lineHeight: 1 }}>
                {literacyScore}
              </span>
              <div style={{
                flex: 1, minWidth: 0,
                height: 3, background: "rgba(255,255,255,0.05)",
                borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, (parseFloat(literacyScore) / 5) * 100))}%`,
                  height: "100%", background: "#2EC4B6", borderRadius: 2,
                }} />
              </div>
              {recPct !== null && (
                <span style={{ fontSize: 10, color: "rgba(232,230,225,0.25)", lineHeight: 1 }}>
                  {recPct}%
                </span>
              )}
            </div>
          ) : steamBest ? (
            <div style={{
              fontSize: 11, fontWeight: 700, color: steamBest.color, lineHeight: 1.2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", height: 14,
            }}>
              {steamBest.textLabel}
            </div>
          ) : (
            /* No-score placeholder preserves the score row height so cards align */
            <div style={{ fontSize: 14, color: "rgba(232,230,225,0.2)", lineHeight: 1, height: 14 }}>—</div>
          )}

          <div style={{
            fontSize: 11,
            color: "rgba(232,230,225,0.25)",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            height: 13,
            // Non-breaking space ensures the line keeps its height when genre is missing
          }}>
            {item.genre && item.genre.length > 0 ? item.genre.slice(0, 2).join(" · ") : "\u00A0"}
          </div>
        </div>
      </Link>
    </HoverPreview>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14,
      }}>
        <div>
          <div style={{
            width: 140, height: 22, background: "rgba(255,255,255,0.06)", borderRadius: 6,
          }} />
          <div style={{
            width: 200, height: 14, background: "rgba(255,255,255,0.04)", borderRadius: 6,
            marginTop: 6,
          }} />
        </div>
      </div>
      <div
        className="picked-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr 1fr 1fr",
          gridTemplateRows: "240px 240px",
          gap: 14,
          width: "100%",
        }}
      >
        <div className="picked-featured" style={{
          gridRow: "span 2",
          background: "rgba(255,255,255,0.02)",
          borderRadius: 10,
        }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.02)",
            borderRadius: 10,
          }} />
        ))}
      </div>
      <style>{`
        @media (max-width: 768px) {
          .picked-grid {
            grid-template-columns: 1fr 1fr !important;
            grid-template-rows: auto auto auto auto !important;
          }
          .picked-featured {
            grid-column: span 2 !important;
            grid-row: auto !important;
            min-height: 360px !important;
          }
        }
        @media (max-width: 480px) {
          .picked-grid { grid-template-columns: 1fr !important; grid-template-rows: auto !important; }
          .picked-featured { grid-column: auto !important; min-height: 360px !important; }
        }
      `}</style>
    </section>
  );
}
