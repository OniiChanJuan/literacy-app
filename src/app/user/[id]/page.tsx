"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { TYPES, type Item } from "@/lib/data";
import Card from "@/components/card";
import { MemberBadgeBlock } from "@/components/member-badge";

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

  const { user, topRatings, library, isOwn } = profile;
  const initial = user.name?.[0]?.toUpperCase() || "?";
  const joinDate = new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });

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

  return (
    <div className="content-width">
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

      {/* Edit form */}
      {editing && isOwn && (
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
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.04)",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
              Bio
            </label>
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.04)",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Privacy toggle */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            marginBottom: 20,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Private Library</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                When enabled, others can see your profile but not your library
              </div>
            </div>
            <button
              onClick={() => setEditPrivate(!editPrivate)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                border: "none",
                background: editPrivate ? "#E84855" : "rgba(255,255,255,0.15)",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <div style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fff",
                position: "absolute",
                top: 3,
                left: editPrivate ? 23 : 3,
                transition: "left 0.2s",
              }} />
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              border: "none",
              background: "#E84855",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
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
  );
}
