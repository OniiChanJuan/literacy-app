"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { MediaType } from "./data";

export type LibraryStatus = "completed" | "in_progress" | "want_to" | "dropped";

export interface LibraryEntry {
  status: LibraryStatus;
  progress: number; // current progress (episodes, chapters, pages, hours)
}

/** Progress unit label per media type */
export function progressUnit(type: MediaType): string {
  switch (type) {
    case "movie": return "minutes";
    case "tv": return "episodes";
    case "book": return "pages";
    case "manga": return "chapters";
    case "comic": return "issues";
    case "game": return "hours";
    case "music": return "tracks";
    case "podcast": return "episodes";
  }
}

/** Whether this media type is ongoing (Completed → "Caught Up") */
export function isOngoing(type: MediaType): boolean {
  return type === "tv" || type === "manga" || type === "comic" || type === "podcast";
}

interface LibraryState {
  entries: Record<number, LibraryEntry>;
  setStatus: (id: number, status: LibraryStatus | null) => void;
  setProgress: (id: number, progress: number) => void;
}

const LibraryContext = createContext<LibraryState | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<number, LibraryEntry>>({});

  const setStatus = useCallback((id: number, status: LibraryStatus | null) => {
    setEntries((prev) => {
      if (status === null) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      const existing = prev[id];
      return { ...prev, [id]: { progress: existing?.progress ?? 0, status } };
    });
  }, []);

  const setProgress = useCallback((id: number, progress: number) => {
    setEntries((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, progress: Math.max(0, progress) } };
    });
  }, []);

  const value = useMemo(
    () => ({ entries, setStatus, setProgress }),
    [entries, setStatus, setProgress]
  );

  return (
    <LibraryContext.Provider value={value}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
