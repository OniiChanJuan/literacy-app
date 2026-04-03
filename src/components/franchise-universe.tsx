"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { TYPES, hexToRgba } from "@/lib/data";

interface FranchiseItemData {
  id: number;
  title: string;
  type: string;
  year: number;
  cover: string;
  slug?: string | null;
  isUpcoming: boolean;
  releaseDate: string | null;
  score: { label: string; display: string; value: number } | null;
}

interface UniverseSeries {
  id: number;
  name: string;
  icon: string;
  itemCount: number;
  firstCover: string | null;
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
  siblingFranchises: UniverseSeries[];
  childFranchises: UniverseSeries[];
  communityAverage: number | null;
  totalVotes: number;
}

function scoreColor(val: number): string {
  if (val >= 8.0) return "#2EC4B6";
  if (val >= 6.0) return "#F9A620";
  return "#E84855";
}

export default function FranchiseUniverse({ itemId }: { itemId: number }) {
  const [franchise, setFranchise] = useState<FranchiseData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    fetch(`/api/franchises?itemId=${itemId}`)
      .then((r) => r.json())
      .then((data) => { setFranchise(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [itemId]);

  useEffect(() => {
    if (!franchise?.id) return;
    fetch(`/api/franchises/${franchise.id}/follow`)
      .then((r) => r.json())
      .then((d) => { if (d.following !== undefined) setFollowing(d.following); })
      .catch(() => {});
  }, [franchise?.id]);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    const t = setTimeout(checkScroll, 200);
    el.addEventListener("scroll", checkScroll, { passive: true });
    const mo = new MutationObserver(() => setTimeout(checkScroll, 50));
    mo.observe(el, { childList: true });
    return () => { el.removeEventListener("scroll", checkScroll); clearTimeout(t); mo.disconnect(); };
  }, [checkScroll, franchise]);

  async function toggleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    if (!session) { router.push("/auth/signin"); return; }
    if (!franchise) return;
    setFollowLoading(true);
    const was = following;
    setFollowing(!was);
    try {
      const res = await fetch(`/api/franchises/${franchise.id}/follow`, { method: "POST" });
      const json = await res.json();
      if (res.ok) setFollowing(json.following);
      else setFollowing(was);
    } catch { setFollowing(was); }
    finally { setFollowLoading(false); }
  }

  if (!loaded || !franchise) return null;

  // Deduplicate items
  const seen = new Set<string>();
  const deduped = franchise.otherItems.filter((item) => {
    const norm = item.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const key = `${norm}::${item.type}::${item.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length === 0 && franchise.siblingFranchises.length === 0 && franchise.childFranchises.length === 0) return null;

  // Determine which sections to show
  // hasSiblings: show parent universe card (franchise has a parent + sibling series exist)
  const hasSiblings = franchise.parentFranchise != null && franchise.siblingFranchises.length > 0;
  // hasChildren: show "sub-series in this universe" card (franchise IS the top-level universe)
  const hasChildren = !franchise.parentFranchise && franchise.childFranchises.length > 0;
  const showUniverseCard = hasSiblings || hasChildren;

  // The universe name + id for the card header
  const universeName = hasSiblings ? franchise.parentFranchise!.name : franchise.name;
  const universeId = hasSiblings ? franchise.parentFranchise!.id : franchise.id;
  const universeSeries = hasSiblings ? franchise.siblingFranchises : franchise.childFranchises;

  const typeLabel = franchise.mediaTypes === 1
    ? `${franchise.totalItems} ${deduped[0]?.type === "book" ? "books" : deduped[0]?.type === "game" ? "games" : deduped[0]?.type === "manga" ? "volumes" : "entries"} in this series`
    : `${franchise.totalItems} entries across ${franchise.mediaTypes} media`;

  const VISIBLE_SIBLINGS = 4;
  const visibleSeries = universeSeries.slice(0, VISIBLE_SIBLINGS);
  const moreSeries = universeSeries.length - VISIBLE_SIBLINGS;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* ── SERIES SECTION ─────────────────────────────────── */}
      {deduped.length > 0 && (
        <section style={{
          background: `linear-gradient(135deg, ${franchise.color}0F, ${franchise.color}0A)`,
          border: `0.5px solid ${franchise.color}1F`,
          borderRadius: showUniverseCard ? "10px 10px 0 0" : 10,
          padding: 14,
          overflow: "hidden",
          boxSizing: "border-box",
        }}>
          {/* Series header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{franchise.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {franchise.name}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                  {typeLabel}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
              {/* Follow button */}
              <button
                onClick={toggleFollow}
                disabled={followLoading}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 14px", borderRadius: 7, cursor: "pointer",
                  fontSize: 11, fontWeight: 500, transition: "all 0.15s",
                  background: following ? "rgba(232,72,85,0.15)" : "rgba(232,72,85,0.08)",
                  border: following ? "0.5px solid rgba(232,72,85,0.4)" : "0.5px solid rgba(232,72,85,0.2)",
                  color: "#E84855",
                  opacity: followLoading ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { if (!followLoading) e.currentTarget.style.background = "rgba(232,72,85,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = following ? "rgba(232,72,85,0.15)" : "rgba(232,72,85,0.08)"; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill={following ? "#E84855" : "none"} stroke="#E84855" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {following ? "Following" : "Follow"}
              </button>

              {/* Divider */}
              <span style={{ width: 0.5, height: 16, background: "rgba(255,255,255,0.06)", display: "inline-block", flexShrink: 0 }} />

              {/* Explore series link */}
              <a
                href={`/franchise/${franchise.id}`}
                style={{ fontSize: 12, color: "#2EC4B6", textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap" }}
                onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
              >
                Explore series →
              </a>

              {/* Scroll arrows */}
              {[canScrollLeft, canScrollRight].map((show, i) => (
                <button
                  key={i}
                  onClick={() => scrollRef.current?.scrollBy({ left: i === 0 ? -300 : 300, behavior: "smooth" })}
                  style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.4)", cursor: show ? "pointer" : "default",
                    fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                    visibility: show ? "visible" : "hidden",
                    pointerEvents: show ? "auto" : "none",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { if (show) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={(e) => { if (show) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                >
                  {i === 0 ? "←" : "→"}
                </button>
              ))}
            </div>
          </div>

          {/* Horizontal scroll row */}
          <div
            ref={scrollRef}
            className="scrollbar-hide"
            style={{ display: "flex", flexWrap: "nowrap", gap: 10, overflowX: "auto", paddingBottom: 2 }}
          >
            {deduped.map((item) => (
              <MiniCard
                key={item.id}
                item={item}
                franchiseName={franchise.name}
                onClick={() => router.push(item.slug ? `/${item.type}/${item.slug}` : `/item/${item.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── PARENT UNIVERSE CARD ──────────────────────────── */}
      {showUniverseCard && (
        <div style={{
          background: "rgba(155,93,229,0.04)",
          border: "0.5px solid rgba(155,93,229,0.12)",
          borderRadius: deduped.length > 0 ? "0 0 10px 10px" : 10,
          borderTop: deduped.length > 0 ? "none" : undefined,
          padding: "12px 16px",
          boxSizing: "border-box",
        }}>
          {/* Card header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: visibleSeries.length > 0 ? 10 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {/* Globe icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B5DE5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#9B5DE5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Part of {universeName}
                </div>
              </div>
            </div>
            <a
              href={`/franchise/${universeId}`}
              style={{ fontSize: 12, color: "#9B5DE5", textDecoration: "none", fontWeight: 500, flexShrink: 0, marginLeft: 12 }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              Explore universe →
            </a>
          </div>

          {/* Sibling / child series cards */}
          {visibleSeries.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", overflowX: "auto", flexWrap: "nowrap" }} className="scrollbar-hide">
              {visibleSeries.map((series) => (
                <SeriesChip key={series.id} series={series} onClick={() => router.push(`/franchise/${series.id}`)} />
              ))}
              {moreSeries > 0 && (
                <span style={{ fontSize: 11, color: "rgba(155,93,229,0.35)", whiteSpace: "nowrap", paddingLeft: 4, flexShrink: 0 }}>
                  +{moreSeries} more series
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Series chip (compact card in the universe section) ──────────────────────
function SeriesChip({ series, onClick }: { series: UniverseSeries; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const hasImg = !!series.firstCover && !imgError;

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 8,
        background: "rgba(155,93,229,0.06)",
        border: "0.5px solid rgba(155,93,229,0.14)",
        cursor: "pointer", flexShrink: 0,
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(155,93,229,0.12)";
        e.currentTarget.style.borderColor = "rgba(155,93,229,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(155,93,229,0.06)";
        e.currentTarget.style.borderColor = "rgba(155,93,229,0.14)";
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: 28, height: 38, borderRadius: 4, overflow: "hidden", flexShrink: 0,
        background: "rgba(155,93,229,0.15)",
      }}>
        {hasImg ? (
          <Image
            src={series.firstCover!}
            alt={series.name}
            width={28}
            height={38}
            sizes="28px"
            onError={() => setImgError(true)}
            style={{ width: 28, height: 38, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: 28, height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
            {series.icon}
          </div>
        )}
      </div>
      {/* Text */}
      <div style={{ textAlign: "left" }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#fff", whiteSpace: "nowrap" }}>
          {series.name}
        </div>
        <div style={{ fontSize: 11, color: "rgba(155,93,229,0.5)", marginTop: 1 }}>
          {series.itemCount} {series.itemCount === 1 ? "entry" : "entries"}
        </div>
      </div>
    </button>
  );
}

// ── MiniCard (series items row) ─────────────────────────────────────────────
function stripFranchisePrefix(title: string, franchiseName: string): string {
  const lower = title.toLowerCase();
  const prefixLower = franchiseName.toLowerCase();
  if (!lower.startsWith(prefixLower)) return title;
  let rest = title.slice(franchiseName.length);
  rest = rest.replace(/^[\s:—–\-]+/, "").trim();
  if (rest.length < 3) return title;
  return rest;
}

function MiniCard({ item, franchiseName, onClick }: { item: FranchiseItemData; franchiseName: string; onClick: () => void }) {
  const t = TYPES[item.type as keyof typeof TYPES] || { color: "#888", icon: "?", label: "Unknown" };
  const hasImage = item.cover && (item.cover.startsWith("http") || item.cover.startsWith("/"));
  const [imgError, setImgError] = useState(false);
  const showImage = hasImage && !imgError;
  const displayTitle = stripFranchisePrefix(item.title, franchiseName);

  return (
    <button
      onClick={onClick}
      style={{
        flex: "0 0 95px", maxWidth: 95,
        borderRadius: 8, overflow: "hidden",
        border: "0.5px solid rgba(255,255,255,0.06)",
        background: "none", padding: 0,
        cursor: "pointer", textAlign: "left",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
    >
      {/* Cover */}
      <div style={{
        width: 95, height: 70, position: "relative", overflow: "hidden",
        background: showImage ? "#1a1a2e" : `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
      }}>
        {showImage ? (
          <Image src={item.cover} alt={item.title} width={95} height={70} sizes="95px"
            onError={() => setImgError(true)}
            style={{ width: 95, height: 70, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: 95, height: 70, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <span style={{ fontSize: 18, color: "rgba(255,255,255,0.15)" }}>{t.icon}</span>
            <span style={{ fontSize: 7, color: "rgba(255,255,255,0.12)", textAlign: "center", padding: "0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 85 }}>
              {displayTitle}
            </span>
          </div>
        )}
        {/* Type badge */}
        <div style={{
          position: "absolute", top: 3, left: 3,
          background: hexToRgba(t.color, 0.85), color: "#fff",
          fontSize: 7, fontWeight: 500, padding: "1px 5px", borderRadius: 4,
          display: "flex", alignItems: "center", gap: 2, lineHeight: 1.4,
        }}>
          {t.icon} {t.label}
        </div>
        {/* Upcoming badge */}
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
      {/* Info */}
      <div style={{ background: "#141419", padding: "6px 7px", height: 36, boxSizing: "border-box", overflow: "hidden" }}>
        <div style={{ fontSize: 10, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3, maxWidth: 81 }}>
          {displayTitle}
        </div>
        <div style={{ fontSize: 8, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.isUpcoming ? (
            <span style={{ color: "rgba(155,93,229,0.6)" }}>Coming soon</span>
          ) : item.score ? (
            <span>
              <span style={{ color: scoreColor(item.score.value), fontWeight: 600 }}>{item.score.display}</span>
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
