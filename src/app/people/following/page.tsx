"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getMemberTier, type MemberTier } from "@/components/member-badge";
import { TYPES } from "@/lib/data";

interface FollowingUser {
  id: string;
  name: string;
  avatar: string;
  memberNumber: number | null;
  ratedCount: number;
  reviewCount: number;
  topMediaTypes: string[];
  lastActiveAt: string | null;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function avatarStyle(memberNumber: number | null): { bg: string; border: string; color: string } {
  if (!memberNumber) return { bg: "#1c1c26", border: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" };
  const tier: MemberTier = getMemberTier(memberNumber);
  if (tier === "founding") return { bg: "#2a2520", border: "rgba(249,166,32,0.3)", color: "#F9A620" };
  if (tier === "early") return { bg: "#202028", border: "rgba(192,192,192,0.2)", color: "#C0C0C0" };
  return { bg: "#1c1c26", border: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" };
}

export default function FollowingPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<FollowingUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) { setLoading(false); return; }
    fetch("/api/users/me/following")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setUsers(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  const handleUnfollow = async (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    await fetch("/api/follows", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }).catch(() => {});
  };

  if (!session?.user && !loading) {
    return (
      <div className="content-width" style={{ paddingTop: 60, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>Sign in to see who you follow</div>
        <Link href="/login" style={{ color: "#E84855", fontSize: 13, textDecoration: "none" }}>Sign in →</Link>
      </div>
    );
  }

  return (
    <div className="content-width">
      {/* Back link */}
      <div style={{ marginBottom: 4 }}>
        <Link href="/people" style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textDecoration: "none" }}>
          ← Back to People
        </Link>
      </div>

      {/* Header */}
      <div style={{ fontSize: 18, fontWeight: 500, color: "#fff", marginBottom: 2 }}>Following</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 20 }}>
        {users.length} {users.length === 1 ? "person" : "people"} you follow
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "20px 0" }}>Loading...</div>
      )}

      {!loading && users.length === 0 && (
        <div style={{
          background: "#141419", border: "0.5px solid rgba(255,255,255,0.06)",
          borderRadius: 10, padding: "32px 20px", textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", marginBottom: 10 }}>
            You&apos;re not following anyone yet.
          </div>
          <Link href="/people" style={{ fontSize: 12, color: "#2EC4B6", textDecoration: "none" }}>
            Find people to follow →
          </Link>
        </div>
      )}

      {/* User list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {users.map((user) => (
          <FollowingUserCard key={user.id} user={user} onUnfollow={handleUnfollow} />
        ))}
      </div>
    </div>
  );
}

function FollowingUserCard({ user, onUnfollow }: { user: FollowingUser; onUnfollow: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const av = avatarStyle(user.memberNumber);
  const initial = user.name[0]?.toUpperCase() || "?";
  const tier = user.memberNumber ? getMemberTier(user.memberNumber) : null;
  const isFoundingMember = user.memberNumber !== null && user.memberNumber <= 10;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "#141419", border: "0.5px solid rgba(255,255,255,0.06)",
      borderRadius: 10, padding: "14px 16px", cursor: "pointer",
    }}>
      {/* Left: avatar + info */}
      <Link href={`/user/${user.id}`} style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", flex: 1, minWidth: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
          background: user.avatar ? `url(${user.avatar}) center/cover` : av.bg,
          border: `1.5px solid ${av.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {!user.avatar && <span style={{ fontSize: 16, color: av.color }}>{initial}</span>}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>{user.name}</span>
            {user.memberNumber && (
              <span style={{ fontSize: 11, color: "#F9A620", fontWeight: 500 }}>
                {tier === "founding" || tier === "early" ? `★ #${user.memberNumber}` : `#${user.memberNumber}`}
              </span>
            )}
            {isFoundingMember && (
              <span style={{ fontSize: 11, color: "rgba(249,166,32,0.4)" }}>Founding Member</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{user.ratedCount} rated</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{user.reviewCount} reviews</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>
              Last active {timeAgo(user.lastActiveAt)}
            </span>
          </div>
        </div>
      </Link>

      {/* Right: media type badges + unfollow button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {/* Media type badges */}
        {user.topMediaTypes.length > 0 && (
          <div style={{ display: "flex", gap: 3 }}>
            {user.topMediaTypes.slice(0, 3).map((type) => {
              const t = TYPES[type as keyof typeof TYPES];
              if (!t) return null;
              const c = t.color;
              return (
                <span
                  key={type}
                  style={{
                    fontSize: 11, padding: "3px 8px", borderRadius: 6,
                    background: `${c}0f`,
                    border: `0.5px solid ${c}1a`,
                    color: `${c}66`,
                  }}
                >
                  {t.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Following / Unfollow button */}
        <button
          onClick={(e) => { e.stopPropagation(); if (hover) onUnfollow(user.id); }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            padding: "5px 14px", borderRadius: 6, cursor: "pointer",
            fontSize: 12, fontWeight: 500, transition: "all 0.15s",
            background: hover ? "rgba(232,72,85,0.1)" : "rgba(46,196,182,0.15)",
            border: hover ? "0.5px solid rgba(232,72,85,0.3)" : "0.5px solid rgba(46,196,182,0.35)",
            color: hover ? "#E84855" : "#2EC4B6",
          }}
        >
          {hover ? "Unfollow" : "Following"}
        </button>
      </div>
    </div>
  );
}
