"use client";

import { useState, useCallback } from "react";

/** Numeric review id from a People activity entry id ("review-<n>"); null for
 *  rating-only entries. Profile review ids are already numeric and don't need this. */
export function reviewIdOf(activityId: string): number | null {
  return activityId.startsWith("review-") ? (Number(activityId.slice(7)) || null) : null;
}

/**
 * Persisted up/down vote logic for a review, shared by the People activity
 * feed and the Public Profile reviews section so vote behaviour can't drift.
 * The displayed number is the up-vote count (helpfulCount). Optimistic update
 * with revert on failure; persists via POST /api/reviews/helpful.
 */
export function useReviewVote(
  reviewId: number | null,
  initialCount: number,
  initialMyVote: "up" | "down" | null,
) {
  const [myVote, setMyVote] = useState<"up" | "down" | null>(initialMyVote);
  const [count, setCount] = useState(initialCount);

  const vote = useCallback((dir: "up" | "down") => {
    if (!reviewId) return;
    const prevVote = myVote, prevCount = count;
    let nextVote: "up" | "down" | null;
    let nextCount = count;
    if (myVote === dir) {
      nextVote = null;
      if (dir === "up") nextCount = count - 1;
    } else {
      nextVote = dir;
      if (dir === "up") nextCount = count + 1;
      else if (myVote === "up") nextCount = count - 1; // switching up→down drops the up
    }
    setMyVote(nextVote);
    setCount(nextCount);
    fetch("/api/reviews/helpful", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId, voteType: dir }),
    })
      .then((r) => { if (!r.ok) throw new Error(); })
      .catch(() => { setMyVote(prevVote); setCount(prevCount); });
  }, [reviewId, myVote, count]);

  return { myVote, count, vote };
}
