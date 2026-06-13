"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "@/lib/supabase/use-session";
import Link from "next/link";
import { TYPES, TYPE_ORDER, type Item, type MediaType } from "@/lib/data";
import Card from "@/components/card";
import { MemberBadgeBlock, getMemberTier } from "@/components/member-badge";
import TypeMixBar from "@/components/type-mix-bar";
import { useReviewVote } from "@/lib/use-review-vote";

interface ProfileReview {
  id: number;
  itemId: number;
  itemTitle: string;
  itemType: string;
  itemCover: string;
  itemYear: number;
  itemSlug: string | null;
  score: number | null;
  text: string;
  helpfulCount: number;
  replyCount: number;
  myVote: "up" | "down" | null;
  createdAt: string;
}

interface ProfileData {
  user: {
    id: string;
    name: string | null;
    bio: string;
    avatar: string;
    isPrivate: boolean;
    createdAt: string;
    ratingsCount: number;
    reviewsCount: number;
    trackedCount: number;
    memberNumber: number | null;
    followerCount: number;
    followingCount: number;
    isFollowing: boolean;
  };
  topRatings: { itemId: number; score: number; recommendTag: string | null; item?: any }[];
  library: { itemId: number; status: string; progressCurrent: number; item?: any }[] | null;
  typeCounts: Record<string, number> | null;
  reviews: ProfileReview[];
  isOwn: boolean;
}

