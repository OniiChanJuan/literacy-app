/**
 * Minimum vote/rating counts required before a score source is displayed.
 * 0 = always show (editorial/curated sources that are reliable regardless of sample size).
 *
 * For community-aggregated sources, small sample sizes produce inflated scores
 * (e.g., a game with 1 IGDB rating of 99 is meaningless).
 *
 * Count sources per source key:
 *   tmdb, mal, google_books — use item.voteCount (stored from API)
 *   igdb, igdb_critics       — use ext.igdb_count / ext.igdb_critics_count (backfilled separately)
 *   steam                    — sync script already filters < 10 reviews; threshold = 50
 *   ign, imdb, rt_*, metacritic, pitchfork — editorial, threshold = 0
 */
export const SCORE_THRESHOLDS: Record<string, number> = {
  tmdb:              20,
  imdb:               0,  // Real editorial IMDb
  mal:               50,
  igdb:              20,
  igdb_critics:       5,
  google_books:      10,
  ign:                0,  // Real editorial IGN
  rt_critics:         0,  // Editorial
  rt_audience:        0,
  metacritic:         0,  // Editorial
  steam:             50,
  pitchfork:          0,  // Editorial
  spotify_popularity: 0,
  anilist:           20,
  opencritic:         5,
  aoty:               5,
  rym:                5,
  comicvine:          0,
  letterboxd:        10,
};

/**
 * For sources that store their vote count in ext JSON, the key name.
 * If present and below threshold: hide. If absent: show (assume OK, pending backfill).
 */
export const SCORE_COUNT_FIELD: Record<string, string> = {
  igdb:          "igdb_count",
  igdb_critics:  "igdb_critics_count",
};

/**
 * Returns true if a score should be displayed.
 * @param source  - score source key (e.g. "igdb", "tmdb")
 * @param ext     - item's ext JSON (for igdb_count, igdb_critics_count)
 * @param voteCount - item's voteCount field (used for tmdb, mal, google_books, steam)
 */
export function scorePassesThreshold(
  source: string,
  ext: Record<string, any>,
  voteCount: number,
): boolean {
  const threshold = SCORE_THRESHOLDS[source];
  if (threshold === undefined || threshold === 0) return true;

  // Sources that store their count in ext JSON
  const countField = SCORE_COUNT_FIELD[source];
  if (countField) {
    const storedCount = ext[countField];
    if (storedCount === undefined || storedCount === null) return true; // No count yet — show score
    return Number(storedCount) >= threshold;
  }

  // All other sources: use item.voteCount
  return voteCount >= threshold;
}
