"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import type { Item, MediaType } from "@/lib/data";
import { TYPES, hexToRgba } from "@/lib/data";
import HoverPreview from "./hover-preview";
import { getItemUrl } from "@/lib/slugs";
import { isAnime } from "@/lib/anime";
import { getBestExtScore } from "@/lib/format-ext-score";
import { framePickedForYou } from "@/lib/section-framing";

// Mirrors the FilterType defined in src/app/page.tsx
type FilterType = MediaType | "anime";

interface PickedForYouGridProps {
  /** User's top taste tags (vibes) — used in the subtitle. */
  tasteTags: string[];
  /** Current media-type filter from the page. */
  mediaFilter: FilterType | null;
  /** Called with raw fetched items so the page can track IDs for dedup. */
  onLoad?: (items: Item[]) => void;
  /** Remount key from page refreshes. */
  refreshKey?: number;
  /** Empty-state CTA: clear the active filter on the parent page. */
  onClearFilter?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

// Stashed alongside items so commit 3 can use it for honest labeling.
interface ResultMeta {
  composition: { personal: number; popular: number };
  filterType: string | null;
}

export default function PickedForYouGrid({
  tasteTags, mediaFilter, onLoad, refreshKey, onClearFilter,
}: PickedForYouGridProps) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [meta, setMeta] = useState<ResultMeta | null>(null);
  const [failed, setFailed] = useState(false);

