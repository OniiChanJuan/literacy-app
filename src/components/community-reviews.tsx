"use client";

import { useState, useEffect, useCallback } from "react";
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
  createdAt: string;
  updatedAt: string;
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
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
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

export default function CommunityReviews({ itemId, heroColor }: { itemId: number; heroColor?: string }) {
  const { data: session } = useSession();
  const { ratings, recTags } = useRatings();
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Review input state
  const [reviewText, setReviewText] = useState("");
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  // Spoiler reveal state per review
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set());

  const hRgb = heroColor ? hexToRgb(heroColor) : "232,72,85";

  const currentRating = ratings[itemId] || 0;
  const currentRec = recTags[itemId] ?? null;
  const userId = session?.user?.id;

  const fetchReviews = useCallback(() => {
    fetch(`/api/reviews?itemId=${itemId}`)
      .then((r) => r.json())
      .then((data) => {
        setReviews(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [itemId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Find user's own review
  const myReview = userId ? reviews.find((r) => r.userId === userId) : null;

  // Pre-fill review text when editing
  useEffect(() => {
    if (myReview && !editing) {
      setReviewText(myReview.text);
      setContainsSpoilers(myReview.containsSpoilers);
    }
  }, [myReview?.id]);

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
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit");
        return;
      }
      setEditing(false);
      fetchReviews();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: number) => {
    try {
      const res = await fetch("/api/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId }),
      });
      if (res.ok) {
        setReviewText("");
        setContainsSpoilers(false);
        setEditing(false);
        fetchReviews();
      }
    } catch {}
  };

  const handleHelpful = async (reviewId: number) => {
    if (!userId) return;
    try {
      const res = await fetch("/api/reviews/helpful", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId }),
      });
      if (res.ok) {
        const data = await res.json();
        setReviews((prev) =>
          prev.map((r) =>
            r.id === reviewId
              ? {
                  ...r,
                  votedHelpful: data.voted,
                  helpfulCount: r.helpfulCount + (data.voted ? 1 : -1),
                }
              : r
          )
        );
      }
    } catch {}
  };

  const toggleSpoiler = (id: number) => {
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Separate user's review from others for display
  const otherReviews = reviews.filter((r) => r.userId !== userId);
  const visible = showAll ? otherReviews : otherReviews.slice(0, 5);
  const canSubmit = currentRating > 0 && reviewText.trim().length >= 10;
  const showInput = userId && (!myReview || editing);
  const userName = session?.user?.name || "You";
  const userInitial = userName[0]?.toUpperCase() || "?";

  return (
    <div>
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
          </h2>
          {reviews.length > 0 && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
              {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </span>
          )}
        </div>
        <div style={{
          height: 1,
          background: `linear-gradient(90deg, rgba(${hRgb}, 0.2), transparent)`,
        }} />
      </div>

      {/* Review Input Area */}
      {userId && showInput && (
        <div style={{
          padding: 16,
          background: `rgba(${hRgb}, 0.03)`,
          border: `0.5px solid rgba(${hRgb}, 0.06)`,
          borderRadius: 12,
          marginBottom: 16,
        }}>
          {/* User info row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg, #E84855, #C45BAA)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {userInitial}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{userName}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                {currentRating > 0 ? (
                  <span>
                    <span style={{ color: "#f1c40f" }}>{"★".repeat(currentRating)}{"☆".repeat(5 - currentRating)}</span>
                    {currentRec && <span style={{ marginLeft: 6 }}>{REC_EMOJI[currentRec]}</span>}
                  </span>
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.2)" }}>Rate this item first to review</span>
                )}
              </div>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={reviewText}
            onChange={(e) => {
              if (e.target.value.length <= 5000) setReviewText(e.target.value);
            }}
            placeholder={currentRating > 0 ? "Share your thoughts..." : "Rate this item above to unlock reviewing"}
            disabled={currentRating === 0}
            style={{
              width: "100%",
              minHeight: 80,
              maxHeight: 300,
              padding: "10px 12px",
              background: currentRating > 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)",
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

          {/* Bottom row: spoiler + char count + submit */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 10,
            gap: 12,
          }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 11, color: "rgba(255,255,255,0.3)", cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={containsSpoilers}
                onChange={(e) => setContainsSpoilers(e.target.checked)}
                style={{ accentColor: "#E84855" }}
              />
              Contains spoilers
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontSize: 10,
                color: reviewText.length > 4800 ? "#E84855" : "rgba(255,255,255,0.15)",
              }}>
                {reviewText.length}/5000
              </span>

              {error && (
                <span style={{ fontSize: 11, color: "#E84855" }}>{error}</span>
              )}

              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                style={{
                  padding: "7px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: canSubmit && !submitting ? (heroColor || "#E84855") : "rgba(255,255,255,0.06)",
                  color: canSubmit && !submitting ? "#fff" : "rgba(255,255,255,0.2)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: canSubmit && !submitting ? "pointer" : "default",
                  transition: "background 0.15s",
                }}
              >
                {submitting ? "Posting..." : editing ? "Update Review" : "Post Review"}
              </button>

              {editing && (
                <button
                  onClick={() => {
                    setEditing(false);
                    if (myReview) {
                      setReviewText(myReview.text);
                      setContainsSpoilers(myReview.containsSpoilers);
                    }
                  }}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    background: "none",
                    color: "rgba(255,255,255,0.3)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User's own review (when not editing) */}
      {myReview && !editing && (
        <div style={{
          padding: "16px 18px",
          background: `rgba(${hRgb}, 0.04)`,
          border: `0.5px solid rgba(${hRgb}, 0.12)`,
          borderRadius: 12,
          marginBottom: 16,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg, #E84855, #C45BAA)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {userInitial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                {userName}
                <span style={{ fontSize: 9, color: "rgba(232,72,85,0.5)", marginLeft: 6, fontWeight: 500 }}>YOUR REVIEW</span>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>
                {timeAgo(myReview.createdAt)}
                {myReview.updatedAt !== myReview.createdAt && " (edited)"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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

          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, margin: 0 }}>
            {myReview.text}
          </p>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: "5px 12px", borderRadius: 6,
                border: "0.5px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.4)", fontSize: 11,
                cursor: "pointer",
              }}
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(myReview.id)}
              style={{
                padding: "5px 12px", borderRadius: 6,
                border: "0.5px solid rgba(232,72,85,0.15)",
                background: "rgba(232,72,85,0.06)",
                color: "rgba(232,72,85,0.6)", fontSize: 11,
                cursor: "pointer",
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
          background: `rgba(${hRgb}, 0.03)`,
          borderRadius: 12,
          border: `0.5px solid rgba(${hRgb}, 0.06)`,
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

      {/* Other reviews */}
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          Loading reviews...
        </div>
      ) : otherReviews.length === 0 && !myReview ? (
        <div style={{
          padding: "24px 20px",
          textAlign: "center",
          color: "rgba(255,255,255,0.2)",
          fontSize: 13,
          background: `rgba(${hRgb}, 0.03)`,
          borderRadius: 12,
          border: `0.5px solid rgba(${hRgb}, 0.06)`,
        }}>
          No reviews yet. Be the first to share your thoughts!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              currentUserId={userId || null}
              revealed={revealedSpoilers.has(review.id)}
              onRevealSpoiler={() => toggleSpoiler(review.id)}
              onHelpful={() => handleHelpful(review.id)}
              heroRgb={hRgb}
            />
          ))}
        </div>
      )}

      {/* Show more */}
      {otherReviews.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
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
            cursor: "pointer",
          }}
        >
          {showAll ? "Show less" : `See all ${otherReviews.length} reviews →`}
        </button>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  currentUserId,
  revealed,
  onRevealSpoiler,
  onHelpful,
  heroRgb,
}: {
  review: ReviewData;
  currentUserId: string | null;
  revealed: boolean;
  onRevealSpoiler: () => void;
  onHelpful: () => void;
  heroRgb: string;
}) {
  const recEmoji = review.recommendTag ? REC_EMOJI[review.recommendTag] || "" : "";
  const isSpoiler = review.containsSpoilers && !revealed;
  const isOwnReview = currentUserId === review.userId;

  return (
    <div style={{
      padding: "16px 18px",
      background: `rgba(${heroRgb}, 0.03)`,
      border: `0.5px solid rgba(${heroRgb}, 0.06)`,
      borderRadius: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "linear-gradient(135deg, #E84855, #C45BAA)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
        }}>
          {review.userAvatar ? (
            <img
              src={review.userAvatar}
              alt=""
              style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            review.userName[0]?.toUpperCase() || "?"
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/user/${review.userId}`}
            style={{ fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none" }}
          >
            {review.userName}
          </Link>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>
            {timeAgo(review.createdAt)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {review.score > 0 && (
            <span style={{ color: "#f1c40f", fontSize: 12 }}>
              {"★".repeat(review.score)}{"☆".repeat(5 - review.score)}
            </span>
          )}
          {recEmoji && <span style={{ fontSize: 12 }}>{recEmoji}</span>}
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
          <div style={{ fontSize: 16, marginBottom: 4 }}>⚠️</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            This review contains spoilers.{" "}
            <span style={{ color: "rgba(255,255,255,0.5)", textDecoration: "underline" }}>Click to reveal</span>
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
          <p style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
            lineHeight: 1.65,
            margin: 0,
          }}>
            {review.text}
          </p>
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
                ? "0.5px solid rgba(46,196,182,0.2)"
                : "0.5px solid rgba(255,255,255,0.06)",
              background: review.votedHelpful
                ? "rgba(46,196,182,0.08)"
                : "rgba(255,255,255,0.02)",
              color: review.votedHelpful
                ? "#2EC4B6"
                : "rgba(255,255,255,0.25)",
              fontSize: 10,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {review.votedHelpful ? "✓ Helpful" : "Helpful?"}
            {review.helpfulCount > 0 && (
              <span style={{ marginLeft: 2 }}>({review.helpfulCount})</span>
            )}
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
