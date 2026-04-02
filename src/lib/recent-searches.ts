/**
 * Recent searches — localStorage helpers.
 * Key: 'literacy_recent_searches'
 * Value: [{ query: string, timestamp: number }, ...]
 * Max 10 entries, deduped, most recent first.
 */

const KEY = "literacy_recent_searches";
const MAX = 10;

export interface RecentSearch {
  query: string;
  timestamp: number;
}

export function getRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSearch[];
  } catch {
    return [];
  }
}

export function saveRecentSearch(query: string): void {
  if (typeof window === "undefined") return;
  const q = query.trim();
  if (q.length < 2) return;

  const existing = getRecentSearches();
  // Remove duplicate (case-insensitive)
  const filtered = existing.filter((r) => r.query.toLowerCase() !== q.toLowerCase());
  // Prepend new entry
  const updated = [{ query: q, timestamp: Date.now() }, ...filtered].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {}
}

export function removeRecentSearch(query: string): RecentSearch[] {
  if (typeof window === "undefined") return [];
  const updated = getRecentSearches().filter(
    (r) => r.query.toLowerCase() !== query.toLowerCase()
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {}
  return updated;
}

export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