  // Refetch on filter / refresh change. Filter changes are debounced 250ms
  // so rapid pill-clicking ("try every type quickly") fires one request
  // after the user settles, not one per click.
  useEffect(() => {
    let cancelled = false;
    let aborter: AbortController | null = null;

    const debounceMs = mediaFilter === null ? 0 : 250;
    const timer = setTimeout(() => {
      setFailed(false);
      setItems(null);
      setMeta(null);
      aborter = new AbortController();

      // Always pass &type=, including empty for the no-filter case, so the
      // backend returns the v2 object shape consistently. CSS hides extras
      // on smaller viewports — same total fetch (9) as before.
      const typeParam = mediaFilter ?? "";
      const url = `/api/for-you?section=personalPicks&limit=9&type=${encodeURIComponent(typeParam)}`;

      fetch(url, { signal: aborter.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((data: any) => {
          if (cancelled) return;
          // v2 shape: { items, composition, filterType }
          // v1 shape: Item[] (unchanged backwards-compat path; not hit
          // anymore since we always pass type, but kept defensive).
          const arr: Item[] = Array.isArray(data)
            ? data
            : (Array.isArray(data?.items) ? data.items : []);
          const compositionMeta: ResultMeta = Array.isArray(data)
            ? { composition: { personal: arr.length, popular: 0 }, filterType: null }
            : {
                composition: data?.composition ?? { personal: arr.length, popular: 0 },
                filterType: data?.filterType ?? null,
              };
          setItems(arr);
          setMeta(compositionMeta);
          onLoad?.(arr);
        })
        .catch((e) => {
          // AbortError is expected when filter changes mid-request.
          if (e?.name === "AbortError") return;
          if (!cancelled) setFailed(true);
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      aborter?.abort();
    };
  }, [refreshKey, mediaFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Server-side filtered now — only enforce the cover-art sanity filter
  // here. Type filter no longer happens client-side.
  const displayed = useMemo(() => {
    if (!items) return null;
    return items.filter((i) => i.cover && i.cover.startsWith("http"));
  }, [items]);

  // Honest section framing — title/subtitle/see-all driven by composition.
  // See src/lib/section-framing.ts for the platform-wide principle.
  const framing = useMemo(() => framePickedForYou(
    meta?.composition ?? { personal: items?.length ?? 0, popular: 0 },
    { filterType: meta?.filterType ?? mediaFilter ?? null, tasteTags, target: 9 },
  ), [meta, mediaFilter, tasteTags, items]);

  if (failed) return null;
  if (!displayed) return <GridSkeleton headerTitle={framing.title} headerSubtitle={framing.subtitle} seeAllHref={framing.seeAllHref} />;

  // Empty state — filter active AND no items returned. Render an
  // intentional message instead of collapsing the section.
  if (displayed.length === 0) {
    if (!mediaFilter) return null; // unfiltered + empty = something else is wrong; hide.
    return (
      <section style={{ marginBottom: "clamp(24px, 3vw, 40px)" }}>
        <Header title={framing.title} subtitle={framing.subtitle} seeAllHref={framing.seeAllHref} />
        <EmptyState filterLabel={mediaFilter} onClear={onClearFilter} />
      </section>
    );
  }

  const featured = displayed[0];
  const regulars = displayed.slice(1, 7);
  const mobileItems = displayed.slice(0, 5); // 1 banner + 4 row cards

  return (
    <section style={{ marginBottom: "clamp(24px, 3vw, 40px)" }}>
      <Header title={framing.title} subtitle={framing.subtitle} seeAllHref={framing.seeAllHref} />

      {/* Desktop/tablet grid — fixed-pixel rows so every cell is 240px tall.
          Hidden on mobile via .picked-grid-wrap. */}
      <div
        className="picked-grid-wrap picked-grid-wrap-desktop"
        style={{ width: "100%" }}
      >
        <div
          className="picked-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr 1fr 1fr",
            gridTemplateRows: "240px 240px",
            gap: 14,
            width: "100%",
            // Belt-and-suspenders: if anything inside tries to overflow the
            // grid's cell height, it gets clipped here before it can bleed
            // into the next section below.
            overflow: "hidden",
          }}
        >
          {/* Featured — wrapped in a span-2 div so the card inside can use
              height: 100% against an outer fixed pixel height of 494. */}
          <div className="picked-grid-featured-cell" style={{ gridRow: "span 2", minHeight: 0, overflow: "hidden" }}>
            <EditorialCard item={featured} featured />
          </div>
          {regulars.map((it) => (
            <EditorialCard key={it.id} item={it} />
          ))}
        </div>
      </div>

      {/* Mobile stack — 1 full-width banner + 4 row-cards. Hidden ≥640px. */}
      <div className="picked-mobile-stack">
        <div className="picked-mobile-banner-wrap">
          <EditorialCard item={mobileItems[0]} featured />
        </div>
        {mobileItems.slice(1).map((it) => (
          <div key={it.id} className="picked-mobile-row-wrap">
            <EditorialCard item={it} mobileRow />
          </div>
        ))}
      </div>

      <style>{`
        /* Default (≥640px): desktop grid shows, mobile stack hidden */
        .picked-mobile-stack { display: none; }

        @media (max-width: 768px) {
          .picked-grid {
            grid-template-columns: 1fr 1fr !important;
            grid-template-rows: repeat(4, 240px) !important;
          }
          .picked-grid-featured-cell {
            grid-column: span 2 !important;
            grid-row: auto !important;
            height: 360px;
          }
        }
        @media (max-width: 639px) {
          .picked-grid-wrap-desktop { display: none !important; }
          .picked-mobile-stack {
            display: flex !important;
            flex-direction: column;
            gap: 10px;
            width: 100%;
          }
          .picked-mobile-banner-wrap {
            width: 100%;
            height: 280px;
          }
          .picked-mobile-row-wrap {
            width: 100%;
            height: 96px;
          }
        }
      `}</style>
    </section>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header({
  title,
  subtitle,
  seeAllHref,
}: {
  title: string;
  subtitle: string;
  seeAllHref: string;
}) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginBottom: 14,
      gap: 12,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 500,
          color: "#fff",
          lineHeight: 1.1,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 12,
          color: "rgba(232,230,225,0.25)",
          marginTop: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {subtitle}
        </div>
      </div>
      <Link
        href={seeAllHref}
        style={{ fontSize: 12, color: "#2EC4B6", textDecoration: "none", flexShrink: 0 }}
      >
        See all →
      </Link>
    </div>
  );
}

// ── Empty state — filter active but no items returned ──────────────────────
function EmptyState({
  filterLabel,
  onClear,
}: {
  filterLabel: string;
  onClear?: () => void;
}) {
  // Friendly noun for the type pill the user clicked.
  const FRIENDLY_TYPE: Record<string, string> = {
    movie: "Movies", tv: "Shows", anime: "Anime",
    book: "Books", manga: "Manga", comic: "Comics",
    game: "Games", music: "Music", podcast: "Podcasts",
  };
  const label = FRIENDLY_TYPE[filterLabel] ?? filterLabel;
  return (
    <div
      style={{
        // Match the typical grid section height so the page doesn't jump
        // when the section toggles between full / empty states.
        minHeight: 240,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "32px 20px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 14, color: "rgba(232,230,225,0.55)" }}>
        No picks match <strong style={{ color: "#fff" }}>{label}</strong> right now.
      </div>
      {onClear && (
        <button
          onClick={onClear}
          style={{
            border: "1px solid rgba(46,196,182,0.3)",
            background: "rgba(46,196,182,0.08)",
            color: "#2EC4B6",
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            minHeight: 36,
          }}
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

// ── Editorial card — ONE component for both featured and regular ────────────

function EditorialCard({
  item,
  featured = false,
  mobileRow = false,
}: {
  item: Item;
  featured?: boolean;
  mobileRow?: boolean;
}) {
  const href = getItemUrl(item);
  const t = TYPES[item.type] || { color: "#888", icon: "?", label: "Unknown" };
  const best = getBestExtScore(item.ext, item.voteCount ?? 0);

  const numeric = best && best.kind === "numeric"
    ? { normalized10: (best.value / best.max) * 10 }
    : null;
  const literacyScore = numeric ? Math.min(5, numeric.normalized10 * 0.55).toFixed(1) : null;
  const literacyNum = literacyScore ? parseFloat(literacyScore) : 0;
  const recPct = numeric ? Math.min(99, Math.round(numeric.normalized10 * 10.5)) : null;
  const steamBest = best && best.kind === "steam-text" ? best : null;

  const metaHeight = featured ? 80 : 60;
  const titleSize = featured ? 16 : 13;
  const scoreSize = featured ? 14 : 12;

  // Mobile row-card variant: 72px cover on the left, flex:1 meta on the
  // right. Override all the stack-layout rules.
  if (mobileRow) {
    return (
      <Link
        href={href}
        style={{
          display: "flex",
          flexDirection: "row",
          width: "100%",
          height: "100%",
          borderRadius: 10,
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          textDecoration: "none",
          color: "inherit",
          cursor: "pointer",
          boxSizing: "border-box",
        }}
      >
        {/* Cover — 72px wide, full-height */}
        <div style={{
          position: "relative",
          width: 72,
          height: "100%",
          flexShrink: 0,
          overflow: "hidden",
          background: `linear-gradient(135deg, ${hexToRgba(t.color, 0.12)}, ${hexToRgba(t.color, 0.04)})`,
        }}>
          {item.cover?.startsWith("http") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.cover}
              alt={item.title}
              loading="lazy"
              decoding="async"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
                display: "block",
              }}
            />
          )}
          <span style={{
            position: "absolute",
            top: 4,
            left: 4,
            background: hexToRgba(t.color, 0.88),
            color: "#fff",
            fontSize: 7,
            fontWeight: 600,
            padding: "2px 5px",
            borderRadius: 3,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}>
            {t.label.replace(/s$/, "")}
          </span>
        </div>

        {/* Meta — title + score + genre, vertically centered */}
        <div style={{
          flex: 1,
          minWidth: 0,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 4,
        }}>
          <div style={{
            fontSize: 14,
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
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#2EC4B6", lineHeight: 1 }}>
                {literacyScore}
              </span>
              <div style={{
                flex: 1, minWidth: 0, height: 3,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, (literacyNum / 5) * 100))}%`,
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
              fontSize: 11, fontWeight: 700, color: steamBest.color,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {steamBest.textLabel}
            </div>
          ) : null}
          {item.genre && item.genre.length > 0 && (
            <div style={{
              fontSize: 11,
              color: "rgba(232,230,225,0.2)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {item.genre.slice(0, 2).join(" · ")}
            </div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <HoverPreview item={item} fill>
      <Link
        href={href}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          borderRadius: 10,
          overflow: "hidden",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          textDecoration: "none",
          color: "inherit",
          cursor: "pointer",
          transition: "transform 200ms, border-color 200ms",
          boxSizing: "border-box",
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
        {/* Cover — height is whatever remains after the fixed meta.
            Editorial blurred-backdrop treatment: the cover container is
            landscape-ish on regulars (~260 × 180) but most cover art is
            portrait. object-fit: cover would slice off faces and titles.
            Instead: show the art contained with a blurred copy of itself
            filling the letterbox space. No pixel of the art is cropped. */}
        <div
          style={{
            width: "100%",
            height: `calc(100% - ${metaHeight}px)`,
            overflow: "hidden",
            position: "relative",
            background: `linear-gradient(135deg, ${hexToRgba(t.color, 0.12)}, ${hexToRgba(t.color, 0.04)})`,
          }}
        >
          {item.cover?.startsWith("http") && (
            <>
              {/* Blurred backdrop — same src, heavily blurred, scaled up
                  to hide blur edge fade. aria-hidden because the art
                  itself is announced by the main <img> below. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.cover}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center",
                  filter: "blur(24px) saturate(1.2)",
                  transform: "scale(1.15)",
                  transformOrigin: "center",
                  display: "block",
                }}
              />
              {/* Dark overlay so the contained art and badges stay
                  legible regardless of how bright the backdrop is. */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.35)",
                }}
              />
              {/* Main artwork — contained so nothing is cropped. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.cover}
                alt={item.title}
                loading="lazy"
                decoding="async"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "center",
                  display: "block",
                }}
              />
            </>
          )}

          {/* Type badge — sits above the art via DOM order */}
          <div style={{
            position: "absolute",
            top: featured ? 10 : 6,
            left: featured ? 10 : 6,
            display: "flex",
            gap: featured ? 4 : 3,
            zIndex: 1,
          }}>
            <span style={{
              background: hexToRgba(t.color, 0.88),
              color: "#fff",
              fontSize: featured ? 9 : 8,
              fontWeight: featured ? 600 : 500,
              padding: featured ? "3px 8px" : "2px 6px",
              borderRadius: featured ? 5 : 4,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}>
              {t.label.replace(/s$/, "")}
            </span>
            {isAnime(item) && (
              <span style={{
                background: "rgba(255,107,107,0.88)",
                color: "#fff",
                fontSize: featured ? 9 : 8,
                fontWeight: featured ? 600 : 500,
                padding: featured ? "3px 8px" : "2px 6px",
                borderRadius: featured ? 5 : 4,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}>
                ANIME
              </span>
            )}
          </div>
        </div>

        {/* Meta — exact pixel height. */}
        <div style={{
          width: "100%",
          height: metaHeight,
          padding: featured ? "10px 14px" : "8px 10px",
          overflow: "hidden",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          {/* Title */}
          <div style={{
            fontFamily: featured ? "var(--font-serif)" : undefined,
            fontSize: titleSize,
            fontWeight: featured ? 600 : 500,
            color: "#fff",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {item.title}
          </div>

          {/* Score row */}
          {literacyScore ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontSize: scoreSize,
                fontWeight: 700,
                color: "#2EC4B6",
                lineHeight: 1,
              }}>
                {literacyScore}
              </span>
              <div style={{
                flex: 1,
                minWidth: 0,
                height: 3,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 2,
                overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, (literacyNum / 5) * 100))}%`,
                  height: "100%",
                  background: "#2EC4B6",
                  borderRadius: 2,
                }} />
              </div>
              {recPct !== null && (
                <span style={{
                  fontSize: 10,
                  color: "rgba(232,230,225,0.25)",
                  lineHeight: 1,
                }}>
                  {recPct}%
                </span>
              )}
            </div>
          ) : steamBest ? (
            <div style={{
              fontSize: featured ? 13 : 11,
              fontWeight: 700,
              color: steamBest.color,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {steamBest.textLabel}
            </div>
          ) : (
            <div style={{
              fontSize: scoreSize,
              color: "rgba(232,230,225,0.2)",
              lineHeight: 1,
            }}>
              —
            </div>
          )}

          {/* Genre */}
          <div style={{
            fontSize: featured ? 11 : 10,
            color: "rgba(232,230,225,0.2)",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {item.genre && item.genre.length > 0
              ? item.genre.slice(0, featured ? 3 : 2).join(" · ")
              : "\u00A0"}
          </div>
        </div>
      </Link>
    </HoverPreview>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function GridSkeleton({
  headerTitle = "Picked for you",
  headerSubtitle = "Loading your picks…",
  seeAllHref = "/explore?sort=picked",
}: {
  headerTitle?: string;
  headerSubtitle?: string;
  seeAllHref?: string;
} = {}) {
  return (
    <section style={{ marginBottom: "clamp(24px, 3vw, 40px)" }}>
      <Header title={headerTitle} subtitle={headerSubtitle} seeAllHref={seeAllHref} />
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
        <div
          className="picked-grid-featured-cell"
          style={{
            gridRow: "span 2",
            background: "rgba(255,255,255,0.02)",
            borderRadius: 10,
          }}
        />
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255,255,255,0.02)",
              borderRadius: 10,
            }}
          />
        ))}
      </div>
    </section>
  );
}
