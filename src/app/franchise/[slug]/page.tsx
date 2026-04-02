"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { TYPES, type MediaType } from "@/lib/data";
import BackButton from "@/components/back-button";

interface FranchiseItem {
  id: number;
  title: string;
  type: string;
  year: number;
  cover: string;
  slug?: string | null;
  genre: string[];
  vibes: string[];
  ext: Record<string, number>;
  isUpcoming: boolean;
  releaseDate: string | null;
  description: string;
}

interface ChildFranchise {
  id: number;
  name: string;
  icon: string;
  itemCount: number;
}

interface SubFranchiseGroup {
  name: string;
  id: number;
  icon: string;
  items: FranchiseItem[];
}

interface FranchiseDetail {
  id: number;
  name: string;
  icon: string;
  description: string;
  totalItems: number;
  mediaTypes: string[];
  items: FranchiseItem[];
  decades: Record<string, FranchiseItem[]>;
  parentFranchise: { id: number; name: string; icon: string } | null;
  childFranchises: ChildFranchise[];
  subFranchiseItems?: SubFranchiseGroup[];
}

function isImageUrl(s: string) { return s?.startsWith("http"); }

function bestScore(ext: Record<string, number>): { display: string; color: string } | null {
  const priority = ["imdb", "rt", "meta", "mal", "goodreads", "pitchfork"];
  for (const key of priority) {
    if (ext[key] !== undefined) {
      const v = ext[key];
      const color = v >= 8 || (key === "rt" && v >= 80) || (key === "meta" && v >= 80)
        ? "#2EC4B6" : v >= 6 || (key === "rt" && v >= 60) || (key === "meta" && v >= 60)
        ? "#F9A620" : "#E84855";
      if (["imdb", "mal", "pitchfork", "ign"].includes(key)) return { display: `${v.toFixed(1)} ${key.toUpperCase()}`, color };
      if (key === "goodreads") return { display: `${v.toFixed(1)} GR`, color };
      return { display: `${v}% ${key.toUpperCase()}`, color };
    }
  }
  return null;
}