const STATUS_META: Record<string, { label: string; icon: string; color: string }> = {
  completed: { label: "Completed", icon: "✓", color: "#2EC4B6" },
  in_progress: { label: "In Progress", icon: "▶", color: "#3185FC" },
  want_to: { label: "Want To", icon: "＋", color: "#9B5DE5" },
  dropped: { label: "Dropped", icon: "✕", color: "#E84855" },
};

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPrivate, setEditPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followHover, setFollowHover] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  // Mobile collection controls (mirrors Library): status filter, type filter,
  // A–Z sort toggle, and per-section progressive reveal.
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortAlpha, setSortAlpha] = useState(false);
  const [pfExpanded, setPfExpanded] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch(`/api/users/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data: ProfileData) => {
        setProfile(data);
        setEditName(data.user.name || "");
        setEditBio(data.user.bio || "");
        setEditPrivate(data.user.isPrivate);
        setIsFollowing(data.user.isFollowing ?? false);
        setFollowerCount(data.user.followerCount ?? 0);
        setFollowingCount(data.user.followingCount ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, bio: editBio, isPrivate: editPrivate }),
    });
    if (res.ok) {
      setProfile((prev) => prev ? {
        ...prev,
        user: { ...prev.user, name: editName, bio: editBio, isPrivate: editPrivate },
        library: editPrivate ? null : prev.library,
      } : null);
      setEditing(false);
    }
    setSaving(false);
  };

  const handleFollow = async () => {
    if (followLoading || !session?.user) return;
    const wasFollowing = isFollowing;
    // Optimistic update
    setIsFollowing(!wasFollowing);
    setFollowerCount((c) => wasFollowing ? c - 1 : c + 1);
    setFollowLoading(true);
    try {
      const res = await fetch(`/api/users/${id}/follow`, {
        method: wasFollowing ? "DELETE" : "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.following);
        setFollowerCount(data.followerCount);
      } else {
        // Revert on failure
        setIsFollowing(wasFollowing);
        setFollowerCount((c) => wasFollowing ? c + 1 : c - 1);
      }
    } catch {
      setIsFollowing(wasFollowing);
      setFollowerCount((c) => wasFollowing ? c + 1 : c - 1);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="content-width" style={{ textAlign: "center", paddingTop: 80, paddingBottom: 20, color: "var(--text-faint)" }}>
        Loading profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="content-width" style={{ textAlign: "center", paddingTop: 80, paddingBottom: 20 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🔍</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
          User not found
        </div>
        <Link href="/people" style={{ color: "#3185FC", fontSize: 13, textDecoration: "none" }}>
          Back to People
        </Link>
      </div>
    );
  }

  const { user, topRatings, library, typeCounts, reviews, isOwn } = profile;
  const initial = user.name?.[0]?.toUpperCase() || "?";
  const joinDate = new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  // Private to a visitor (the API already withheld the data; this just drives
  // the mobile Option-B view: identity + bio + "Library is private" only).
  const isPrivateView = user.isPrivate && !isOwn;
  const memberTier = user.memberNumber ? getMemberTier(user.memberNumber) : null;
  const rankLabel = user.memberNumber
    ? (memberTier === "founding" || memberTier === "early" ? `★ Member #${user.memberNumber}` : `Member #${user.memberNumber}`)
    : null;

  // Resolve items from API response (includes DB item data)
  function toItem(raw: any): Item | null {
    if (!raw) return null;
    return {
      id: raw.id, title: raw.title, type: raw.type,
      genre: raw.genre || [], vibes: raw.vibes || [],
      year: raw.year, cover: raw.cover || "",
      desc: raw.description || raw.desc || "",
      totalEp: raw.totalEp || 0, ext: raw.ext || {},
      people: [], awards: [], platforms: [],
    };
  }

  // Group library by status
  const libraryByStatus: Record<string, Item[]> = {};
  if (library) {
    for (const entry of library) {
      const item = toItem(entry.item);
      if (item) {
        if (!libraryByStatus[entry.status]) libraryByStatus[entry.status] = [];
        libraryByStatus[entry.status].push(item);
      }
    }
  }

  // ── Mobile collection derivations ──────────────────────────────────────
  const PROFILE_PAGE = 4;
  const topRatedItems = topRatings.map((r) => toItem(r.item)).filter(Boolean) as Item[];
  // Status pill counts (library only; Top Rated is a separate "best of").
  const statusCounts: Record<string, number> = {};
  let libTotal = 0;
  for (const meta of Object.keys(STATUS_META)) {
    const n = libraryByStatus[meta]?.length ?? 0;
    statusCounts[meta] = n;
    libTotal += n;
  }
  // Media types present across the collection — drives the type-filter pills.
  const pfTypes = new Set<string>();
  for (const it of [...topRatedItems, ...Object.values(libraryByStatus).flat()]) pfTypes.add(it.type);
  // Type filter + A–Z sort (Rating sort + owner stars would need owner-score
  // per entry from the library API — flagged follow-up, not in this phase).
  const refineItems = (items: Item[]): Item[] => {
    let r = typeFilter === "all" ? items : items.filter((i) => i.type === typeFilter);
    if (sortAlpha) r = [...r].sort((a, b) => a.title.localeCompare(b.title));
    return r;
  };

  const shareProfile = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      (navigator as any).share({ title: user.name || "Profile", url }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  };

  return (
    <>
      {/* ── MOBILE (<=640px) — identity-first; full Option-B private state ─ */}
      <div className="content-width profile-mobile">
        <ProfileMobileStyles />

        <div className="pf-topheader">
          <button className="pf-back" onClick={() => history.back()} aria-label="Back">‹</button>
          <div className="pf-header-title">@{user.name || "user"}</div>
          <button className="pf-share" onClick={shareProfile} aria-label="Share profile">⤴</button>
        </div>

        <div className="pf-identity">
          <div className="pf-identity-top">
            <div
              className="pf-avatar"
              style={{
                background: user.avatar ? `url(${user.avatar}) center/cover` : "linear-gradient(135deg, #9B5DE5, #2EC4B6)",
              }}
            >
              {!user.avatar && initial}
            </div>
            <div className="pf-name-block">
              <div className="pf-name">{user.name || "Anonymous"}</div>
              <div className="pf-joined">Joined {joinDate}</div>
              {rankLabel && <div className="pf-rank">{rankLabel}</div>}
            </div>
            {isOwn ? (
              <button className="pf-edit-btn" onClick={() => setEditing(!editing)}>
                {editing ? "Cancel" : "Edit"}
              </button>
            ) : session?.user ? (
              <button
                className={`pf-follow-btn ${isFollowing ? "pf-follow-btn-following" : ""}`}
                onClick={handleFollow}
                disabled={followLoading}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            ) : null}
          </div>

          {memberTier === "founding" && <div className="pf-founding">Founding Member</div>}
          {user.bio && <div className="pf-bio">{user.bio}</div>}

          {/* Taste fingerprint — only when ratings (and thus typeCounts) are visible */}
          {!isPrivateView && typeCounts && Object.keys(typeCounts).length > 0 && (
            <div className="pf-taste">
              <div className="pf-taste-label">Reviews across</div>
              <TypeMixBar counts={typeCounts} height={4} />
              <div className="pf-taste-legend">
                {Object.keys(typeCounts)
                  .filter((t) => typeCounts[t] > 0)
                  .map((t) => {
                    const info = TYPES[t as keyof typeof TYPES];
                    if (!info) return null;
                    return (
                      <div key={t} className="pf-legend-item">
                        <span className="pf-legend-dot" style={{ background: info.color }} />
                        {info.label}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Own-profile edit form (shared component) */}
        {editing && isOwn && (
          <div style={{ padding: "0 14px" }}>
            <ProfileEditForm
              name={editName} setName={setEditName}
              bio={editBio} setBio={setEditBio}
              priv={editPrivate} setPriv={setEditPrivate}
              saving={saving} onSave={handleSave}
            />
          </div>
        )}

        {isPrivateView ? (
          <div className="pf-private">
            <div className="pf-private-icon">🔒</div>
            <div className="pf-private-title">Library is private</div>
            <div className="pf-private-text">
              {user.name || "This user"} has chosen to keep their library private. You can follow
              them to see their activity in the People feed.
            </div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="pf-stats">
              {[
                { label: "Rated", value: user.ratingsCount, cls: "pf-stat-rated" },
                { label: "Reviewed", value: user.reviewsCount, cls: "pf-stat-reviewed" },
                { label: "Tracked", value: user.trackedCount, cls: "pf-stat-tracked" },
                { label: "Followers", value: followerCount, cls: "pf-stat-followers" },
                { label: "Following", value: followingCount, cls: "pf-stat-following" },
              ].map((s) => (
                <div key={s.label} className={`pf-stat ${s.cls}`}>
                  <div className="pf-stat-num">{s.value}</div>
                  <div className="pf-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
            {/* Status pills — tap to filter the sections below */}
            <div className="pf-status-row">
              <button
                className={`pf-status-pill pf-status-all ${statusFilter === "all" ? "pf-status-active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                <span className="pf-status-num" style={{ color: "#e8e6e1" }}>{libTotal}</span>
                <span className="pf-status-label">All</span>
              </button>
              {Object.entries(STATUS_META).map(([status, meta]) => {
                const n = statusCounts[status];
                const active = statusFilter === status;
                const short = status === "completed" ? "Done" : status === "in_progress" ? "Going" : status === "want_to" ? "Want" : "Drop";
                return (
                  <button
                    key={status}
                    className={`pf-status-pill ${active ? "pf-status-active" : ""}`}
                    style={{ ["--pf-pill-color" as string]: meta.color, opacity: n === 0 ? 0.4 : 1 }}
                    disabled={n === 0}
                    onClick={() => { if (n > 0) setStatusFilter(active ? "all" : status); }}
                  >
                    <span className="pf-status-icon" style={{ color: meta.color }}>{meta.icon}</span>
                    <span className="pf-status-num" style={{ color: meta.color }}>{n}</span>
                    <span className="pf-status-label">{short}</span>
                  </button>
                );
              })}
            </div>

            {/* Type filter + sort (no search on someone else's library) */}
            {pfTypes.size > 1 && (
              <div className="pf-filter-row">
                {TYPE_ORDER.filter((t) => pfTypes.has(t)).map((t) => {
                  const info = TYPES[t as MediaType];
                  const active = typeFilter === t;
                  return (
                    <button
                      key={t}
                      className="pf-type-pill"
                      title={info.label}
                      style={{
                        background: active ? info.color + "25" : "rgba(255,255,255,0.05)",
                        color: active ? info.color : "rgba(232,230,225,0.55)",
                        border: active ? `1px solid ${info.color}55` : "1px solid rgba(255,255,255,0.08)",
                      }}
                      onClick={() => setTypeFilter(active ? "all" : t)}
                    >
                      {info.icon}
                    </button>
                  );
                })}
                <button className="pf-sort-btn" onClick={() => setSortAlpha((s) => !s)}>
                  ↕ {sortAlpha ? "A–Z" : "DEFAULT"}
                </button>
              </div>
            )}

            {/* Top Rated — best-of, shown in the default (All) view */}
            {statusFilter === "all" && (() => {
              const filtered = refineItems(topRatedItems);
              if (filtered.length === 0) return null;
              const cap = pfExpanded.__top ?? PROFILE_PAGE;
              const visible = filtered.slice(0, cap);
              const remaining = filtered.length - visible.length;
              return (
                <div className="pf-section">
                  <div className="pf-section-header">
                    <span style={{ color: "#DAA520", fontSize: 14 }}>★</span>
                    <span className="pf-section-title">Top Rated</span>
                    <span className="pf-section-count">{filtered.length}</span>
                  </div>
                  <div className="pf-card-grid">{visible.map((it) => <Card key={it.id} item={it} />)}</div>
                  {remaining > 0 && (
                    <div className="pf-showmore-row">
                      <button className="pf-showmore" onClick={() => setPfExpanded((e) => ({ ...e, __top: cap + PROFILE_PAGE }))}>
                        ▾ Show {Math.min(PROFILE_PAGE, remaining)} more
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Per-status sections */}
            {Object.entries(STATUS_META).map(([status, meta]) => {
              if (statusFilter !== "all" && statusFilter !== status) return null;
              const all = libraryByStatus[status] || [];
              if (all.length === 0) return null;
              const filtered = refineItems(all);
              if (filtered.length === 0) return null;
              const cap = pfExpanded[status] ?? PROFILE_PAGE;
              const visible = filtered.slice(0, cap);
              const remaining = filtered.length - visible.length;
              return (
                <div key={status} className="pf-section">
                  <div className="pf-section-header">
                    <span style={{ color: meta.color, fontSize: 13 }}>{meta.icon}</span>
                    <span className="pf-section-title">{meta.label}</span>
                    <span className="pf-section-count">{filtered.length}</span>
                  </div>
                  <div className="pf-card-grid">{visible.map((it) => <Card key={it.id} item={it} />)}</div>
                  {remaining > 0 && (
                    <div className="pf-showmore-row">
                      <button className="pf-showmore" onClick={() => setPfExpanded((e) => ({ ...e, [status]: cap + PROFILE_PAGE }))}>
                        ▾ Show {Math.min(PROFILE_PAGE, remaining)} more
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Reviews — their actual opinions; votes persist, replies link to detail */}
            {statusFilter === "all" && reviews.length > 0 && (() => {
              const cap = pfExpanded.__reviews ?? 3;
              const visible = reviews.slice(0, cap);
              const remaining = reviews.length - visible.length;
              return (
                <div className="pf-section">
                  <div className="pf-section-header">
                    <span style={{ color: "#2EC4B6", fontSize: 14 }}>💬</span>
                    <span className="pf-section-title">Reviews</span>
                    <span className="pf-section-count">{reviews.length}</span>
                  </div>
                  {visible.map((rv) => <ProfileReviewCard key={rv.id} review={rv} />)}
                  {remaining > 0 && (
                    <div className="pf-showmore-row">
                      <button className="pf-showmore" onClick={() => setPfExpanded((e) => ({ ...e, __reviews: cap + 3 }))}>
                        ▾ Show {Math.min(3, remaining)} more
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* ── DESKTOP (>640px) — existing layout, unchanged ──────────────── */}
      <div className="content-width profile-desktop">
      {/* Profile header */}
      <div style={{
        display: "flex",
        gap: 24,
        alignItems: "center",
        padding: "32px 0",
        borderBottom: "1px solid var(--border)",
        marginBottom: 32,
      }}>
        {/* Avatar */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: user.avatar
            ? `url(${user.avatar}) center/cover`
            : "linear-gradient(135deg, #E84855, #C45BAA)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          fontWeight: 800,
          color: "#fff",
          flexShrink: 0,
        }}>
          {!user.avatar && initial}
        </div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <h1 style={{
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontWeight: 900,
              color: "#fff",
              margin: 0,
            }}>
              {user.name || "Anonymous"}
            </h1>
            {user.isPrivate && (
              <span style={{
                fontSize: 10,
                color: "var(--text-faint)",
                background: "rgba(255,255,255,0.06)",
                padding: "3px 8px",
                borderRadius: 6,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}>
                Private
              </span>
            )}
          </div>
          {user.bio && (
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 8px", lineHeight: 1.5 }}>
              {user.bio}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Joined {joinDate}
            </div>
            {user.memberNumber && (
              <MemberBadgeBlock memberNumber={user.memberNumber} />
            )}
          </div>
        </div>

        {/* Follow button (other profiles) or Edit button (own profile) */}
        {isOwn ? (
          <button
            onClick={() => setEditing(!editing)}
            style={{
              padding: "8px 18px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: editing ? "rgba(255,255,255,0.08)" : "transparent",
              color: "var(--text-muted)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {editing ? "Cancel" : "Edit Profile"}
          </button>
        ) : session?.user && (
          <button
            onClick={handleFollow}
            onMouseEnter={() => setFollowHover(true)}
            onMouseLeave={() => setFollowHover(false)}
            disabled={followLoading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 24px", borderRadius: 8, cursor: followLoading ? "default" : "pointer",
              transition: "all 0.15s",
              background: isFollowing
                ? (followHover ? "rgba(232,72,85,0.1)" : "rgba(46,196,182,0.2)")
                : "rgba(46,196,182,0.1)",
              border: isFollowing
                ? (followHover ? "1px solid rgba(232,72,85,0.3)" : "1px solid rgba(46,196,182,0.5)")
                : "1px solid rgba(46,196,182,0.3)",
            }}
          >
            {/* Icon */}
            {isFollowing && followHover ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E84855" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>
              </svg>
            ) : isFollowing ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <polyline points="17 11 19 13 23 9"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2EC4B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            )}
            <span style={{
              fontSize: 14, fontWeight: 500,
              color: isFollowing && followHover ? "#E84855" : "#2EC4B6",
            }}>
              {isFollowing ? (followHover ? "Unfollow" : "Following") : "Follow"}
            </span>
          </button>
        )}
      </div>

      {/* Edit form (own profile) — shared with the mobile branch */}
      {editing && isOwn && (
        <ProfileEditForm
          name={editName} setName={setEditName}
          bio={editBio} setBio={setEditBio}
          priv={editPrivate} setPriv={setEditPrivate}
          saving={saving} onSave={handleSave}
        />
      )}

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 36, flexWrap: "wrap" }}>
        {[
          { label: "Rated", value: user.ratingsCount, color: "#2EC4B6", onClick: undefined },
          { label: "Reviewed", value: user.reviewsCount, color: "#E84855", onClick: undefined },
          { label: "Tracked", value: user.trackedCount, color: "#3185FC", onClick: undefined },
          { label: "Followers", value: followerCount, color: "rgba(255,255,255,0.4)", onClick: undefined },
          {
            label: "Following", value: followingCount, color: "rgba(255,255,255,0.4)",
            onClick: isOwn ? () => window.location.href = "/people/following" : undefined,
          },
        ].map((s) => (
          <div
            key={s.label}
            onClick={s.onClick}
            style={{
              flex: 1, minWidth: 80,
              padding: "14px 0",
              background: "rgba(255,255,255,0.02)",
              border: "0.5px solid rgba(249,166,32,0.15)",
              borderRadius: 8,
              textAlign: "center",
              cursor: s.onClick ? "pointer" : "default",
              transition: s.onClick ? "background 0.15s" : undefined,
            }}
            onMouseEnter={(e) => { if (s.onClick) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={(e) => { if (s.onClick) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
          >
            <div style={{ fontSize: 20, fontWeight: 500, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 3 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Top Rated */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 18,
          fontWeight: 800,
          color: "#fff",
          marginBottom: 16,
        }}>
          Top Rated
        </h2>
        {topRatings.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {topRatings.map((r) => {
              const item = toItem(r.item);
              if (!item) return null;
              return <Card key={item.id} item={item} />;
            })}
          </div>
        ) : (
          <div style={{
            padding: "24px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 14,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>No ratings yet</div>
            <Link href="/explore" style={{ fontSize: 11, color: "#E84855", textDecoration: "none" }}>Start exploring →</Link>
          </div>
        )}
      </section>

      {/* Library by status */}
      {library === null ? (
        <div style={{
          padding: "40px 20px",
          textAlign: "center",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
            This user&apos;s library is private
          </div>
        </div>
      ) : Object.keys(libraryByStatus).length > 0 ? (
        Object.entries(STATUS_META).map(([status, meta]) => {
          const statusItems = libraryByStatus[status];
          if (!statusItems || statusItems.length === 0) return null;
          return (
            <section key={status} style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 14, color: meta.color, fontWeight: 700 }}>{meta.icon}</span>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 800, color: "#fff" }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{statusItems.length}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {statusItems.map((item) => <Card key={item.id} item={item} />)}
              </div>
            </section>
          );
        })
      ) : (
        <div style={{
          padding: "24px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 14,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8 }}>No items tracked yet</div>
          <Link href="/explore" style={{ fontSize: 11, color: "#E84855", textDecoration: "none" }}>Start exploring →</Link>
        </div>
      )}
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Gold star rating as text. score 1–5. */
function StarsText({ score }: { score: number }) {
  const s = Math.max(0, Math.min(5, Math.round(score)));
  return <span>{"★".repeat(s)}{"☆".repeat(5 - s)}</span>;
}

function pfTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/** A single review on the profile — item context + stars + text + persisted
 *  up/down (shared useReviewVote). Reply count links to the item detail where
 *  the full thread lives. */
function ProfileReviewCard({ review }: { review: ProfileReview }) {
  const { myVote, count, vote } = useReviewVote(review.id, review.helpfulCount, review.myVote);
  const itemHref = review.itemSlug ? `/${review.itemType}/${review.itemSlug}` : `/item/${review.itemId}`;
  const typeInfo = TYPES[review.itemType as MediaType];
  const hasCover = !!review.itemCover && review.itemCover.startsWith("http");
  const typeLabel = typeInfo?.label?.replace(/s$/, "") || review.itemType;

  return (
    <div className="pf-review-card">
      <div className="pf-review-header">
        <Link
          href={itemHref}
          className="pf-review-cover"
          style={{
            background: hasCover
              ? `url(${review.itemCover}) center/cover`
              : `linear-gradient(135deg, ${(typeInfo?.color || "#888")}33, ${(typeInfo?.color || "#888")}11)`,
          }}
          aria-label={review.itemTitle}
        />
        <div className="pf-review-item-block">
          <Link href={itemHref} className="pf-review-item-title">{review.itemTitle}</Link>
          <div className="pf-review-item-meta">
            {typeLabel}{review.itemYear ? ` · ${review.itemYear}` : ""} · {pfTimeAgo(review.createdAt)}
          </div>
        </div>
        {review.score !== null && review.score > 0 && (
          <div className="pf-review-stars"><StarsText score={review.score} /></div>
        )}
      </div>
      {review.text && <div className="pf-review-text">{review.text}</div>}
      <div className="pf-review-controls">
        <button className={`pf-rev-ctrl ${myVote === "up" ? "pf-rev-up" : ""}`} onClick={() => vote("up")}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10l5-5 5 5" /></svg>
          {count > 0 && <span>{count}</span>}
        </button>
        <button className={`pf-rev-ctrl ${myVote === "down" ? "pf-rev-down" : ""}`} onClick={() => vote("down")}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 14l5 5 5-5" /></svg>
        </button>
        <Link href={itemHref} className={`pf-rev-ctrl ${review.replyCount > 0 ? "pf-rev-accent" : ""}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
          {review.replyCount > 0 ? `${review.replyCount} ${review.replyCount === 1 ? "reply" : "replies"}` : "Reply"}
        </Link>
      </div>
    </div>
  );
}

/** Own-profile edit form (name + bio + Private Library toggle). Shared between
 *  the desktop and mobile branches so there's one source of truth. */
function ProfileEditForm({
  name, setName, bio, setBio, priv, setPriv, saving, onSave,
}: {
  name: string; setName: (v: string) => void;
  bio: string; setBio: (v: string) => void;
  priv: boolean; setPriv: (v: boolean) => void;
  saving: boolean; onSave: () => void;
}) {
  return (
    <div style={{
      background: "var(--surface-1)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      padding: 24,
      marginBottom: 32,
    }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 20 }}>
        Edit Profile
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 10,
            border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)",
            color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 10,
            border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)",
            color: "#fff", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Privacy toggle */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", background: "rgba(255,255,255,0.03)",
        borderRadius: 12, border: "1px solid var(--border)", marginBottom: 20,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Private Library</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
            When enabled, others can see your profile but not your library
          </div>
        </div>
        <button
          onClick={() => setPriv(!priv)}
          style={{
            width: 44, height: 24, borderRadius: 12, border: "none",
            background: priv ? "#E84855" : "rgba(255,255,255,0.15)",
            cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0,
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            position: "absolute", top: 3, left: priv ? 23 : 3, transition: "left 0.2s",
          }} />
        </button>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        style={{
          padding: "10px 24px", borderRadius: 10, border: "none",
          background: "#E84855", color: "#fff", fontSize: 13, fontWeight: 700,
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

/** Mobile Public Profile stylesheet — the .profile-mobile/.profile-desktop
 *  toggle plus all .pf-* classes. CSS media query swap, no JS gate. */
function ProfileMobileStyles() {
  return (
    <style>{`
      .profile-mobile { display: none; }
      .profile-desktop { display: block; }
      @media (max-width: 640px) {
        .profile-desktop { display: none; }
        .profile-mobile { display: block; }
        /* the page wrapper adds horizontal padding; the mobile design is edge-to-edge */
        .content-width.profile-mobile { padding-left: 0; padding-right: 0; }
      }

      .pf-topheader { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 14px; background: rgba(10,10,15,0.95); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(255,255,255,0.04); }
      .pf-back { background: none; border: none; font-size: 24px; line-height: 1; color: rgba(232,230,225,0.85); cursor: pointer; padding: 0; min-width: 28px; text-align: left; }
      .pf-header-title { flex: 1; min-width: 0; font-family: var(--font-serif); font-size: 14px; color: rgba(232,230,225,0.65); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pf-share { background: none; border: none; font-size: 18px; color: rgba(232,230,225,0.55); cursor: pointer; padding: 0; }

      .pf-identity { padding: 20px 14px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); }
      .pf-identity-top { display: flex; gap: 14px; align-items: flex-start; }
      .pf-avatar { width: 70px; height: 70px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: #fff; }
      .pf-name-block { flex: 1; min-width: 0; }
      .pf-name { font-family: var(--font-serif); font-size: 22px; color: #e8e6e1; font-weight: 500; line-height: 1.1; margin-bottom: 4px; }
      .pf-joined { font-size: 11px; color: rgba(232,230,225,0.45); margin-bottom: 6px; }
      .pf-rank { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #DAA520; font-weight: 500; }
      .pf-edit-btn { flex-shrink: 0; padding: 8px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; font-size: 11px; color: rgba(232,230,225,0.65); letter-spacing: 0.5px; font-weight: 500; font-family: inherit; cursor: pointer; }
      .pf-follow-btn { flex-shrink: 0; padding: 8px 16px; background: rgba(46,196,182,0.12); border: 1px solid rgba(46,196,182,0.4); border-radius: 6px; font-size: 11px; color: #2EC4B6; letter-spacing: 0.5px; font-weight: 500; font-family: inherit; cursor: pointer; }
      .pf-follow-btn-following { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.15); color: rgba(232,230,225,0.65); }
      .pf-founding { display: inline-block; margin-top: 10px; padding: 3px 10px; background: rgba(218,165,32,0.12); border: 1px solid rgba(218,165,32,0.35); border-radius: 6px; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #DAA520; font-weight: 600; }
      .pf-bio { padding: 6px 0 4px; border-left: 2px solid rgba(46,196,182,0.2); padding-left: 10px; margin-top: 10px; font-size: 12px; color: rgba(232,230,225,0.75); line-height: 1.5; font-style: italic; }

      .pf-taste { padding-top: 12px; }
      .pf-taste-label { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(232,230,225,0.45); margin-bottom: 6px; }
      .pf-taste-legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
      .pf-legend-item { display: flex; align-items: center; gap: 4px; font-size: 9px; color: rgba(232,230,225,0.55); }
      .pf-legend-dot { width: 8px; height: 8px; border-radius: 50%; }

      .pf-stats { display: grid; grid-template-columns: repeat(5, 1fr); padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); }
      .pf-stat { text-align: center; padding: 4px 0; }
      .pf-stat-num { font-family: var(--font-serif); font-size: 17px; font-weight: 500; line-height: 1; }
      .pf-stat-label { font-size: 8px; letter-spacing: 0.8px; text-transform: uppercase; color: rgba(232,230,225,0.45); margin-top: 4px; }
      .pf-stat-rated .pf-stat-num { color: #2EC4B6; }
      .pf-stat-reviewed .pf-stat-num { color: #DAA520; }
      .pf-stat-tracked .pf-stat-num { color: #93b3c4; }
      .pf-stat-followers .pf-stat-num { color: #c9a3d4; }
      .pf-stat-following .pf-stat-num { color: #d4a76a; }

      .pf-private { margin: 24px 14px; padding: 24px 16px; background: rgba(218,165,32,0.06); border: 1px dashed rgba(218,165,32,0.25); border-radius: 8px; text-align: center; }
      .pf-private-icon { font-size: 30px; margin-bottom: 10px; }
      .pf-private-title { font-family: var(--font-serif); font-size: 16px; color: rgba(232,230,225,0.85); margin-bottom: 6px; font-weight: 500; }
      .pf-private-text { font-size: 12px; color: rgba(232,230,225,0.55); line-height: 1.5; max-width: 280px; margin: 0 auto; }

      /* Status pills — same 5-across language as Library */
      .pf-status-row { display: flex; gap: 5px; padding: 12px 14px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); }
      .pf-status-pill { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); font-family: inherit; cursor: pointer; }
      .pf-status-pill:disabled { cursor: default; }
      .pf-status-pill.pf-status-active { background: rgba(255,255,255,0.06); border-color: var(--pf-pill-color, rgba(255,255,255,0.25)); }
      .pf-status-icon { font-size: 10px; }
      .pf-status-num { font-family: var(--font-serif); font-size: 16px; font-weight: 500; line-height: 1; }
      .pf-status-label { font-size: 8px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--pf-pill-color, rgba(232,230,225,0.55)); }

      /* Type filter + sort (no search) */
      .pf-filter-row { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); flex-wrap: wrap; }
      .pf-type-pill { display: inline-flex; align-items: center; justify-content: center; padding: 6px 10px; border-radius: 14px; font-size: 14px; line-height: 1; font-family: inherit; cursor: pointer; flex-shrink: 0; }
      .pf-sort-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; background: rgba(46,196,182,0.04); border: 1px solid rgba(46,196,182,0.15); border-radius: 4px; font-size: 10px; color: rgba(46,196,182,0.85); letter-spacing: 0.5px; line-height: 1; font-family: inherit; cursor: pointer; flex-shrink: 0; }

      /* Sections + card grid */
      .pf-section { padding: 22px 14px 0; }
      .pf-section-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .pf-section-title { font-family: var(--font-serif); font-size: 17px; color: #e8e6e1; font-weight: 500; }
      .pf-section-count { font-size: 11px; color: rgba(232,230,225,0.45); }
      .pf-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .pf-showmore-row { text-align: center; padding: 14px 0 4px; }
      .pf-showmore { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: rgba(46,196,182,0.04); border: 1px solid rgba(46,196,182,0.15); border-radius: 14px; font-size: 11px; color: rgba(46,196,182,0.85); letter-spacing: 1px; text-transform: uppercase; font-family: inherit; cursor: pointer; }

      /* Reviews */
      .pf-review-card { padding: 12px; background: rgba(255,255,255,0.025); border-radius: 8px; margin-bottom: 8px; }
      .pf-review-header { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
      .pf-review-cover { width: 36px; height: 54px; border-radius: 3px; flex-shrink: 0; display: block; background-color: #1a1a22; text-decoration: none; }
      .pf-review-item-block { flex: 1; min-width: 0; }
      .pf-review-item-title { font-family: var(--font-serif); font-size: 12px; color: #2EC4B6; font-weight: 500; line-height: 1.2; text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pf-review-item-meta { font-size: 9px; color: rgba(232,230,225,0.45); margin-top: 2px; }
      .pf-review-stars { color: #DAA520; font-size: 11px; letter-spacing: 1px; align-self: flex-start; flex-shrink: 0; }
      .pf-review-text { font-size: 12px; color: rgba(232,230,225,0.85); line-height: 1.5; margin: 8px 0; }
      .pf-review-controls { display: flex; gap: 14px; align-items: center; }
      .pf-rev-ctrl { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: rgba(232,230,225,0.45); background: none; border: none; cursor: pointer; font-family: inherit; padding: 0; text-decoration: none; }
      .pf-rev-accent { color: #2EC4B6; font-weight: 500; }
      .pf-rev-up { color: #2EC4B6; }
      .pf-rev-down { color: #E84855; }

      @media (max-width: 640px) {
        /* Two-column poster cards via the shared tokens, scoped to the profile.
           Same overflow containment as Library: the Card's HoverPreview wrapper
           is width:fit-content, so force the chain to fill the cell, cap images,
           and clip as a backstop (iOS Safari intrinsic-width quirk). */
        .profile-mobile { --card-w: 100%; --card-cover-h: 220px; overflow-x: clip; }
        .pf-card-grid > * { min-width: 0; width: 100% !important; }
        .pf-card-grid a { max-width: 100%; }
        .pf-card-grid img { max-width: 100%; }
      }
    `}</style>
  );
}
