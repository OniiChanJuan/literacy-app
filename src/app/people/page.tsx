"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { TYPES } from "@/lib/data";

interface UserResult {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  ratingsCount: number;
  reviewsCount: number;
  sharedRatings?: number;
  isFollowing: boolean;
}

interface ActivityItem {
  id: number;
  userId: string;
  userName: string;
  userAvatar: string;
  itemId: number;
  itemTitle: string;
  itemType: string;
  itemCover: string;
  itemYear: number;
  score: number;
  recommendTag: string | null;
  text: string;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export default function PeoplePage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [similarUsers, setSimilarUsers] = useState<UserResult[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [loadingSimilar, setLoadingSimilar] = useState(true);

  // Load activity feed + similar users on mount
  useEffect(() => {
    if (!session?.user) {
      setLoadingActivity(false);
      setLoadingSimilar(false);
      return;
    }

    fetch("/api/activity")
      .then((r) => r.json())
      .then(setActivity)
      .catch(() => {})
      .finally(() => setLoadingActivity(false));

    fetch("/api/users/similar")
      .then((r) => r.json())
      .then(setSimilarUsers)
      .catch(() => {})
      .finally(() => setLoadingSimilar(false));
  }, [session]);

  // Search users (debounced)
  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(search.trim())}`)
        .then((r) => r.json())
        .then((data) => {
          setSearchResults(Array.isArray(data) ? data : []);
          setSearching(false);
        })
        .catch(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const toggleFollow = useCallback(async (userId: string, isFollowing: boolean) => {
    const method = isFollowing ? "DELETE" : "POST";
    await fetch("/api/follows", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    // Update all lists optimistically
    const update = (users: UserResult[]) =>
      users.map((u) => u.id === userId ? { ...u, isFollowing: !isFollowing } : u);
    setSearchResults(update);
    setSimilarUsers(update);
  }, []);

  const isLoggedIn = !!session?.user;

  return (
    <div>
      {/* Two column layout: Search + Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginBottom: 36 }}>

        {/* Left: Find Reviewers */}
        <div>
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontSize: 20,
            fontWeight: 800,
            color: "#fff",
            marginBottom: 4,
          }}>
            Find Reviewers
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 14 }}>
            Search for people by name
          </p>

          {/* Search input */}
          <div style={{ position: "relative", marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search by username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "13px 18px 13px 42px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                color: "#fff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <span style={{
              position: "absolute",
              left: 15,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 15,
              opacity: 0.3,
            }}>
              ⌕
            </span>
          </div>

          {/* Search results */}
          {searching && (
            <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "12px 0" }}>
              Searching...
            </div>
          )}

          {!searching && search.trim().length >= 2 && searchResults.length === 0 && (
            <div style={{
              padding: "24px 16px",
              textAlign: "center",
              color: "var(--text-faint)",
              fontSize: 13,
              background: "rgba(255,255,255,0.02)",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.05)",
            }}>
              No users found for &ldquo;{search}&rdquo;
            </div>
          )}

          {searchResults.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {searchResults.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  onToggleFollow={toggleFollow}
                  showFollow={isLoggedIn}
                />
              ))}
            </div>
          )}

          {/* Empty state when no search */}
          {search.trim().length < 2 && searchResults.length === 0 && (
            <div style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "var(--text-faint)",
              fontSize: 12,
              background: "rgba(255,255,255,0.02)",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.05)",
              lineHeight: 1.7,
            }}>
              Type at least 2 characters to search
            </div>
          )}
        </div>

        {/* Right: Activity Feed */}
        <div>
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontSize: 20,
            fontWeight: 800,
            color: "#fff",
            marginBottom: 4,
          }}>
            Activity
          </h2>
          <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 14 }}>
            Recent reviews from people you follow
          </p>

          {!isLoggedIn && (
            <EmptyBox>
              <Link href="/login" style={{ color: "#3185FC", textDecoration: "none", fontWeight: 600 }}>
                Sign in
              </Link>{" "}
              to follow people and see their activity
            </EmptyBox>
          )}

          {isLoggedIn && loadingActivity && (
            <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "20px 0" }}>
              Loading activity...
            </div>
          )}

          {isLoggedIn && !loadingActivity && activity.length === 0 && (
            <EmptyBox>
              Follow people to see their reviews and ratings here.
            </EmptyBox>
          )}

          {activity.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 600, overflowY: "auto" }}>
              {activity.map((item) => (
                <ActivityCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Similar Taste Section */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 28 }}>
        <div style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.25)",
          textTransform: "uppercase",
          letterSpacing: 2,
          fontWeight: 600,
          marginBottom: 6,
        }}>
          Reviewers with similar taste
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 16 }}>
          Based on overlapping ratings and how closely you scored the same items
        </div>

        {!isLoggedIn && (
          <EmptyBox>
            <Link href="/login" style={{ color: "#3185FC", textDecoration: "none", fontWeight: 600 }}>
              Sign in
            </Link>{" "}
            and rate some items to discover people with similar taste
          </EmptyBox>
        )}

        {isLoggedIn && loadingSimilar && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "20px 0" }}>
            Finding similar reviewers...
          </div>
        )}

        {isLoggedIn && !loadingSimilar && similarUsers.length === 0 && (
          <EmptyBox>
            Rate more items to find reviewers with similar taste.
          </EmptyBox>
        )}

        {similarUsers.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}>
            {similarUsers.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onToggleFollow={toggleFollow}
                showFollow={isLoggedIn}
                showShared
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function UserCard({
  user,
  onToggleFollow,
  showFollow,
  showShared,
}: {
  user: UserResult;
  onToggleFollow: (id: string, isFollowing: boolean) => void;
  showFollow: boolean;
  showShared?: boolean;
}) {
  const initial = user.name[0]?.toUpperCase() || "?";

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
      background: "var(--surface-1)",
      border: "1px solid var(--border)",
      borderRadius: 12,
    }}>
      {/* Avatar */}
      <Link href={`/user/${user.id}`} style={{ textDecoration: "none", flexShrink: 0 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: user.avatar
            ? `url(${user.avatar}) center/cover`
            : "linear-gradient(135deg, #E84855, #C45BAA)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 700,
          color: "#fff",
        }}>
          {!user.avatar && initial}
        </div>
      </Link>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={`/user/${user.id}`}
          style={{ fontSize: 13, fontWeight: 700, color: "#fff", textDecoration: "none" }}
        >
          {user.name}
        </Link>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
          {showShared && user.sharedRatings
            ? `${user.sharedRatings} shared ratings`
            : `${user.ratingsCount} ratings · ${user.reviewsCount} reviews`}
        </div>
      </div>

      {/* Follow button */}
      {showFollow && (
        <button
          onClick={() => onToggleFollow(user.id, user.isFollowing)}
          style={{
            background: user.isFollowing ? "#E8485522" : "rgba(255,255,255,0.06)",
            border: user.isFollowing ? "1px solid #E8485555" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: user.isFollowing ? "#E84855" : "var(--text-muted)",
            fontSize: 11,
            fontWeight: 600,
            padding: "5px 14px",
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 0.15s",
          }}
        >
          {user.isFollowing ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const recEmoji = item.recommendTag === "recommend" ? "👍"
    : item.recommendTag === "mixed" ? "🤷"
    : item.recommendTag === "skip" ? "👎" : "";
  const typeInfo = TYPES[item.itemType as keyof typeof TYPES];
  const initial = item.userName[0]?.toUpperCase() || "?";

  return (
    <div style={{
      padding: "16px 18px",
      background: "var(--surface-1)",
      border: "1px solid var(--border)",
      borderRadius: 14,
    }}>
      {/* Who reviewed what */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
      }}>
        <Link href={`/user/${item.userId}`} style={{ textDecoration: "none", flexShrink: 0 }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: item.userAvatar
              ? `url(${item.userAvatar}) center/cover`
              : "linear-gradient(135deg, #E84855, #C45BAA)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
          }}>
            {!item.userAvatar && initial}
          </div>
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12 }}>
            <Link href={`/user/${item.userId}`} style={{ color: "#fff", fontWeight: 600, textDecoration: "none" }}>
              {item.userName}
            </Link>
            <span style={{ color: "var(--text-faint)" }}> reviewed </span>
            <Link href={`/item/${item.itemId}`} style={{ color: typeInfo?.color || "#fff", fontWeight: 600, textDecoration: "none" }}>
              {item.itemTitle}
            </Link>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
            {timeAgo(item.createdAt)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {item.score > 0 && (
            <span style={{ color: "#f1c40f", fontSize: 11 }}>
              {"★".repeat(item.score)}{"☆".repeat(5 - item.score)}
            </span>
          )}
          {recEmoji && <span style={{ fontSize: 11 }}>{recEmoji}</span>}
        </div>
      </div>

      {/* Item mini preview */}
      <Link href={`/item/${item.itemId}`} style={{ textDecoration: "none" }}>
        <div style={{
          display: "flex",
          gap: 12,
          padding: "10px 12px",
          background: "rgba(255,255,255,0.02)",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.04)",
          marginBottom: 10,
        }}>
          <div style={{
            width: 40,
            height: 56,
            borderRadius: 6,
            background: item.itemCover,
            flexShrink: 0,
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{item.itemTitle}</div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
              {typeInfo?.icon} {typeInfo?.label?.replace(/s$/, "")} · {item.itemYear}
            </div>
          </div>
        </div>
      </Link>

      {/* Review text */}
      <p style={{
        fontSize: 12,
        color: "var(--text-secondary)",
        lineHeight: 1.6,
        margin: 0,
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {item.text}
      </p>
    </div>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "32px 20px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 12,
      textAlign: "center",
      fontSize: 12,
      color: "var(--text-faint)",
      lineHeight: 1.7,
    }}>
      {children}
    </div>
  );
}