function ItemCard({ item }: { item: FranchiseItem }) {
  const t = TYPES[item.type as MediaType] || { color: "#888", icon: "?", label: "?" };
  const score = bestScore(item.ext || {});
  const hasImage = isImageUrl(item.cover);

  return (
    <Link
      href={item.slug ? `/${item.type}/${item.slug}` : `/item/${item.id}`}
      style={{
        width: 140, borderRadius: 10, overflow: "hidden",
        border: "0.5px solid rgba(255,255,255,0.06)",
        textDecoration: "none", transition: "transform 0.15s",
        background: "#141419",
      }}
    >
      <div style={{
        height: 85, position: "relative", overflow: "hidden",
        background: hasImage ? "#1a1a2e" : `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
      }}>
        {hasImage && (
          <Image
            src={item.cover}
            alt={item.title}
            width={140}
            height={85}
            quality={65}
            sizes="140px"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        <div style={{
          position: "absolute", top: 4, left: 4,
          background: "rgba(0,0,0,0.6)", color: t.color,
          fontSize: 8, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
        }}>
          {t.icon} {t.label}
        </div>
        {item.isUpcoming && (
          <div style={{
            position: "absolute", top: 4, right: 4,
            background: "linear-gradient(135deg, #9B5DE5, #C45BAA)",
            color: "#fff", fontSize: 7, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
          }}>
            Upcoming
          </div>
        )}
      </div>
      <div style={{ padding: "8px 10px" }}>
        <div style={{
          fontSize: 11, fontWeight: 500, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginBottom: 4,
        }}>
          {item.title}
        </div>
        {score && (
          <div style={{ fontSize: 9 }}>
            <span style={{ color: score.color, fontWeight: 600 }}>{score.display}</span>
          </div>
        )}
        {item.genre?.length > 0 && (
          <div style={{
            fontSize: 8, color: "var(--text-faint)", marginTop: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.genre.slice(0, 3).join(" · ")}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function FranchisePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<FranchiseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<string>("all");
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/franchise/${slug}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  // Load follow status once we have the franchise ID
  useEffect(() => {
    if (!data?.id) return;
    fetch(`/api/franchises/${data.id}/follow`)
      .then((r) => r.json())
      .then((d) => { setFollowing(d.following); setFollowerCount(d.followerCount || 0); })
      .catch(() => {});
  }, [data?.id]);

  async function toggleFollow() {
    if (!session) { router.push("/auth/signin"); return; }
    setFollowLoading(true);
    // Optimistic
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setFollowerCount((n) => wasFollowing ? n - 1 : n + 1);
    try {
      const res = await fetch(`/api/franchises/${data!.id}/follow`, { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setFollowing(json.following);
        setFollowerCount(json.followerCount);
      } else {
        // Revert
        setFollowing(wasFollowing);
        setFollowerCount((n) => wasFollowing ? n + 1 : n - 1);
      }
    } catch {
      setFollowing(wasFollowing);
      setFollowerCount((n) => wasFollowing ? n + 1 : n - 1);
    } finally {
      setFollowLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="content-width" style={{ paddingTop: 60, paddingBottom: 20, textAlign: "center", color: "var(--text-faint)" }}>
        Loading franchise...
      </div>
    );
  }

  if (!data || !data.items) {
    return (
      <div className="content-width" style={{ paddingTop: 60, paddingBottom: 20, textAlign: "center" }}>
        <BackButton />
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, color: "#fff", marginTop: 20 }}>
          Franchise not found
        </h1>
      </div>
    );
  }

  const filteredItems = activeType === "all"
    ? data.items
    : data.items.filter((i) => i.type === activeType);

  // Group filtered items by year for timeline
  const yearGroups = new Map<number, FranchiseItem[]>();
  for (const item of filteredItems) {
    if (!yearGroups.has(item.year)) yearGroups.set(item.year, []);
    yearGroups.get(item.year)!.push(item);
  }
  const sortedYears = [...yearGroups.entries()].sort((a, b) => a[0] - b[0]);

  const tabs = [
    { key: "all", label: "All", count: data.items.length },
    ...data.mediaTypes.map((t) => ({
      key: t,
      label: TYPES[t as MediaType]?.label || t,
      count: data.items.filter((i) => i.type === t).length,
    })),
  ];

  return (
    <div className="content-width">
      <BackButton />

      {/* Parent link */}
      {data.parentFranchise && (
        <Link
          href={`/franchise/${data.parentFranchise.id}`}
          style={{
            display: "inline-block", marginBottom: 16,
            fontSize: 11, color: "var(--text-faint)", textDecoration: "none",
          }}
        >
          {data.parentFranchise.icon} Part of the {data.parentFranchise.name} universe →
        </Link>
      )}

      {/* Hero header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 36 }}>{data.icon}</span>
            <h1 style={{
              fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 900,
              color: "#fff", margin: 0,
            }}>
              {data.name}
            </h1>
          </div>
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 22px", borderRadius: 10, cursor: "pointer",
              fontSize: 14, fontWeight: 500, transition: "all 0.15s", flexShrink: 0,
              background: following ? "rgba(232,72,85,0.15)" : "rgba(255,255,255,0.06)",
              border: following ? "1px solid rgba(232,72,85,0.4)" : "1px solid rgba(255,255,255,0.12)",
              color: following ? "#E84855" : "#E84855",
              opacity: followLoading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!following) {
                e.currentTarget.style.background = "rgba(232,72,85,0.1)";
                e.currentTarget.style.border = "1px solid rgba(232,72,85,0.3)";
              }
            }}
            onMouseLeave={(e) => {
              if (!following) {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)";
              }
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={following ? "#E84855" : "none"} stroke="#E84855" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {following ? "Following" : "Follow universe"}
          </button>
        </div>

        {data.description && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12, maxWidth: 800 }}>
            {data.description}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            {data.totalItems} items across {data.mediaTypes.length} media types
          </span>
          {data.mediaTypes.map((t) => {
            const type = TYPES[t as MediaType];
            return type ? (
              <span key={t} style={{ fontSize: 11, color: type.color }}>
                {type.icon} {data.items.filter((i) => i.type === t).length}
              </span>
            ) : null;
          })}
          {followerCount > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {followerCount} follower{followerCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Sub-franchises */}
      {data.childFranchises.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 2, color: "var(--text-faint)", marginBottom: 10, fontWeight: 600 }}>
            Sub-universes
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.childFranchises.map((cf) => (
              <Link
                key={cf.id}
                href={`/franchise/${cf.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 8,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  textDecoration: "none", color: "#fff", fontSize: 12, fontWeight: 500,
                }}
              >
                <span>{cf.icon}</span>
                {cf.name}
                <span style={{ fontSize: 9, color: "var(--text-faint)" }}>{cf.itemCount}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Media type tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 28, flexWrap: "wrap" }}>
        {tabs.map((tab) => {
          const active = activeType === tab.key;
          const type = TYPES[tab.key as MediaType];
          return (
            <button
              key={tab.key}
              onClick={() => setActiveType(tab.key)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s",
                background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                color: active ? "#fff" : "rgba(255,255,255,0.4)",
                border: active
                  ? `1px solid ${type?.color || "rgba(255,255,255,0.18)"}`
                  : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {type?.icon || "🔗"} {tab.label}
              <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.5 }}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Parent universe: grouped by sub-franchise */}
      {data.subFranchiseItems && data.subFranchiseItems.length > 0 ? (
        <div>
          {data.subFranchiseItems.map((group) => (
            <div key={group.id || group.name} style={{ marginBottom: 32 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
                borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8,
              }}>
                {group.icon && <span style={{ fontSize: 16 }}>{group.icon}</span>}
                <h2 style={{
                  fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700,
                  color: "rgba(255,255,255,0.8)", margin: 0,
                }}>
                  {group.name}
                </h2>
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                  {group.items.length} items
                </span>
                {group.id > 0 && (
                  <Link
                    href={`/franchise/${group.id}`}
                    style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textDecoration: "none", marginLeft: "auto" }}
                  >
                    View series →
                  </Link>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {group.items.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Timeline view for non-parent franchises */
        <div style={{ position: "relative", paddingLeft: 24 }}>
          <div style={{
            position: "absolute", left: 8, top: 0, bottom: 0,
            width: 1, background: "rgba(255,255,255,0.06)",
          }} />

          {sortedYears.map(([year, items]) => (
            <div key={year} style={{ marginBottom: 24 }}>
              <div style={{
                position: "relative", marginBottom: 12,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{
                  position: "absolute", left: -20,
                  width: 10, height: 10, borderRadius: "50%",
                  background: "rgba(255,255,255,0.1)", border: "2px solid rgba(255,255,255,0.2)",
                }} />
                <span style={{
                  fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700,
                  color: "rgba(255,255,255,0.4)",
                }}>
                  {year}
                </span>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {items.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
