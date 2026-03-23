"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import type { MediaType } from "./data";

export type LibraryStatus = "completed" | "in_progress" | "want_to" | "dropped";

export interface LibraryEntry {
  status: LibraryStatus;
  progress: number;
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

  // Load library entries from database on mount
  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) {
          // Convert status strings to LibraryStatus type
          const typed: Record<number, LibraryEntry> = {};
          for (const [id, entry] of Object.entries(data.entries)) {
            const e = entry as { status: string; progress: number };
            typed[Number(id)] = { status: e.status as LibraryStatus, progress: e.progress };
          }
          setEntries(typed);
        }
      })
      .catch((e) => console.error("Failed to load library:", e));
  }, []);

  const setStatus = useCallback((id: number, status: LibraryStatus | null) => {
    // Optimistic update
    setEntries((prev) => {
      if (status === null) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      const existing = prev[id];
      return { ...prev, [id]: { progress: existing?.progress ?? 0, status } };
    });

    // Persist to database
    fetch("/api/library", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, status }),
    }).catch((e) => console.error("Failed to save library status:", e));
  }, []);

  const setProgress = useCallback((id: number, progress: number) => {
    const clamped = Math.max(0, progress);

    // Optimistic update
    setEntries((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      return { ...prev, [id]: { ...existing, progress: clamped } };
    });

    // Persist to database
    fetch("/api/library/progress", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, progress: clamped }),
    }).catch((e) => console.error("Failed to save progress:", e));
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
