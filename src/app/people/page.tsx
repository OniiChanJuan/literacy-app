"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/supabase/use-session";
import Link from "next/link";
import { MemberBadge, getMemberTier, type MemberTier } from "@/components/member-badge";
import { TYPES } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import TypeMixBar from "@/components/type-mix-bar";
import { useReviewVote, reviewIdOf } from "@/lib/use-review-vote";

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
  typeCounts?: Record<string, number>;
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
  score: number | null;
  recommendTag: string | null;
  text: string;
  helpfulCount: number;
  replyCount: number;
  myVote: "up" | "down" | null;
  createdAt: string;
}

// A node in a review thread (subset of /api/reviews shape) — reused to render
// the lazy-loaded mobile reply thread (Q1→B).
interface ReplyData {
  id: number;
  userId: string;
  parentId: number | null;
  depth: number;
  userName: string;
  userAvatar: string;
  memberNumber: number | null;
  text: string;
  helpfulCount: number;
  myVote: "up" | "down" | null;
  createdAt: string;
  replies: ReplyData[];
}

/** Depth-first search for a review node by id within a thread tree. */
function findReplyNode(nodes: ReplyData[], id: number): ReplyData | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findReplyNode(n.replies ?? [], id);
    if (found) return found;
  }
  return null;
}

