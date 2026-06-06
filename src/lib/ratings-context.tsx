"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import type { RecTag } from "./data";

interface RatingsState {
  ratings: Record<number, number>;
  recTags: Record<number, RecTag | null>;
  rate: (id: number, score: number) => void;
  setRecTag: (id: number, tag: RecTag | null) => void;
}

const RatingsContext = createContext<RatingsState | null>(null);

export function RatingsProvider({ children }: { children: ReactNode }) {
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [recTags, setRecTags] = useState<Record<number, RecTag | null>>({});

  // Load ratings from database on mount
  useEffect(() => {
    fetch("/api/ratings")
      .then((r) => r.json())
      .then((data) => {
        if (data.ratings) setRatings(data.ratings);
        if (data.recTags) setRecTags(data.recTags);
      })
      .catch((e) => console.error("Failed to load ratings:", e));
  }, []);

  const rate = useCallback((id: number, score: number) => {
    // Snapshot current state for rollback on failure
    let prevScore: number | undefined;
    let prevRecTag: RecTag | null | undefined;
    setRatings((prev) => {
      prevScore = prev[id];
      if (score === 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: score };
    });
    if (score === 0) {
      setRecTags((prev) => {
        prevRecTag = prev[id];
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    // Persist to database. On failure, surface to user and revert
    // the optimistic UI so the visible rating reflects what's actually
    // stored. Console.error stays for dev debugging.
    fetch("/api/ratings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, score, recTag: null }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      })
      .catch((e) => {
        console.error("Failed to save rating:", e);
        toast.error("Couldn't save your rating. Please try again.");
        // Revert the optimistic state
        setRatings((curr) => {
          const next = { ...curr };
          if (prevScore === undefined) delete next[id];
          else next[id] = prevScore;
          return next;
        });
        if (score === 0 && prevRecTag !== undefined) {
          setRecTags((curr) => ({ ...curr, [id]: prevRecTag ?? null }));
        }
      });
  }, []);

  const setRecTag = useCallback((id: number, tag: RecTag | null) => {
    // Snapshot prev tag for rollback
    let prevTag: RecTag | null | undefined;
    setRecTags((prev) => {
      prevTag = prev[id];
      return { ...prev, [id]: tag };
    });

    // Persist — need current score to include in upsert
    setRatings((current) => {
      const score = current[id];
      if (score) {
        fetch("/api/ratings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: id, score, recTag: tag }),
        })
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
          })
          .catch((e) => {
            console.error("Failed to save recTag:", e);
            toast.error("Couldn't save your tag. Please try again.");
            setRecTags((curr) => ({ ...curr, [id]: prevTag ?? null }));
          });
      }
      return current; // no change to ratings
    });
  }, []);

  const value = useMemo(
    () => ({ ratings, recTags, rate, setRecTag }),
    [ratings, recTags, rate, setRecTag]
  );

  return (
    <RatingsContext.Provider value={value}>
      {children}
    </RatingsContext.Provider>
  );
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error("useRatings must be used within RatingsProvider");
  return ctx;
}
