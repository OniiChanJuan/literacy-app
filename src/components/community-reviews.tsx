"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRatings } from "@/lib/ratings-context";

interface ReviewData {
  id: number;
  userId: string;
  userName: string;
  userAvatar: string;
  score: number;
  recommendTag: string | null;
  text: string;
  containsSpoilers: boolean;
  helpfulCount: number;
  votedHelpful: boolean;
  isAuthor: boolean;
  createdAt: string;
  updatedAt: string;
}

type SortOption = "helpful" | "newest" | "oldest";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const REC_EMOJI: Record<string, string> = {
  recommend: "👍",
  mixed: "🤷",
  skip: "👎",
};

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

// Generate consistent color from username
function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 55%, 45%)`;
}

export default function CommunityReviews({ itemId, heroColor }: { itemId: number; heroColor?: string }) {
  const { data: session } = useSession();
  const { ratings, recTags } = useRatings();
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState<SortOption>("helpful");

  // Review input state
  const [reviewText, setReviewText] = useState("");
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [editSpoilers, setEditSpoilers] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Spoiler reveal state per review
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());
  // Expanded reviews (show more)
  const [expandedReviews, setExpandedReviews] = useState<Set<number>>(new Set());

  const hRgb = heroColor ? hexToRgb(heroColor) : "232,72,85";
  const typeColor = heroColor || "#E84855";

  const currentRating = ratings[itemId] || 0;
  const currentRec = recTags[itemId] ?? null;
  const userId = session?.user?.id;

  const fetchReviews = useCallback((sortBy: SortOption = sort, reset = true) => {
    if (reset) setLoading(true);
    fetch(`/api/reviews?itemId=${itemId}&sort=${sortBy}&limit=10&offset=0`)
      .then((r) => r.json())
      .then((data) => {
        if (data.reviews) {
          setReviews(data.reviews);
          setHasMore(data.hasMore);
          setLoadedCount(data.reviews.length);
          setTotalCount(data.totalCount);
        } else if (Array.isArray(data)) {
          setReviews(data);
          setHasMore(false);
          setLoadedCount(data.length);
          setTotalCount(data.length);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [itemId, sort]);

  useEffect(() => {
    fetchReviews(sort);
  }, [itemId, sort]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/reviews?itemId=${itemId}&sort=${sort}&limit=10&offset=${loadedCount}`);
      const data = await res.json();
      if (data.reviews) {
        setReviews((prev) => [...prev, ...data.reviews]);
        setHasMore(data.hasMore);
        setLoadedCount((c) => c + data.reviews.length);
      }
    } catch {} finally {
      setLoadingMore(false);
    }
  };

  // Find user's own review
  const myReview = userId ? reviews.find((r) => r.userId === userId) : null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleSubmit = async () => {
    if (submitting || !userId || currentRating === 0 || reviewText.trim().length < 10) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, text: reviewText.trim(), containsSpoilers }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to submit");
        return;
      }

      // Prepend the new review with highlight
      setReviews((prev) => [data, ...prev.filter((r) => r.userId !== userId)]);
      setTotalCount((c) => c + 1);
      setReviewText("");
      setContainsSpoilers(false);
      setHighlightId(data.id);
      showToast("Review posted!");
      setTimeout(() => setHighlightId(null), 2000);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (reviewId: number) => {
    if (submitting || editText.trim().length < 10) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editText.trim(), containsSpoilers: editSpoilers }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update");
        return;
      }

      setReviews((prev) => prev.map((r) => (r.id === reviewId ? data : r)));
      setEditing(false);
      showToast("Review updated!");
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: number) => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, { method: "DELETE" });
      if (res.ok) {
        setReviews((prev) => prev.filter((r) => r.id !== reviewId));
        setTotalCount((c) => Math.max(0, c - 1));
        setDeleteConfirm(null);
        setEditing(false);
        setReviewText("");
        showToast("Review deleted");
      }
    } catch {}
  };

  const handleHelpful = async (reviewId: number) => {
    if (!userId) return;
    // Optimistic update
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId
          ? {
              ...r,
              votedHelpful: !r.votedHelpful,
              helpfulCount: r.helpfulCount + (r.votedHelpful ? -1 : 1),
            }
          : r
      )
    );

    try {
      const res = await fetch("/api/reviews/helpful", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId }),
      });
      if (!res.ok) {
        // Revert on failure
        setReviews((prev) =>
          prev.map((r) =>
            r.id === reviewId
              ? {
                  ...r,
                  votedHelpful: !r.votedHelpful,
                  helpfulCount: r.helpfulCount + (r.votedHelpful ? 1 : -1),
                }
              : r
          )
        );
      }
    } catch {
      // Revert on network error
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? {
                ...r,
                votedHelpful: !r.votedHelpful,
                helpfulCount: r.helpfulCount + (r.votedHelpful ? 1 : -1),
              }
            : r
        )
      );
    }
  };

  const toggleSpoiler = (id: number) => {
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedReviews((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = currentRating > 0 && reviewText.trim().length >= 10;
  const userName = session?.user?.name || "You";
  const userInitial = userName[0]?.toUpperCase() || "?";

  // Disabled reason for tooltip
  const disabledReason =
    currentRating === 0
      ? "Rate this item first"
      : reviewText.trim().length < 10
        ? "Write at least 10 characters"
        : "";

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 16,
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}>
            Community Reviews
            {totalCount > 0 && (
              <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 8, letterSpacing: 0, textTransform: "none" }}>
                · {totalCount}
              </span>
            )}
          </h2>
        </div>
        <div style={{
          height: 1,
          background: `linear-gradient(90deg, rgba(${hRgb}, 0.2), transparent)`,
        }} />
      </div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: typeColor,
          color: "#fff",
          padding: "10px 24px",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          zIndex: 1000,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          animation: "fadeInUp 0.3s ease",
        }}>
          {toast}
        </div>
      )}

      {/* Review Input Area — logged in, no existing review */}
      {userId && !myReview && (
        <div style={{
          padding: 16,
          background: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: userColor(userName),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {userInitial}
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{userName}</span>
              <span style={{ marginLeft: 10, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                {currentRating > 0 ? (
                  <>
                    <span style={{ color: "#f1c40f" }}>{"★".repeat(currentRating)}{"☆".repeat(5 - currentRating)}</span>
                    {currentRec && <span style={{ marginLeft: 4 }}>{REC_EMOJI[currentRec]}</span>}
                  </>
                ) : (
                  "Rate this item above to unlock reviewing"
                )}
              </span>
            </div>
          </div>

          <textarea
            value={reviewText}
            onChange={(e) => {
              if (e.target.value.length <= 10000) setReviewText(e.target.value);
            }}
            placeholder={currentRating > 0 ? "What did you think? Share your thoughts, reactions, or analysis..." : "Rate this item above to unlock reviewing"}
            disabled={currentRating === 0}
            style={{
              width: "100%",
              minHeight: 100,
              maxHeight: 300,
              padding: 12,
              background: currentRating > 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.01)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
              outline: "none",
              fontFamily: "'DM Sans', sans-serif",
              boxSizing: "border-box",
              opacity: currentRating > 0 ? 1 : 0.4,
            }}
          />

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 10,
          }}>
            <span style={{
              fontSize: 10,
              color: reviewText.length > 9500 ? "#E84855" : "rgba(255,255,255,0.2)",
            }}>
              {reviewText.length.toLocaleString()} / 10,000
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 12, color: "rgba(255,255,255,0.3)", cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={containsSpoilers}
                  onChange={(e) => setContainsSpoilers(e.target.checked)}
                  style={{ accentColor: "#E84855" }}
                />
                Contains spoilers
              </label>

              {error && (
                <span style={{ fontSize: 11, color: "#E84855" }}>{error}</span>
              )}

              <div style={{ position: "relative" }}>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  title={disabledReason}
                  style={{
                    padding: "8px 24px",
                    borderRadius: 8,
                    border: "none",
                    background: canSubmit && !submitting ? typeColor : "rgba(255,255,255,0.06)",
                    color: canSubmit && !submitting ? "#fff" : "rgba(255,255,255,0.2)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
                    opacity: canSubmit && !submitting ? 1 : 0.3,
                    transition: "all 0.15s",
                  }}
                >
                  {submitting ? "Posting..." : "Post Review"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User's own review (when not editing) */}
      {myReview && !editing && (
        <div style={{
          padding: "14px 18px",
          background: `rgba(${hRgb}, 0.05)`,
          border: `0.5px solid rgba(${hRgb}, 0.15)`,
          borderRadius: 10,
          marginBottom: 16,
          animation: highlightId === myReview.id ? "reviewHighlight 2s ease" : undefined,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: userColor(myReview.userName),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {myReview.userAvatar ? (
                <img src={myReview.userAvatar} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
              ) : myReview.userName[0]?.toUpperCase() || "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>
                {myReview.userName}
              </span>
              <span style={{ fontSize: 9, color: `rgba(${hRgb}, 0.6)`, marginLeft: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Your review
              </span>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                {timeAgo(myReview.createdAt)}
                {myReview.updatedAt !== myReview.createdAt && " (edited)"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {myReview.score > 0 && (
                <span style={{ color: "#f1c40f", fontSize: 12 }}>
                  {"★".repeat(myReview.score)}{"☆".repeat(5 - myReview.score)}
                </span>
              )}
              {myReview.recommendTag && REC_EMOJI[myReview.recommendTag] && (
                <span style={{ fontSize: 12 }}>{REC_EMOJI[myReview.recommendTag]}</span>
              )}
            </div>
          </div>

          <ReviewText
            text={myReview.text}
            expanded={expandedReviews.has(myReview.id)}
            onToggle={() => toggleExpand(myReview.id)}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            {myReview.helpfulCount > 0 && (
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                {myReview.helpfulCount} found helpful
              </span>
            )}
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button
                onClick={() => {
                  setEditing(true);
                  setEditText(myReview.text);
                  setEditSpoilers(myReview.containsSpoilers);
                }}
                style={{
                  fontSize: 11, color: "rgba(255,255,255,0.2)", background: "none",
                  border: "none", cursor: "pointer", padding: "2px 4px",
                }}
              >
                Edit
              </button>
              <button
                onClick={() => setDeleteConfirm(myReview.id)}
                style={{
                  fontSize: 11, color: "rgba(255,255,255,0.2)", background: "none",
                  border: "none", cursor: "pointer", padding: "2px 4px",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit mode */}
      {myReview && editing && (
        <div style={{
          padding: 16,
          background: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
            Editing your review
          </div>
          <textarea
            value={editText}
            onChange={(e) => {
              if (e.target.value.length <= 10000) setEditText(e.target.value);
            }}
            style={{
              width: "100%",
              minHeight: 100,
              maxHeight: 300,
              padding: 12,
              background: "rgba(255,255,255,0.04)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "#fff",
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
              outline: "none",
              fontFamily: "'DM Sans', sans-serif",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 12, color: "rgba(255,255,255,0.3)", cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={editSpoilers}
                onChange={(e) => setEditSpoilers(e.target.checked)}
                style={{ accentColor: "#E84855" }}
              />
              Contains spoilers
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>
                {editText.length.toLocaleString()} / 10,000
              </span>
              {error && <span style={{ fontSize: 11, color: "#E84855" }}>{error}</span>}
              <button
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
                style={{
                  padding: "7px 14px", borderRadius: 8,
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  background: "none", color: "rgba(255,255,255,0.3)",
                  fontSize: 12, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleEdit(myReview.id)}
                disabled={submitting || editText.trim().length < 10}
                style={{
                  padding: "7px 18px", borderRadius: 8, border: "none",
                  background: editText.trim().length >= 10 ? typeColor : "rgba(255,255,255,0.06)",
                  color: editText.trim().length >= 10 ? "#fff" : "rgba(255,255,255,0.2)",
                  fontSize: 12, fontWeight: 600,
                  cursor: editText.trim().length >= 10 ? "pointer" : "not-allowed",
                  opacity: editText.trim().length >= 10 ? 1 : 0.3,
                }}
              >
                {submitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm !== null && (
        <div style={{
          padding: "14px 18px",
          background: "rgba(232,72,85,0.06)",
          border: "0.5px solid rgba(232,72,85,0.15)",
          borderRadius: 10,
          marginBottom: 16,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>
            Delete your review? This cannot be undone.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => setDeleteConfirm(null)}
              style={{
                padding: "7px 18px", borderRadius: 8,
                border: "0.5px solid rgba(255,255,255,0.08)",
                background: "none", color: "rgba(255,255,255,0.4)",
                fontSize: 12, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => handleDelete(deleteConfirm)}
              style={{
                padding: "7px 18px", borderRadius: 8, border: "none",
                background: "#E84855", color: "#fff",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Sign in prompt */}
      {!userId && (
        <div style={{
          padding: "24px 20px",
          textAlign: "center",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 10,
          border: "0.5px solid rgba(255,255,255,0.08)",
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
            Sign in to share your thoughts
          </div>
          <Link href="/login" style={{
            display: "inline-block",
            padding: "6px 16px", borderRadius: 8,
            background: "#E84855", color: "#fff",
            fontSize: 12, fontWeight: 700, textDecoration: "none",
          }}>
            Sign In
          </Link>
        </div>
      )}

      {/* Sort controls */}
      {totalCount > 1 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {(["helpful", "newest", "oldest"] as SortOption[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                if (s !== sort) {
                  setSort(s);
                }
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: sort === s ? `1px solid rgba(${hRgb}, 0.2)` : "1px solid rgba(255,255,255,0.04)",
                background: sort === s ? `rgba(${hRgb}, 0.08)` : "transparent",
                color: sort === s ? `rgba(${hRgb}, 0.8)` : "rgba(255,255,255,0.25)",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: sort === s ? 600 : 400,
              }}
            >
              {s === "helpful" ? "Most helpful" : s === "newest" ? "Newest" : "Oldest"}
            </button>
          ))}
        </div>
      )}

      {/* Reviews list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              padding: "16px 18px",
              background: `rgba(${hRgb}, 0.02)`,
              border: `0.5px solid rgba(${hRgb}, 0.04)`,
              borderRadius: 10,
            }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: 80, height: 12, borderRadius: 4, background: "rgba(255,255,255,0.05)", marginBottom: 4 }} />
                  <div style={{ width: 40, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.03)" }} />
                </div>
              </div>
              <div style={{ width: "100%", height: 10, borderRadius: 4, background: "rgba(255,255,255,0.04)", marginBottom: 6 }} />
              <div style={{ width: "70%", height: 10, borderRadius: 4, background: "rgba(255,255,255,0.03)" }} />
            </div>
          ))}
        </div>
      ) : reviews.filter((r) => r.userId !== userId).length === 0 && !myReview ? (
        <div style={{
          padding: "24px 20px",
          textAlign: "center",
          color: "rgba(255,255,255,0.2)",
          fontSize: 13,
          background: `rgba(${hRgb}, 0.03)`,
          borderRadius: 10,
          border: `0.5px solid rgba(${hRgb}, 0.06)`,
        }}>
          No reviews yet. Be the first to share your thoughts!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reviews
            .filter((r) => r.userId !== userId)
            .map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                currentUserId={userId || null}
                revealed={revealedSpoilers.has(review.id)}
                expanded={expandedReviews.has(review.id)}
                highlighted={highlightId === review.id}
                onRevealSpoiler={() => toggleSpoiler(review.id)}
                onToggleExpand={() => toggleExpand(review.id)}
                onHelpful={() => handleHelpful(review.id)}
                heroRgb={hRgb}
                typeColor={typeColor}
              />
            ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          style={{
            display: "block",
            margin: "16px auto 0",
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            color: "rgba(255,255,255,0.35)",
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 20px",
            cursor: loadingMore ? "default" : "pointer",
            opacity: loadingMore ? 0.5 : 1,
          }}
        >
          {loadingMore ? "Loading..." : "Load more reviews"}
        </button>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes reviewHighlight {
          0% { background: rgba(${hRgb}, 0.12); }
          100% { background: rgba(${hRgb}, 0.05); }
        }
      `}</style>
    </div>
  );
}

/** Truncated review text with Show more/less */
function ReviewText({ text, expanded, onToggle }: { text: string; expanded: boolean; onToggle: () => void }) {
  const truncated = text.length > 500 && !expanded;
  return (
    <div>
      <p style={{
        fontSize: 13,
        color: "rgba(255,255,255,0.6)",
        lineHeight: 1.7,
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {truncated ? text.slice(0, 500) + "..." : text}
      </p>
      {text.length > 500 && (
        <button
          onClick={onToggle}
          style={{
            background: "none", border: "none", padding: 0, marginTop: 4,
            fontSize: 11, color: "rgba(255,255,255,0.3)", cursor: "pointer",
            textDecoration: "underline", textUnderlineOffset: 2,
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  currentUserId,
  revealed,
  expanded,
  highlighted,
  onRevealSpoiler,
  onToggleExpand,
  onHelpful,
  heroRgb,
  typeColor,
}: {
  review: ReviewData;
  currentUserId: string | null;
  revealed: boolean;
  expanded: boolean;
  highlighted: boolean;
  onRevealSpoiler: () => void;
  onToggleExpand: () => void;
  onHelpful: () => void;
  heroRgb: string;
  typeColor: string;
}) {
  const recEmoji = review.recommendTag ? REC_EMOJI[review.recommendTag] || "" : "";
  const isSpoiler = review.containsSpoilers && !revealed;
  const isOwnReview = currentUserId === review.userId;
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [hovered, setHovered] = useState(false);
  const uColor = userColor(review.userName);

  const handleReport = async () => {
    if (!reportReason) return;
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id, reason: reportReason, details: reportDetails }),
      });
      if (res.ok) {
        setReportSent(true);
        setTimeout(() => { setShowReport(false); setReportSent(false); setReportReason(""); setReportDetails(""); }, 2000);
      }
    } catch {}
  };

  return (
    <div
      style={{
        padding: "14px 18px",
        background: highlighted ? `rgba(${heroRgb}, 0.1)` : `rgba(${heroRgb}, 0.03)`,
        border: `0.5px solid rgba(${heroRgb}, 0.06)`,
        borderRadius: 10,
        position: "relative",
        transition: "background 0.5s ease",
        marginBottom: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Report flag */}
      {currentUserId && !isOwnReview && hovered && !showReport && (
        <button
          onClick={() => setShowReport(true)}
          aria-label="Report review"
          style={{
            position: "absolute", top: 10, right: 10,
            background: "none", border: "none",
            color: "rgba(255,255,255,0.15)", fontSize: 12,
            cursor: "pointer", padding: "2px 4px",
          }}
        >
          ⚑
        </button>
      )}

      {/* Report modal */}
      {showReport && (
        <div style={{
          position: "absolute", top: 8, right: 8, zIndex: 10,
          background: "#1a1a24", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, padding: 14, width: 220,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {reportSent ? (
            <div style={{ fontSize: 12, color: "#2EC4B6", textAlign: "center", padding: 8 }}>
              Report submitted. Thank you.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Report this review</div>
              {["spam", "harassment", "hate_speech", "spoilers", "other"].map((r) => (
                <label key={r} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 6, cursor: "pointer",
                }}>
                  <input
                    type="radio"
                    name={`report-${review.id}`}
                    checked={reportReason === r}
                    onChange={() => setReportReason(r)}
                    style={{ accentColor: "#E84855" }}
                  />
                  {r === "hate_speech" ? "Hate speech" : r === "spoilers" ? "Spoilers without warning" : r.charAt(0).toUpperCase() + r.slice(1)}
                </label>
              ))}
              {reportReason === "other" && (
                <textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Details..."
                  maxLength={500}
                  rows={2}
                  style={{
                    width: "100%", fontSize: 11, padding: "6px 8px", borderRadius: 6,
                    background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)",
                    color: "#fff", resize: "none", outline: "none", boxSizing: "border-box",
                    marginBottom: 6,
                  }}
                />
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  onClick={handleReport}
                  disabled={!reportReason}
                  style={{
                    flex: 1, padding: "5px 10px", borderRadius: 6, border: "none",
                    background: reportReason ? "#E84855" : "rgba(255,255,255,0.06)",
                    color: "#fff", fontSize: 11, fontWeight: 600, cursor: reportReason ? "pointer" : "default",
                    opacity: reportReason ? 1 : 0.4,
                  }}
                >
                  Submit
                </button>
                <button
                  onClick={() => { setShowReport(false); setReportReason(""); setReportDetails(""); }}
                  style={{
                    padding: "5px 10px", borderRadius: 6,
                    border: "0.5px solid rgba(255,255,255,0.1)",
                    background: "none", color: "rgba(255,255,255,0.4)",
                    fontSize: 11, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: uColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
          overflow: "hidden",
        }}>
          {review.userAvatar ? (
            <img src={review.userAvatar} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            review.userName[0]?.toUpperCase() || "?"
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/user/${review.userId}`}
            style={{ fontSize: 13, fontWeight: 500, color: "#fff", textDecoration: "none" }}
          >
            {review.userName}
          </Link>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 1 }}>
            {timeAgo(review.createdAt)}
            {review.updatedAt !== review.createdAt && (
              <span style={{ marginLeft: 4, fontStyle: "italic" }}>(edited)</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {review.score > 0 && (
            <span style={{ color: "#f1c40f", fontSize: 12 }}>
              {"★".repeat(review.score)}{"☆".repeat(5 - review.score)}
            </span>
          )}
          {recEmoji && <span style={{ fontSize: 14 }}>{recEmoji}</span>}
        </div>
      </div>

      {/* Review text or spoiler overlay */}
      {isSpoiler ? (
        <div
          onClick={onRevealSpoiler}
          style={{
            padding: "16px 20px",
            background: "rgba(255,255,255,0.02)",
            border: "0.5px solid rgba(255,255,255,0.06)",
            borderRadius: 8,
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            This review contains spoilers —{" "}
            <span style={{ color: "rgba(255,255,255,0.5)", textDecoration: "underline" }}>click to reveal</span>
          </div>
        </div>
      ) : (
        <>
          {review.containsSpoilers && (
            <div style={{
              fontSize: 9, color: "#E84855", fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.5px",
              marginBottom: 6,
            }}>
              ⚠️ Spoiler
            </div>
          )}
          <ReviewText text={review.text} expanded={expanded} onToggle={onToggleExpand} />
        </>
      )}

      {/* Footer: helpful button */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        marginTop: 10, gap: 8,
      }}>
        {currentUserId && !isOwnReview && (
          <button
            onClick={onHelpful}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 6,
              border: review.votedHelpful
                ? `0.5px solid ${typeColor}33`
                : "0.5px solid rgba(255,255,255,0.06)",
              background: review.votedHelpful
                ? `${typeColor}14`
                : "rgba(255,255,255,0.02)",
              color: review.votedHelpful
                ? typeColor
                : "rgba(255,255,255,0.3)",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <span style={{ fontSize: 14 }}>{review.votedHelpful ? "▲" : "△"}</span>
            {review.helpfulCount > 0 ? `Helpful · ${review.helpfulCount}` : "Helpful"}
          </button>
        )}
        {(!currentUserId || isOwnReview) && review.helpfulCount > 0 && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
            {review.helpfulCount} found helpful
          </span>
        )}
      </div>
    </div>
  );
}
