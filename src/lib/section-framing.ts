/**
 * Section framing — honest-labeling helper
 *
 * ─────────────────────────────────────────────────────────────────────
 * PLATFORM PRINCIPLE: section copy should reflect the actual basis of
 * what's shown, not what we wish it showed.
 *
 * If a section is mostly personalized → personalized framing.
 * If a section is mostly popularity-driven → popular framing.
 * If a section is empty under the user's filter → empty-state framing
 * (not a collapsed/hidden section that looks broken).
 *
 * "Cross your shelf" follows this same principle via its three-mode
 * logic (personalized / trending / discovery) inside
 * src/components/cross-your-shelf.tsx. That predates this helper and
 * uses inline copy. Future sections that need the same waterfall
 * should use this helper. The cross-shelf logic can migrate here
 * later for code-level consistency without changing user-facing copy.
 * ─────────────────────────────────────────────────────────────────────
 */

export interface FramingComposition {
  /** How many items came from a personal-signal tier (taste, ratings). */
  personal: number;
  /** How many came from a popularity / fallback tier. */
  popular: number;
}

export interface FramingContext {
  /** Active media-type filter, e.g. "anime". null = no filter. */
  filterType?: string | null;
  /** Pre-computed taste tags for the personalized subtitle. */
  tasteTags?: string[];
  /** Total slots the section is trying to fill (for threshold math). */
  target?: number;
}

export interface SectionFraming {
  title: string;
  subtitle: string;
  /** Where the "See all" link should point given the composition. */
  seeAllHref: string;
  /** Discriminator for downstream UI (e.g., empty-state rendering). */
  basis: "personal" | "popular" | "empty";
}

const TYPE_LABEL: Record<string, string> = {
  movie: "Movies",
  tv: "Shows",
  anime: "Anime",
  book: "Books",
  manga: "Manga",
  comic: "Comics",
  game: "Games",
  music: "Music",
  podcast: "Podcasts",
};

function typeLabelFor(t: string | null | undefined): string {
  if (!t) return "media";
  return TYPE_LABEL[t] ?? t;
}

/**
 * Frames the "Picked for you" section based on tier composition.
 *
 * Threshold: ≥ 5 of the 9 target items must be personal-tier for the
 * section to keep its personalized framing. Below that, the popular
 * tier dominates the result and the framing flips to "Popular [Type]"
 * so the copy never overclaims a personal connection.
 */
export function framePickedForYou(
  composition: FramingComposition,
  ctx: FramingContext = {},
): SectionFraming {
  const { filterType, tasteTags = [], target = 9 } = ctx;
  const total = composition.personal + composition.popular;

  // Empty state — no items survived the waterfall (rare, niche filter combos).
  if (total === 0) {
    return {
      title: "Picked for you",
      subtitle: filterType
        ? `No picks match ${typeLabelFor(filterType)} right now.`
        : "No picks available right now.",
      seeAllHref: filterType
        ? `/explore?type=${encodeURIComponent(filterType)}`
        : "/explore",
      basis: "empty",
    };
  }

  // Composition-based framing. The 5/9 threshold (~ majority) is the
  // honest cutoff — if half or more of the items are personal, the
  // "Picked for you" promise still holds.
  const personalMajority = composition.personal >= Math.ceil(target / 2);

  if (personalMajority) {
    const top = tasteTags.slice(0, 3);
    const subtitle = top.length > 0
      ? `Based on your taste in ${top.join(", ")}`
      : "Matched to your taste profile";
    return {
      title: "Picked for you",
      subtitle: filterType
        ? `${subtitle} · filtered to ${typeLabelFor(filterType)}`
        : subtitle,
      seeAllHref: filterType
        ? `/explore?type=${encodeURIComponent(filterType)}&sort=picked`
        : "/explore?sort=picked",
      basis: "personal",
    };
  }

  // Popular-majority — the user filtered into a slice of the catalog
  // we can't personalize well. Be honest about it.
  return {
    title: filterType ? `Popular ${typeLabelFor(filterType)}` : "Popular right now",
    subtitle: "Top-rated across CrossShelf in this category",
    seeAllHref: filterType
      ? `/explore?type=${encodeURIComponent(filterType)}&sort=top_rated`
      : "/explore?sort=top_rated",
    basis: "popular",
  };
}
