/**
 * Shared anime detection logic.
 * Used by cards, filters, and the catalog API to consistently identify anime items.
 */
export interface AnimeDetectable {
  type: string;
  title?: string | null;
  genre?: string[] | null;
  ext?: Record<string, any> | null;
  malId?: number | null;
  people?: Array<{ name: string; role: string }> | null;
}

// ---------------------------------------------------------------------------
// Safety nets — veto these regardless of database state
// ---------------------------------------------------------------------------

/**
 * Western animation directors whose work is never Japanese anime.
 * If an item's Director/Creator is in this set → not anime.
 */
const WESTERN_ANIMATION_DIRECTORS = new Set([
  // Pixar
  "john lasseter", "pete docter", "lee unkrich", "brad bird",
  "andrew stanton", "dan scanlon", "domee shi", "enrico casarosa",
  "kelly marie tran",
  // Disney Animation
  "roger allers", "rob minkoff", "ron clements", "john musker",
  "jennifer lee", "chris buck", "byron howard", "rich moore",
  "don hall", "carlos lópez estrada",
  // DreamWorks
  "andrew adamson", "vicky jenson", "kelly asbury", "cody cameron",
  "mark dindal", "eric darnell", "tim johnson",
  // Other Western studios / creators
  "genndy tartakovsky",  // Primal, Samurai Jack (US)
  "pendleton ward",      // Adventure Time (US)
  "rebecca sugar",       // Steven Universe (US)
  "alex hirsch",         // Gravity Falls (US)
  "justin roiland",      // Rick and Morty (US)
  "dan harmon",          // Rick and Morty (US)
  "michael dante dimartino", // Avatar: The Last Airbender (US)
  "bryan konietzko",         // Avatar: The Last Airbender (US)
  "christian linke",         // Arcane (French)
]);

/**
 * Known Western animated franchise title patterns that should never receive the anime badge.
 * These are a last-resort safety net for the frontend; the primary fix is keeping the
 * database clean (only real anime have 'Anime' genre or ext.mal).
 */
const WESTERN_TITLE_PATTERNS: RegExp[] = [
  /\btoy story\b/i,
  /\bthe lion king\b/i,
  /\bfinding (nemo|dory)\b/i,
  /\bfrozen( ii| 2)?\b/i,
  /\bshrek\b/i,
  /\bthe incredibles\b/i,
  /\binside out( 2)?\b/i,
  /\bmoana( 2)?\b/i,
  /\bratatouille\b/i,
  /\bwall-?e\b/i,
  /\bzootopia\b/i,
  /\bcoco\b/i,
  /^soul(\s+\(\d{4}\))?$/i,  // Only "Soul" or "Soul (2020)" — not "Soul Land", "Soul Eater", etc.
  /\bluca\b/i,
  /\bturning red\b/i,
  /\bencanto\b/i,
  /\bbluey\b/i,
  /\bavatar: the last airbender\b/i,
  /\bthe legend of korra\b/i,
  /\bgravity falls\b/i,
  /\brick and morty\b/i,
  /\barcane\b/i,
  /\binvincible\b/i,
  /\bbatman: the animated series\b/i,
  /\bteen titans go\b/i,
  /\bregular show\b/i,
  /\bprimal\b/i,
  /\bsteven universe\b/i,
  /\badventure time\b/i,
  /\bpuss in boots\b/i,
  /\bklaus\b/i,
  /\bspider-man: (into|across) the spider-verse\b/i,
  /\bstar wars[: ].*(resistance|rebels|clone wars)\b/i,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if an item is Japanese anime.
 *
 * Primary checks (any one makes it anime):
 *   1. genre includes 'Anime'  (set during Jikan import or our confirmed backfill)
 *   2. ext.mal score exists    (item was scored via Jikan's anime database)
 *
 * NOT sufficient alone: malId — MAL catalogs all animation including Disney/Pixar/Avatar/etc.
 *
 * Safety nets (veto even if primary checks pass):
 *   A. Director/Creator is a known Western animation creator
 *   B. Title matches a known Western animated franchise pattern
 */
export function isAnime(item: AnimeDetectable): boolean {
  if (item.type !== "tv" && item.type !== "movie") return false;

  // --- Primary checks ---
  const ext = item.ext as Record<string, any> | null | undefined;
  const passesCheck = (item.genre?.includes("Anime") ?? false) || (ext?.mal != null);
  if (!passesCheck) return false;

  // --- Safety net A: Western animation director/creator veto ---
  if (item.people && item.people.length > 0) {
    const keyRoles = item.people.filter(
      (p) => p.role === "Director" || p.role === "Creator" || p.role === "Directors" || p.role === "Creators"
    );
    if (keyRoles.some((p) => WESTERN_ANIMATION_DIRECTORS.has(p.name.toLowerCase()))) {
      return false;
    }
  }

  // --- Safety net B: Known Western animated franchise title veto ---
  if (item.title) {
    if (WESTERN_TITLE_PATTERNS.some((p) => p.test(item.title!))) {
      return false;
    }
  }

  return true;
}
