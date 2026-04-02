"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { MemberBadge, getMemberTier, type MemberTier } from "@/components/member-badge";
import { TYPES } from "@/lib/data";

interface UserResult {
  id: string;
  name: string;
  avatar: string;
  bio: string;
  memberNumber: number | null;
  ratingsCount: number;
  reviewsCount: number;
  sharedRatings?: number;
  isFollowing: boolean;
}

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

interface ActivityItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userMemberNumber: number | null;
  itemId: number;
  itemTitle: string;
  itemType: string;
  itemSlug?: string | null;
  itemCover: string;
  itemYear: number;
  score: number;
  recommendTag: string | null;
  text: string;
  helpfulCount: number;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
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

// Avatar color from member tier
function avatarStyle(memberNumber: number | null): { bg: string; border: string; color: string } {
  if (!memberNumber) return { bg: "#1c1c26", border: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" };
  const tier: MemberTier = getMemberTier(memberNumber);
  if (tier === "founding") return { bg: "#2a2520", border: "rgba(249,166,32,0.3)", color: "#F9A620" };
  if (tier === "early") return { bg: "#202028", border: "rgba(192,192,192,0.2)", color: "#C0C0C0" };
  return { bg: "#1c1c26", border: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" };
}

export default function PeoplePage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [similarUsers, setSimilarUsers] = useState<UserResult[]>([]);
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityOffset, setActivityOffset] = useState(0);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingSimilar, setLoadingSimilar] = useState(true);
  const [activitySort, setActivitySort] = useState<"recent" | "top">("recent");

  const fetchActivity = useCallback(async (sort: string, offset: number, append: boolean) => {
    if (offset === 0) setLoadingActivity(true);
    else setLoadingMore(true);
    try {
      const r = await fetch(`/api/activity?sort=${sort}&offset=${offset}`);
      const d = await r.json();
      const items = d.items || [];
      if (append) setActivity((prev) => [...prev, ...items]);
      else setActivity(items);
      setActivityHasMore(d.hasMore ?? false);
      setActivityOffset(offset + items.length);
    } catch {
      if (!append) setActivity([]);
    } finally {
      setLoadingActivity(false);
      setLoadingMore(false);
    }
  }, []);

  // Load activity + similar + following on mount
  useEffect(() => {
    if (!session?.user) {
      setLoadingActivity(false);
      setLoadingSimilar(false);
      return;
    }
    fetchActivity(activitySort, 0, false);
    fetch("/api/users/similar").then((r) => r.json()).then(setSimilarUsers).catch(() => {}).finally(() => setLoadingSimilar(false));
    fetch("/api/users/me/following").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setFollowingUsers(d); }).catch(() => {});
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch activity when sort changes
  useEffect(() => {
    if (!session?.user) return;
    fetchActivity(activitySort, 0, false);
  }, [activitySort, fetchActivity, session]);

  // Debounced search
  useEffect(() => {
    if (search.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(search.trim())}`)
        .then((r) => r.json())
        .then((d) => { setSearchResults(Array.isArray(d) ? d : []); setSearching(false); })
        .catch(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const toggleFollow = useCallback(async (userId: string, isFollowing: boolean) => {
    const method = isFollowing ? "DELETE" : "POST";
    await fetch("/api/follows", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const update = (users: UserResult[]) =>
      users.map((u) => u.id === userId ? { ...u, isFollowing: !isFollowing } : u);
    setSearchResults(update);
    setSimilarUsers(update);
    // Refresh following list
    if (!isFollowing) {
      fetch("/api/users/me/following").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setFollowingUsers(d); }).catch(() => {});
    } else {
      setFollowingUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  }, []);

  const isLoggedIn = !!session?.user;

  return (
    <div className="content-width">
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>

        {/* ── LEFT COLUMN ───────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Find reviewers */}
          <div style={{ fontSize: 16, fontWeight: 500, color: "#fff", marginBottom: 2 }}>Find reviewers</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 12 }}>Search for people by name</div>

          {/* Search bar */}
          <div style={{
            background: "#141419", border: "0.5px solid rgba(255,255,255,0.06)",
            borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center",
            gap: 8, marginBottom: 16,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search by username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                background: "none", border: "none", outline: "none",
                color: "#fff", fontSize: 13, flex: 1,
              }}
            />
          </div>

          {/* Search results */}
          {searching && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", marginBottom: 12 }}>Searching...</div>}
          {!searching && search.trim().length >= 2 && searchResults.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", marginBottom: 12 }}>No users found for &ldquo;{search}&rdquo;</div>
          )}
          {searchResults.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {searchResults.map((user) => (
                <SearchUserCard key={user.id} user={user} onToggleFollow={toggleFollow} showFollow={isLoggedIn} />
              ))}
            </div>
          )}

          {/* Your following */}
          {isLoggedIn && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>Your following</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{followingUsers.length} {followingUsers.length === 1 ? "person" : "people"}</span>
                </div>
                <Link href="/people/following" style={{ fontSize: 11, color: "#2EC4B6", textDecoration: "none" }}>
                  See all →
                </Link>
              </div>

              {followingUsers.length === 0 ? (
                <div style={{
                  background: "#141419", border: "0.5px solid rgba(255,255,255,0.04)",
                  borderRadius: 8, padding: "20px", textAlign: "center",
                }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>Follow people to see them here.</span>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                  {followingUsers.slice(0, 5).map((u) => (
                    <FollowingCompactCard key={u.id} user={u} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reviewers with similar taste */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
            Reviewers with similar taste
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.1)", marginBottom: 8 }}>
            Based on overlapping ratings and how closely you scored the same items
          </div>

          {!isLoggedIn && (
            <div style={{ background: "#141419", border: "0.5px solid rgba(255,255,255,0.04)", borderRadius: 8, padding: 20, textAlign: "center" }}>
              <Link href="/login" style={{ color: "#3185FC", textDecoration: "none", fontWeight: 600, fontSize: 12 }}>Sign in</Link>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}> to find reviewers with similar taste</span>
            </div>
          )}
          {isLoggedIn && loadingSimilar && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "12px 0" }}>Finding similar reviewers...</div>
          )}
          {isLoggedIn && !loadingSimilar && similarUsers.length === 0 && (
            <div style={{ background: "#141419", border: "0.5px solid rgba(255,255,255,0.04)", borderRadius: 8, padding: 20, textAlign: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>Rate more items to find reviewers with similar taste.</span>
            </div>
          )}
          {similarUsers.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {similarUsers.map((user) => (
                <SearchUserCard key={user.id} user={user} onToggleFollow={toggleFollow} showFollow={isLoggedIn} showShared />
              ))}
            </div>
          )}
        </div>

        {/* ── DIVIDER ───────────────────────────────────────────────── */}
        <div style={{ width: 1, background: "rgba(255,255,255,0.04)", alignSelf: "stretch" }} />

        {/* ── RIGHT COLUMN ──────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header + sort tabs */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#fff", marginBottom: 2 }}>Activity</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>Recent from people you follow</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["recent", "top"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setActivitySort(s)}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                    background: activitySort === s ? "rgba(255,255,255,0.08)" : "transparent",
                    border: "none",
                    color: activitySort === s ? "#fff" : "rgba(255,255,255,0.25)",
                    fontWeight: activitySort === s ? 500 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {!isLoggedIn && (
            <div style={{ background: "#141419", border: "0.5px solid rgba(255,255,255,0.04)", borderRadius: 10, padding: 20, textAlign: "center" }}>
              <Link href="/login" style={{ color: "#3185FC", textDecoration: "none", fontWeight: 600, fontSize: 12 }}>Sign in</Link>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}> to follow people and see their activity</span>
            </div>
          )}

          {isLoggedIn && loadingActivity && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "20px 0" }}>Loading activity...</div>
          )}

          {isLoggedIn && !loadingActivity && activity.length === 0 && (
            <div style={{ background: "#141419", border: "0.5px solid rgba(255,255,255,0.04)", borderRadius: 10, padding: 20, textAlign: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.15)" }}>Follow people to see their reviews and ratings here.</span>
            </div>
          )}

          {activity.length > 0 && (
            <>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {activity.map((item) => (
                  <ActivityCard key={item.id} item={item} />
                ))}
              </div>
              {activityHasMore && (
                <div style={{ textAlign: "center", marginTop: 4 }}>
                  <button
                    onClick={() => fetchActivity(activitySort, activityOffset, true)}
                    disabled={loadingMore}
                    style={{
                      background: "none", border: "none", cursor: loadingMore ? "default" : "pointer",
                      fontSize: 11, color: "rgba(255,255,255,0.15)", padding: "8px 0",
                    }}
                  >
                    {loadingMore ? "Loading..." : "Load more activity..."}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FollowingCompactCard({ user }: { user: FollowingUser }) {
  const av = avatarStyle(user.memberNumber);
  const initial = user.name[0]?.toUpperCase() || "?";
  const tier = user.memberNumber ? getMemberTier(user.memberNumber) : null;
  return (
    <Link href={`/user/${user.id}`} style={{ textDecoration: "none", flexShrink: 0, minWidth: 100 }}>
      <div style={{
        background: "#141419", border: "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 10, padding: 12, display: "flex", flexDirection: "column",
        alignItems: "center", gap: 6, cursor: "pointer",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
          background: user.avatar ? `url(${user.avatar}) center/cover` : av.bg,
          border: `1.5px solid ${av.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {!user.avatar && <span style={{ fontSize: 14, color: av.color }}>{initial}</span>}
        </div>
        <div style={{ fontSize: 12, color: "#fff", fontWeight: 500, textAlign: "center", whiteSpace: "nowrap", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
          {user.name}
        </div>
        {user.memberNumber && (
          <div style={{ fontSize: 11, color: "#F9A620" }}>
            {tier === "founding" || tier === "early" ? `★ #${user.memberNumber}` : `#${user.memberNumber}`}
          </div>
        )}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{user.ratedCount} rated</div>
      </div>
    </Link>
  );
}

function SearchUserCard({
  user, onToggleFollow, showFollow, showShared,
}: {
  user: UserResult;
  onToggleFollow: (id: string, isFollowing: boolean) => void;
  showFollow: boolean;
  showShared?: boolean;
}) {
  const initial = user.name[0]?.toUpperCase() || "?";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "14px 16px", background: "#141419",
      border: "0.5px solid rgba(255,255,255,0.06)", borderRadius: 10,
    }}>
      <Link href={`/user/${user.id}`} style={{ textDecoration: "none", flexShrink: 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: user.avatar ? `url(${user.avatar}) center/cover` : "linear-gradient(135deg,#E84855,#C45BAA)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, color: "#fff",
        }}>
          {!user.avatar && initial}
        </div>
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link href={`/user/${user.id}`} style={{ fontSize: 13, fontWeight: 700, color: "#fff", textDecoration: "none" }}>
            {user.name}
          </Link>
          {user.memberNumber && <MemberBadge memberNumber={user.memberNumber} size="xs" />}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>
          {showShared && user.sharedRatings
            ? `${user.sharedRatings} shared ratings`
            : `${user.ratingsCount} ratings · ${user.reviewsCount} reviews`}
        </div>
      </div>
      {showFollow && (
        <button
          onClick={() => onToggleFollow(user.id, user.isFollowing)}
          style={{
            padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500,
            transition: "all 0.15s", flexShrink: 0,
            background: user.isFollowing ? "rgba(46,196,182,0.15)" : "rgba(255,255,255,0.06)",
            border: user.isFollowing ? "0.5px solid rgba(46,196,182,0.35)" : "0.5px solid rgba(255,255,255,0.1)",
            color: user.isFollowing ? "#2EC4B6" : "rgba(255,255,255,0.4)",
          }}
        >
          {user.isFollowing ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}

function StarRow({ score }: { score: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 24 24"
          fill={i <= score ? "#F9A620" : "none"}
          stroke={i <= score ? "#F9A620" : "rgba(255,255,255,0.15)"}
          strokeWidth="1"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const av = avatarStyle(item.userMemberNumber);
  const initial = item.userName[0]?.toUpperCase() || "?";
  const typeInfo = TYPES[item.itemType as keyof typeof TYPES];
  const itemHref = item.itemSlug ? `/${item.itemType}/${item.itemSlug}` : `/item/${item.itemId}`;
  const hasReview = item.text && item.text.trim().length > 0;

  return (
    <div style={{
      background: "#141419", border: "0.5px solid rgba(255,255,255,0.06)",
      borderRadius: 10, padding: 14, marginBottom: 10,
    }}>
      {/* Top row: avatar + user/action/item + stars */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Link href={`/user/${item.userId}`} style={{ textDecoration: "none", flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: item.userAvatar ? `url(${item.userAvatar}) center/cover` : av.bg,
            border: `1.5px solid ${av.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {!item.userAvatar && <span style={{ fontSize: 11, color: av.color }}>{initial}</span>}
          </div>
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Link href={`/user/${item.userId}`} style={{ fontSize: 12, fontWeight: 500, color: "#fff", textDecoration: "none" }}>
              {item.userName}
            </Link>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>
              {hasReview ? "reviewed" : "rated"}
            </span>
            <Link href={itemHref} style={{ fontSize: 12, color: "#2EC4B6", textDecoration: "none", cursor: "pointer" }}>
              {item.itemTitle}
            </Link>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", marginTop: 1 }}>
            {timeAgo(item.createdAt)}
          </div>
        </div>
        {item.score > 0 && <StarRow score={item.score} />}
      </div>

      {/* Review text or rating-only label */}
      {hasReview ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginLeft: 38, lineHeight: 1.5 }}>
          {item.text}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", marginLeft: 38 }}>
          Rating only — no review
        </div>
      )}

      {/* Bottom: vote buttons + reply (only for reviews) */}
      {hasReview && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 38, marginTop: 6 }}>
          <VoteButtons helpfulCount={item.helpfulCount} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", cursor: "pointer" }}>Reply</span>
        </div>
      )}
    </div>
  );
}

function VoteButtons({ helpfulCount }: { helpfulCount: number }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const score = helpfulCount + (vote === "up" ? 1 : vote === "down" ? -1 : 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <button
        onClick={() => setVote(vote === "up" ? null : "up")}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={vote === "up" ? "#2EC4B6" : "rgba(255,255,255,0.2)"} strokeWidth="2">
          <path d="M7 10l5-5 5 5"/>
        </svg>
      </button>
      <span style={{ fontSize: 11, color: vote === "up" ? "#2EC4B6" : "rgba(255,255,255,0.2)", minWidth: 12, textAlign: "center" }}>
        {score}
      </span>
      <button
        onClick={() => setVote(vote === "down" ? null : "down")}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={vote === "down" ? "#E84855" : "rgba(255,255,255,0.2)"} strokeWidth="2">
          <path d="M7 14l5 5 5-5"/>
        </svg>
      </button>
    </div>
  );
}
