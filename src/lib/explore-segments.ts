/**
 * URL segments for the server-rendered browse pages: /explore/<segment>
 *
 * Item detail pages use SINGULAR type segments (/movie/interstellar) while
 * browse pages use natural plural forms (/explore/movies). This module is
 * the single source of truth for that mapping — keep the footer's browse
 * links (src/components/footer.tsx) in sync if it changes.
 */

export const EXPLORE_SEGMENT_BY_TYPE: Record<string, string> = {
  movie: "movies",
  tv: "tv",
  book: "books",
  manga: "manga",
  comic: "comics",
  game: "games",
  music: "music",
  podcast: "podcasts",
};

export const TYPE_BY_EXPLORE_SEGMENT: Record<string, string> = Object.fromEntries(
  Object.entries(EXPLORE_SEGMENT_BY_TYPE).map(([type, segment]) => [segment, type])
);

export const EXPLORE_SEGMENTS: string[] = Object.values(EXPLORE_SEGMENT_BY_TYPE);
