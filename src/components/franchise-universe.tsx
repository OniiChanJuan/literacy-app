"use client";

import { useEffect, useState, useRef } from "react";
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
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  async function toggleFollow(e: React.MouseEvent) {
    e.stopPropagation();
    if (!session) { router.push("/auth/signin"); return; }
    if (!franchise) return;
    setFollowLoading(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    try {
      const res = await fetch(`/api/franchises/${franchise.id}/follow`, { method: "POST" });
      const json = await res.json();
      if (res.ok) setFollowing(json.following);
      else setFollowing(wasFollowing);
    } catch {
      setFollowing(wasFollowing);
    } finally {
      setFollowLoading(false);
    }
  }

  if (!loaded || !franchise || franchise.otherItems.length === 0) return null;

  // Deduplicate items by normalized title + type + year
  // Also catch near-duplicates (e.g., "Ghost in the Shell: SAC" vs "Ghost in the Shell: S.A.C.")
  const seen = new Set<string>();
  const deduped = franchise.otherItems.filter((item) => {
    const norm = item.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const key = `${norm}::${item.type}::${item.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const c = franchise.color;

  return (
    <section style={{
      background: `linear-gradient(135deg, ${c}0F, ${c}0A)`,
      border: `0.5px solid ${c}1F`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 16,
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 14px", borderRadius: 7, cursor: "pointer",
              fontSize: 11, fontWeight: 500, transition: "all 0.15s",
              background: following ? "rgba(232,72,85,0.15)" : "rgba(255,255,255,0.05)",
              border: following ? "1px solid rgba(232,72,85,0.35)" : "1px solid rgba(255,255,255,0.08)",
              color: following ? "#E84855" : "rgba(255,255,255,0.5)",
              opacity: followLoading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!following) {
                e.currentTarget.style.background = "rgba(232,72,85,0.08)";
                e.currentTarget.style.border = "1px solid rgba(232,72,85,0.25)";
                e.currentTarget.style.color = "#E84855";
              }
            }}
            onMouseLeave={(e) => {
              if (!following) {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.08)";
                e.currentTarget.style.color = "rgba(255,255,255,0.5)";
              }
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={following ? "#E84855" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {following ? "Following" : "Follow"}
          </button>
          <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)", display: "inline-block" }} />
          <a
            href={`/franchise/${franchise.id}`}
            style={{ fontSize: 10, color: `${c}99`, textDecoration: "none", fontWeight: 500 }}
          >
            Explore this universe →
          </a>
        </div>
      </div>

      {/* Card row */}
      <div>
        <div
          ref={scrollRef}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
          }}
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

function stripFranchisePrefix(title: string, franchiseName: string): string {
  const lower = title.toLowerCase();
  const prefixLower = franchiseName.toLowerCase();
  if (!lower.startsWith(prefixLower)) return title;
  let rest = title.slice(franchiseName.length);
  // Strip leading separators: ": ", " - ", " — ", " ", etc.
  rest = rest.replace(/^[\s:—–\-]+/, "").trim();
  // If the remainder is empty or very short, keep original
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
        flex: "0 0 95px",
        maxWidth: 95,
        borderRadius: 8,
        overflow: "hidden",
        border: "0.5px solid rgba(255,255,255,0.06)",
        background: "none",
        padding: 0,
        cursor: "pointer",
        textAlign: "left",
        transition: "transform 0.15s, box-shadow 0.15s",
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
        background: showImage ? "#1a1a2e" : `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
      }}>
        {showImage ? (
          <Image
            src={item.cover}
            alt={item.title}
            width={95}
            height={70}
            sizes="95px"
            onError={() => setImgError(true)}
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
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 4,
          }}>
            <span style={{ fontSize: 18, color: "rgba(255,255,255,0.15)" }}>{t.icon}</span>
            <span style={{
              fontSize: 7, color: "rgba(255,255,255,0.12)",
              textAlign: "center", padding: "0 6px",
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", maxWidth: 85,
            }}>
              {displayTitle}
            </span>
          </div>
        )}

        {/* Type badge — top-left */}
        <div style={{
          position: "absolute", top: 3, left: 3,
          background: hexToRgba(t.color, 0.85), color: "#fff",
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
          {displayTitle}
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