/** Immutably append a reply under its parent anywhere in the tree. */
function insertReply(nodes: ReplyData[], parentId: number, reply: ReplyData): ReplyData[] {
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, replies: [...n.replies, reply] }
      : { ...n, replies: insertReply(n.replies ?? [], parentId, reply) }
  );
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
  const { ratings } = useRatings();
  // My rating count drives the Similar-taste <10 empty-state threshold (Q4) —
  // read from context, no extra fetch.
  const myRatingCount = Object.keys(ratings).length;
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
  // Mobile feed reveals 4 entries at a time (Q5). Pure slice state — the
  // mobile/desktop split is CSS (.people-mobile/.people-desktop), so no
  // useIsMobile gate and no pre-hydration layout flash.
  const [mobileVisible, setMobileVisible] = useState(4);

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
    setMobileVisible(4); // collapse the mobile feed back to 4 on sort flip
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

  // Mobile feed slice (Q5) + progressive reveal handler.
  const shownActivity = activity.slice(0, mobileVisible);
  const canShowMoreMobile = isLoggedIn && activity.length > 0 && (mobileVisible < activity.length || activityHasMore);
  const showMoreMobile = () => {
    if (mobileVisible < activity.length) setMobileVisible((v) => v + 4);
    else if (activityHasMore) { fetchActivity(activitySort, activityOffset, true); setMobileVisible((v) => v + 4); }
  };
  const scrollToFind = () => document.getElementById("pm-find")?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      {/* ── MOBILE (<=640px) — activity-feed-first single column ───────── */}
      <div className="content-width people-mobile">
        <PeopleMobileStyles />
        <div className="pm-header"><div className="pm-title">People</div></div>

        {/* ACTIVITY */}
        <div className="pm-section">
          <div className="pm-section-header">
            <div className="pm-section-title-block">
              <div className="pm-section-title">Activity</div>
              <div className="pm-section-sub">From people you follow</div>
            </div>
            {isLoggedIn && (
              <div className="pm-feed-toggle">
                {(["recent", "top"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setActivitySort(s)}
                    className={`pm-feed-pill ${activitySort === s ? "pm-feed-pill-active" : ""}`}
                  >
                    {s === "recent" ? "Recent" : "Top"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isLoggedIn && (
            <div className="pm-empty">
              <Link href="/login" className="pm-link-accent">Sign in</Link> to follow people and see their activity.
            </div>
          )}
          {isLoggedIn && loadingActivity && <div className="pm-muted">Loading activity…</div>}
          {isLoggedIn && !loadingActivity && activity.length === 0 && (
            <div className="pm-empty">
              <div className="pm-empty-text">Follow reviewers to see their reviews here.</div>
              <button className="pm-empty-cta" onClick={scrollToFind}>Find reviewers</button>
            </div>
          )}
          {shownActivity.length > 0 && (
            <div className="pm-feed">
              {shownActivity.map((item) => (
                <MobileActivityEntry key={item.id} item={item} />
              ))}
            </div>
          )}
          {canShowMoreMobile && (
            <div className="pm-showmore-row">
              <button className="pm-showmore" onClick={showMoreMobile} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "▾ Show 4 more"}
              </button>
            </div>
          )}
        </div>

        {/* FIND REVIEWERS */}
        <div className="pm-section" id="pm-find">
          <div className="pm-section-header">
            <div className="pm-section-title-block">
              <div className="pm-section-title">Find reviewers</div>
              <div className="pm-section-sub">Search by name or username</div>
            </div>
          </div>
          <div className="pm-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(232,230,225,0.45)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pm-search-input"
            />
          </div>
          {searching && <div className="pm-muted">Searching…</div>}
          {!searching && search.trim().length >= 2 && searchResults.length === 0 && (
            <div className="pm-muted">No reviewers found matching “{search}”. Try a different username.</div>
          )}
          {searchResults.length > 0 && (
            <div className="pm-results">
              {searchResults.map((user) => (
                <SearchUserCard key={user.id} user={user} onToggleFollow={toggleFollow} showFollow={isLoggedIn} />
              ))}
            </div>
          )}
        </div>

        {/* SIMILAR TASTE — empty copy only under the <10-ratings threshold (Q4);
            real cards when populated; hidden when >=10 ratings but no matches. */}
        {isLoggedIn && (myRatingCount < 10 || similarUsers.length > 0) && (
          <div className="pm-section">
            <div className="pm-section-header">
              <div className="pm-section-title-block">
                <div className="pm-section-title">Similar taste</div>
                <div className="pm-section-sub">Reviewers who scored items like you</div>
              </div>
            </div>
            {similarUsers.length > 0 ? (
              <div className="pm-reviewer-row">
                {similarUsers.map((u) => (
                  <MobileReviewerCard
                    key={u.id}
                    id={u.id}
                    name={u.name}
                    avatar={u.avatar}
                    memberNumber={u.memberNumber}
                    statsLine={`${u.sharedRatings ?? 0} shared`}
                  />
                ))}
              </div>
            ) : (
              <div className="pm-empty-dashed">
                <div className="pm-empty-text">Rate more items to find people with similar taste.</div>
              </div>
            )}
          </div>
        )}

        {/* FOLLOWING — hidden entirely when the user follows no one. */}
        {isLoggedIn && followingUsers.length > 0 && (
          <div className="pm-section">
            <div className="pm-section-header">
              <div className="pm-section-title-block">
                <div className="pm-section-title">Following</div>
                <div className="pm-section-sub">{followingUsers.length} {followingUsers.length === 1 ? "person" : "people"}</div>
              </div>
            </div>
            <div className="pm-reviewer-row">
              {followingUsers.map((u) => (
                <MobileReviewerCard
                  key={u.id}
                  id={u.id}
                  name={u.name}
                  avatar={u.avatar}
                  memberNumber={u.memberNumber}
                  statsLine={`${u.ratedCount} rated`}
                  typeCounts={u.typeCounts}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── DESKTOP (>640px) — existing two-column layout, unchanged ───── */}
      <div className="people-desktop content-width">
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
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Gold star rating as text (mockup style). score is 1–5. */
function StarsText({ score }: { score: number }) {
  const s = Math.max(0, Math.min(5, Math.round(score)));
  return <span>{"★".repeat(s)}{"☆".repeat(5 - s)}</span>;
}

/** Inline reply composer (posts via POST /api/reviews). */
function ReplyComposer({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const submit = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    try { await onSubmit(text.trim()); setText(""); } finally { setPosting(false); }
  };
  return (
    <div className="pm-composer">
      <textarea
        className="pm-composer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply…"
        rows={2}
      />
      <div className="pm-composer-actions">
        <button className="pm-composer-cancel" onClick={onCancel}>Cancel</button>
        <button className="pm-composer-post" onClick={submit} disabled={posting || !text.trim()}>
          {posting ? "Posting…" : "Reply"}
        </button>
      </div>
    </div>
  );
}

/** One reply node + its nested replies (Reddit-style). Recursive; reuses the
 *  shared vote hook and the existing reply endpoint. depth caps at 3 (API). */
function MobileReplyNode({
  reply, itemId, onReplyPosted,
}: {
  reply: ReplyData;
  itemId: number;
  onReplyPosted: (parentId: number, text: string) => Promise<void>;
}) {
  const { myVote, count, vote } = useReviewVote(reply.id, reply.helpfulCount, reply.myVote);
  const [composing, setComposing] = useState(false);
  const av = avatarStyle(reply.memberNumber);
  const initial = reply.userName[0]?.toUpperCase() || "?";

  return (
    <div className="pm-reply">
      <div className="pm-reply-top">
        <Link
          href={`/user/${reply.userId}`}
          className="pm-reply-avatar"
          style={{
            background: reply.userAvatar ? `url(${reply.userAvatar}) center/cover` : av.bg,
            border: `1.5px solid ${av.border}`, color: av.color,
          }}
        >
          {!reply.userAvatar && initial}
        </Link>
        <Link href={`/user/${reply.userId}`} className="pm-reply-username">{reply.userName}</Link>
        <span className="pm-reply-meta">· {timeAgo(reply.createdAt)}</span>
      </div>
      <div className="pm-reply-text">{reply.text}</div>
      <div className="pm-reply-controls">
        <button className={`pm-ctrl ${myVote === "up" ? "pm-ctrl-accent" : ""}`} onClick={() => vote("up")}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10l5-5 5 5" /></svg>
          {count > 0 && <span>{count}</span>}
        </button>
        <button className={`pm-ctrl ${myVote === "down" ? "pm-ctrl-down" : ""}`} onClick={() => vote("down")}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 14l5 5 5-5" /></svg>
        </button>
        {reply.depth < 3 && (
          <button className="pm-ctrl" onClick={() => setComposing((c) => !c)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
            Reply
          </button>
        )}
      </div>
      {composing && (
        <ReplyComposer
          onCancel={() => setComposing(false)}
          onSubmit={async (t) => { await onReplyPosted(reply.id, t); setComposing(false); }}
        />
      )}
      {reply.replies.length > 0 && (
        <div className="pm-reply-thread">
          {reply.replies.map((r) => (
            <MobileReplyNode key={r.id} reply={r} itemId={itemId} onReplyPosted={onReplyPosted} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact mobile activity entry (mockup layout) with persisted votes and a
 *  lazy-loaded, collapsible reply thread (Q1→B). */
function MobileActivityEntry({ item }: { item: ActivityItem }) {
  const av = avatarStyle(item.userMemberNumber);
  const initial = item.userName[0]?.toUpperCase() || "?";
  const itemHref = item.itemSlug ? `/${item.itemType}/${item.itemSlug}` : `/item/${item.itemId}`;
  const hasReview = !!item.text && item.text.trim().length > 0;
  const reviewId = reviewIdOf(item.id);
  const { myVote, count, vote } = useReviewVote(reviewId, item.helpfulCount, item.myVote);

  // Lazy-loaded reply thread (Q1→B): fetched on first expand via /api/reviews.
  const [expanded, setExpanded] = useState(false);
  const [thread, setThread] = useState<ReplyData[] | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [topComposing, setTopComposing] = useState(false);

  const replyCountNow = thread ? thread.length : item.replyCount;

  // Insert a newly-posted reply into the local tree (top level when the parent
  // is this review, otherwise nested under its parent) and keep the thread open.
  const postReply = useCallback(async (parentId: number, text: string) => {
    const r = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.itemId, text, parentId }),
    });
    if (!r.ok) return;
    const data = await r.json();
    const newReply: ReplyData = { ...data, replies: [] };
    setThread((prev) => {
      const base = prev ?? [];
      return parentId === reviewId ? [...base, newReply] : insertReply(base, parentId, newReply);
    });
    setExpanded(true);
  }, [item.itemId, reviewId]);

  const onReplyTap = async () => {
    if (expanded) { setExpanded(false); return; }
    if (thread === null) {
      if (item.replyCount > 0) {
        setLoadingThread(true);
        try {
          const r = await fetch(`/api/reviews?itemId=${item.itemId}&limit=50`);
          const d = await r.json();
          const node = reviewId ? findReplyNode(d.reviews || [], reviewId) : null;
          setThread(node?.replies ?? []);
        } catch { setThread([]); }
        finally { setLoadingThread(false); }
      } else {
        setThread([]);          // no replies yet → open straight into the composer
        setTopComposing(true);
      }
    }
    setExpanded(true);
  };

  return (
    <div className="pm-entry">
      <div className="pm-entry-top">
        <Link
          href={`/user/${item.userId}`}
          className="pm-entry-avatar"
          style={{
            background: item.userAvatar ? `url(${item.userAvatar}) center/cover` : av.bg,
            border: `1.5px solid ${av.border}`, color: av.color,
          }}
        >
          {!item.userAvatar && initial}
        </Link>
        <div className="pm-entry-userblock">
          <Link href={`/user/${item.userId}`} className="pm-entry-username">{item.userName}</Link>
          <div className="pm-entry-meta">{timeAgo(item.createdAt)}</div>
        </div>
        {item.score !== null && item.score > 0 && (
          <div className="pm-entry-rating"><StarsText score={item.score} /></div>
        )}
      </div>

      <div className="pm-entry-action">
        <span className="pm-entry-verb">{hasReview ? "reviewed" : "rated"}</span>{" "}
        <Link href={itemHref} className="pm-entry-item">{item.itemTitle}</Link>
      </div>

      {hasReview && <div className="pm-entry-text">{item.text}</div>}

      {hasReview && (
        <div className="pm-entry-controls">
          <button className={`pm-ctrl ${myVote === "up" ? "pm-ctrl-accent" : ""}`} onClick={() => vote("up")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10l5-5 5 5" /></svg>
            {count > 0 && <span>{count}</span>}
          </button>
          <button className={`pm-ctrl ${myVote === "down" ? "pm-ctrl-down" : ""}`} onClick={() => vote("down")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 14l5 5 5-5" /></svg>
          </button>
          <button className={`pm-ctrl ${replyCountNow > 0 ? "pm-ctrl-accent" : ""}`} onClick={onReplyTap}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
            {replyCountNow > 0 ? `${replyCountNow} ${replyCountNow === 1 ? "reply" : "replies"}` : "Reply"}
          </button>
        </div>
      )}

      {hasReview && expanded && (
        <div className="pm-thread">
          {loadingThread && <div className="pm-muted">Loading replies…</div>}
          {!loadingThread && thread && thread.length > 0 && (
            <div className="pm-reply-thread">
              {thread.map((r) => (
                <MobileReplyNode key={r.id} reply={r} itemId={item.itemId} onReplyPosted={postReply} />
              ))}
            </div>
          )}
          {topComposing && reviewId && (
            <ReplyComposer
              onCancel={() => setTopComposing(false)}
              onSubmit={async (t) => { await postReply(reviewId, t); setTopComposing(false); }}
            />
          )}
          <div className="pm-thread-footer">
            {!topComposing && reviewId && (
              <button className="pm-thread-reply" onClick={() => setTopComposing(true)}>Reply</button>
            )}
            <button className="pm-collapse" onClick={() => setExpanded(false)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6" /></svg>
              Collapse thread
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact reviewer card for the mobile Similar-taste / Following rows
 *  (horizontal scroll). Shared shape; the type-mix bar shows only when
 *  typeCounts are supplied (Following has them, Similar doesn't). */
function MobileReviewerCard({
  id, name, avatar, memberNumber, statsLine, typeCounts,
}: {
  id: string;
  name: string;
  avatar: string;
  memberNumber: number | null;
  statsLine: string;
  typeCounts?: Record<string, number>;
}) {
  const av = avatarStyle(memberNumber);
  const initial = name[0]?.toUpperCase() || "?";
  const tier = memberNumber ? getMemberTier(memberNumber) : null;
  const rank = memberNumber
    ? (tier === "founding" || tier === "early" ? `★ #${memberNumber}` : `#${memberNumber}`)
    : null;

  return (
    <Link href={`/user/${id}`} className="pm-reviewer-card">
      <div
        className="pm-reviewer-avatar"
        style={{
          background: avatar ? `url(${avatar}) center/cover` : av.bg,
          border: `1.5px solid ${av.border}`, color: av.color,
        }}
      >
        {!avatar && initial}
      </div>
      <div className="pm-reviewer-name">{name}</div>
      {rank && <div className="pm-reviewer-rank">{rank}</div>}
      <div className="pm-reviewer-stats">{statsLine}</div>
      {typeCounts && Object.keys(typeCounts).length > 0 && (
        <div style={{ marginTop: 8 }}><TypeMixBar counts={typeCounts} /></div>
      )}
    </Link>
  );
}

/** Mobile People stylesheet — the .people-mobile/.people-desktop toggle plus
 *  all .pm-* classes. CSS media query swap (no JS gate, no hydration flash). */
function PeopleMobileStyles() {
  return (
    <style>{`
      .people-mobile { display: none; }
      .people-desktop { display: block; }
      @media (max-width: 640px) {
        .people-desktop { display: none; }
        .people-mobile { display: block; }
      }

      .pm-header { padding: 16px 14px 12px; display: flex; justify-content: space-between; align-items: center; }
      .pm-title { font-family: var(--font-serif); font-size: 22px; color: #e8e6e1; font-weight: 500; }

      .pm-section { padding: 18px 14px 0; }
      .pm-section-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .pm-section-title-block { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
      .pm-section-title { font-family: var(--font-serif); font-size: 18px; color: #e8e6e1; font-weight: 500; }
      .pm-section-sub { font-size: 10px; color: rgba(232,230,225,0.45); }

      .pm-feed-toggle { display: flex; padding: 3px; background: rgba(255,255,255,0.025); border-radius: 14px; flex-shrink: 0; }
      .pm-feed-pill { padding: 4px 12px; font-size: 10px; color: rgba(232,230,225,0.55); border-radius: 12px; letter-spacing: 0.5px; background: none; border: none; cursor: pointer; font-family: inherit; }
      .pm-feed-pill-active { background: rgba(46,196,182,0.15); color: #2EC4B6; font-weight: 500; }

      .pm-empty { padding: 14px 0; font-size: 12px; color: rgba(232,230,225,0.5); line-height: 1.5; }
      .pm-empty-text { margin-bottom: 10px; }
      .pm-empty-cta { display: inline-flex; align-items: center; padding: 8px 16px; background: rgba(46,196,182,0.04); border: 1px solid rgba(46,196,182,0.15); border-radius: 12px; font-size: 11px; color: rgba(46,196,182,0.85); letter-spacing: 0.5px; text-transform: uppercase; font-family: inherit; cursor: pointer; }
      .pm-muted { font-size: 12px; color: rgba(232,230,225,0.4); padding: 10px 0; }
      .pm-link-accent { color: #3185FC; text-decoration: none; font-weight: 600; }

      .pm-entry { padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
      .pm-entry:last-child { border-bottom: none; }
      .pm-entry-top { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
      .pm-entry-avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; text-decoration: none; }
      .pm-entry-userblock { flex: 1; min-width: 0; }
      .pm-entry-username { font-size: 12px; font-weight: 500; color: #e8e6e1; line-height: 1.1; text-decoration: none; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pm-entry-meta { font-size: 9px; color: rgba(232,230,225,0.45); margin-top: 2px; }
      .pm-entry-rating { color: #DAA520; font-size: 11px; letter-spacing: 1px; flex-shrink: 0; }
      .pm-entry-action { font-size: 11px; color: rgba(232,230,225,0.65); margin-bottom: 6px; line-height: 1.4; }
      .pm-entry-verb { color: rgba(232,230,225,0.45); }
      .pm-entry-item { color: #2EC4B6; font-weight: 500; text-decoration: none; }
      .pm-entry-text { font-size: 12px; color: rgba(232,230,225,0.85); line-height: 1.5; margin-bottom: 8px; }
      .pm-entry-controls { display: flex; gap: 16px; align-items: center; }
      .pm-ctrl { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: rgba(232,230,225,0.45); background: none; border: none; cursor: pointer; font-family: inherit; padding: 0; }
      .pm-ctrl-accent { color: #2EC4B6; font-weight: 500; }
      .pm-ctrl-down { color: #E84855; }

      .pm-showmore-row { text-align: center; padding: 14px 0 4px; }
      .pm-showmore { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: rgba(46,196,182,0.04); border: 1px solid rgba(46,196,182,0.15); border-radius: 14px; font-size: 11px; color: rgba(46,196,182,0.85); letter-spacing: 1px; text-transform: uppercase; font-family: inherit; cursor: pointer; }

      .pm-search { padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; display: flex; align-items: center; gap: 10px; margin-top: 10px; }
      .pm-search-input { background: none; border: none; outline: none; color: #fff; font-size: 13px; flex: 1; min-width: 0; font-family: inherit; }
      .pm-results { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }

      .pm-empty-dashed { padding: 20px 14px; text-align: center; background: rgba(255,255,255,0.015); border: 1px dashed rgba(255,255,255,0.08); border-radius: 8px; margin-top: 12px; }
      .pm-empty-dashed .pm-empty-text { margin-bottom: 0; font-size: 12px; color: rgba(232,230,225,0.45); }

      .pm-reviewer-row { display: flex; gap: 8px; overflow-x: auto; margin: 12px -14px 0; padding: 0 14px 8px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .pm-reviewer-row::-webkit-scrollbar { display: none; }
      .pm-reviewer-card { flex-shrink: 0; width: 105px; padding: 12px 8px; background: rgba(255,255,255,0.025); border-radius: 8px; text-align: center; text-decoration: none; display: block; }
      .pm-reviewer-avatar { width: 48px; height: 48px; border-radius: 50%; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
      .pm-reviewer-name { font-family: var(--font-serif); font-size: 12px; color: #e8e6e1; font-weight: 500; line-height: 1.1; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pm-reviewer-rank { font-size: 9px; color: #DAA520; letter-spacing: 0.5px; margin-bottom: 6px; }
      .pm-reviewer-stats { font-size: 9px; color: rgba(232,230,225,0.45); letter-spacing: 0.5px; }

      /* Threaded replies (Reddit-style) */
      .pm-thread { margin-top: 4px; }
      .pm-reply-thread { margin-top: 12px; margin-left: 16px; padding-left: 12px; border-left: 2px solid rgba(46,196,182,0.15); }
      .pm-reply { padding: 8px 0; }
      .pm-reply + .pm-reply { border-top: 1px solid rgba(255,255,255,0.04); }
      .pm-reply-top { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
      .pm-reply-avatar { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; text-decoration: none; }
      .pm-reply-username { font-size: 11px; font-weight: 500; color: #e8e6e1; text-decoration: none; }
      .pm-reply-meta { font-size: 9px; color: rgba(232,230,225,0.45); }
      .pm-reply-text { font-size: 11px; color: rgba(232,230,225,0.75); line-height: 1.5; margin-bottom: 6px; }
      .pm-reply-controls { display: flex; gap: 14px; }
      .pm-thread-footer { display: flex; gap: 12px; align-items: center; margin-top: 10px; }
      .pm-thread-reply { background: none; border: none; color: rgba(46,196,182,0.85); font-size: 10px; font-family: inherit; cursor: pointer; padding: 0; }
      .pm-collapse { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: rgba(46,196,182,0.04); border: 1px solid rgba(46,196,182,0.15); border-radius: 12px; font-size: 9px; color: rgba(46,196,182,0.85); letter-spacing: 0.5px; text-transform: uppercase; font-family: inherit; cursor: pointer; }

      /* Reply composer */
      .pm-composer { margin-top: 8px; }
      .pm-composer-input { width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 10px; font-size: 12px; color: #fff; font-family: inherit; resize: vertical; outline: none; }
      .pm-composer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
      .pm-composer-cancel { background: none; border: none; color: rgba(232,230,225,0.45); font-size: 11px; font-family: inherit; cursor: pointer; }
      .pm-composer-post { background: rgba(46,196,182,0.15); border: 1px solid rgba(46,196,182,0.35); color: #2EC4B6; font-size: 11px; padding: 5px 14px; border-radius: 6px; font-family: inherit; cursor: pointer; }
      .pm-composer-post:disabled { opacity: 0.5; cursor: default; }
    `}</style>
  );
}

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
        {item.score !== null && item.score > 0 && <StarRow score={item.score} />}
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
          <VoteButtons reviewId={reviewIdOf(item.id)} helpfulCount={item.helpfulCount} myVote={item.myVote} />
          {/* No desktop "Reply" control yet — the desktop feed has no thread UI
              (the existing thread machinery is item-detail-coupled, not
              feed-reusable). Omitted rather than shown as a dead button.
              Tracked follow-up: desktop feed threading. */}
        </div>
      )}
    </div>
  );
}

function VoteButtons({ reviewId, helpfulCount, myVote: initialMyVote }: { reviewId: number | null; helpfulCount: number; myVote: "up" | "down" | null }) {
  // Persisted via the shared hook (same logic as the mobile feed controls).
  const { myVote, count, vote } = useReviewVote(reviewId, helpfulCount, initialMyVote);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <button
        onClick={() => vote("up")}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={myVote === "up" ? "#2EC4B6" : "rgba(255,255,255,0.2)"} strokeWidth="2">
          <path d="M7 10l5-5 5 5"/>
        </svg>
      </button>
      <span style={{ fontSize: 11, color: myVote === "up" ? "#2EC4B6" : myVote === "down" ? "#E84855" : "rgba(255,255,255,0.2)", minWidth: 12, textAlign: "center" }}>
        {count}
      </span>
      <button
        onClick={() => vote("down")}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={myVote === "down" ? "#E84855" : "rgba(255,255,255,0.2)"} strokeWidth="2">
          <path d="M7 14l5 5 5-5"/>
        </svg>
      </button>
    </div>
  );
}
