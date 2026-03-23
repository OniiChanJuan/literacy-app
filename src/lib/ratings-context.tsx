"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
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
    // Optimistic update
    setRatings((prev) => {
      if (score === 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: score };
    });
    if (score === 0) {
      setRecTags((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }

    // Persist to database
    fetch("/api/ratings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, score, recTag: null }),
    }).catch((e) => console.error("Failed to save rating:", e));
  }, []);

  const setRecTag = useCallback((id: number, tag: RecTag | null) => {
    // Optimistic update
    setRecTags((prev) => ({ ...prev, [id]: tag }));

    // Persist — need current score to include in upsert
    setRatings((current) => {
      const score = current[id];
      if (score) {
        fetch("/api/ratings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: id, score, recTag: tag }),
        }).catch((e) => console.error("Failed to save recTag:", e));
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
