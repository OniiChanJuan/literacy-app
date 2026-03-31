/**
 * Shared anime detection logic.
 * Used by cards, filters, and the catalog API to consistently identify anime items.
 */
export interface AnimeDetectable {
  type: string;
  genre?: string[] | null;
  ext?: Record<string, any> | null;
}

/**
 * Returns true if an item is Japanese anime.
 * Detection rules (any one is sufficient):
 *   1. type is 'tv' or 'movie' AND has ext.mal (was imported from MyAnimeList via Jikan)
 *   2. type is 'tv' or 'movie' AND genre includes 'Anime'
 * Western animation (Pixar, Disney, Avatar, etc.) has no mal score → NOT marked as anime.
 */
export function isAnime(item: AnimeDetectable): boolean {
  if (item.type !== "tv" && item.type !== "movie") return false;
  const ext = item.ext as Record<string, any> | null | undefined;
  if (ext && ext.mal != null) return true;
  if (item.genre?.includes("Anime")) return true;
  return false;
}
