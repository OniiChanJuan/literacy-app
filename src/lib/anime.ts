/**
 * Shared anime detection logic.
 * Used by cards, filters, and the catalog API to consistently identify anime items.
 */
export interface AnimeDetectable {
  type: string;
  genre?: string[] | null;
  ext?: Record<string, any> | null;
  malId?: number | null;
}

/**
 * Returns true if an item is Japanese anime.
 * Detection rules (any one is sufficient):
 *   1. ext.mal score exists (was imported directly from Jikan — most reliable)
 *   2. genre explicitly includes 'Anime' (backfilled via backfill-anime-genre.ts, or Jikan-sourced)
 *
 * Note: malId alone is NOT sufficient — many Western animated shows (Avatar, Adventure Time,
 * Batman, Star Wars Clone Wars, etc.) appear in MAL and would false-positive.
 * The database backfill (backfill-anime-genre.ts) has already tagged all confirmed anime
 * with the 'Anime' genre. New imports from TMDB that get MAL cross-referenced should also
 * receive the 'Anime' genre tag in the cross-reference pipeline (see scripts/cross-reference-anime.ts).
 */
export function isAnime(item: AnimeDetectable): boolean {
  if (item.type !== "tv" && item.type !== "movie") return false;

  // Check 1: ext.mal score exists (came from Jikan directly — very reliable)
  const ext = item.ext as Record<string, any> | null | undefined;
  if (ext && ext.mal != null) return true;

  // Check 2: explicitly tagged as Anime (backfilled or Jikan-sourced genre)
  if (item.genre?.includes("Anime")) return true;

  return false;
}
