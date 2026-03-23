"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
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

  const rate = useCallback((id: number, score: number) => {
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
  }, []);

  const setRecTag = useCallback((id: number, tag: RecTag | null) => {
    setRecTags((prev) => ({ ...prev, [id]: tag }));
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
