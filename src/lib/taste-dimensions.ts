/**
 * Taste Dimensions System
 *
 * 10 dimensions scored 0.0–1.0 that describe items and user preferences.
 * Used for cosine similarity matching across media types.
 */

export interface TasteDimensions {
  dark_vs_light: number;
  serious_vs_fun: number;
  slow_vs_fast: number;
  complex_vs_simple: number;
  realistic_vs_fantastical: number;
  violence_tolerance: number;
  emotional_intensity: number;
  world_building_preference: number;
  character_vs_plot: number;
  novelty_vs_familiar: number;
}

const DIMENSION_KEYS: (keyof TasteDimensions)[] = [
  "dark_vs_light", "serious_vs_fun", "slow_vs_fast", "complex_vs_simple",
  "realistic_vs_fantastical", "violence_tolerance", "emotional_intensity",
  "world_building_preference", "character_vs_plot", "novelty_vs_familiar",
];

/** Default neutral profile */
export function neutralDimensions(): TasteDimensions {
  return Object.fromEntries(DIMENSION_KEYS.map((k) => [k, 0.5])) as unknown as TasteDimensions;
}

// ─── Keyword/tag mappings ────────────────────────────────────────────

const DARK_TAGS = new Set(["dark", "gritty", "noir", "brutal", "melancholic", "intense"]);
const LIGHT_TAGS = new Set(["wholesome", "uplifting", "cozy", "heartfelt", "funny", "heartwarming"]);

const SERIOUS_GENRES = new Set(["drama", "thriller", "mystery", "crime", "war", "history", "biography"]);
const FUN_GENRES = new Set(["comedy", "animation", "family", "musical", "kids"]);

const SLOW_TAGS = new Set(["slow burn", "slow-burn", "atmospheric", "cerebral", "melancholic"]);
const FAST_TAGS = new Set(["intense", "fast-paced", "fast paced", "chaotic", "brutal"]);

const COMPLEX_TAGS = new Set(["mind-bending", "mind bending", "thought-provoking", "thought provoking", "cerebral", "surreal"]);

const FANTASY_GENRES = new Set(["fantasy", "sci-fi", "science fiction", "supernatural", "superhero", "animation"]);
const REALIST_GENRES = new Set(["documentary", "biography", "history", "true crime", "news"]);

const VIOLENT_GENRES = new Set(["horror", "action", "war", "crime", "thriller"]);
const VIOLENT_TAGS = new Set(["dark", "intense", "brutal", "gritty"]);

const EMOTIONAL_TAGS = new Set(["emotional", "heartfelt", "heartbreaking", "melancholic", "wholesome", "heartwarming"]);

const WORLDBUILD_TAGS = new Set(["immersive", "epic", "atmospheric"]);
const WORLDBUILD_GENRES = new Set(["fantasy", "sci-fi", "science fiction"]);

const CHAR_TAGS = new Set(["slow burn", "slow-burn", "cerebral", "emotional", "heartfelt", "atmospheric"]);
const PLOT_TAGS = new Set(["fast-paced", "fast paced", "intense", "chaotic", "epic"]);

/** Description keyword signals (lowercase) */
const DESC_DARK = ["murder", "death", "blood", "horror", "dark", "sinister", "bleak", "grim"];
const DESC_COMPLEX = ["twist", "paradox", "reality", "dimension", "philosophical", "existential"];
const DESC_EMOTIONAL = ["grief", "loss", "love", "sacrifice", "heartbreak", "betrayal"];
const DESC_WORLD = ["kingdom", "empire", "world", "civilization", "universe", "realm"];

function countMatches(items: string[], matchSet: Set<string>): number {
  return items.filter((i) => matchSet.has(i.toLowerCase())).length;
}

function descKeywords(desc: string, keywords: string[]): number {
  const lower = desc.toLowerCase();
  return keywords.filter((k) => lower.includes(k)).length;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Calculate taste dimensions for an item based on its genres, vibes, description, and metadata.
 */
export function calculateItemDimensions(
  genres: string[],
  vibes: string[],
  description: string,
  totalEp: number = 0,
  voteCount: number = 0,
): TasteDimensions {
  const g = genres.map((s) => s.toLowerCase());
  const v = vibes.map((s) => s.toLowerCase());
  const desc = description || "";

  // dark_vs_light: dark vibes → 1.0, light vibes → 0.0
  const darkSignal = countMatches(v, DARK_TAGS) + descKeywords(desc, DESC_DARK) * 0.3;
  const lightSignal = countMatches(v, LIGHT_TAGS);
  const darkVsLight = clamp(0.5 + (darkSignal - lightSignal) * 0.15);

  // serious_vs_fun: drama/thriller → 1.0, comedy → 0.0
  const seriousSignal = countMatches(g, SERIOUS_GENRES);
  const funSignal = countMatches(g, FUN_GENRES);
  const seriousVsFun = clamp(0.5 + (seriousSignal - funSignal) * 0.15);

  // slow_vs_fast: slow-burn/atmospheric → 1.0, intense/fast → 0.0
  const slowSignal = countMatches(v, SLOW_TAGS);
  const fastSignal = countMatches(v, FAST_TAGS);
  const slowVsFast = clamp(0.5 + (slowSignal - fastSignal) * 0.15);

  // complex_vs_simple: mind-bending/thought-provoking → 1.0
  const complexSignal = countMatches(v, COMPLEX_TAGS) + descKeywords(desc, DESC_COMPLEX) * 0.3;
  const complexVsSimple = clamp(0.5 + complexSignal * 0.12);

  // realistic_vs_fantastical: fantasy/sci-fi → 1.0, documentary → 0.0
  const fantasySignal = countMatches(g, FANTASY_GENRES);
  const realistSignal = countMatches(g, REALIST_GENRES);
  const realisticVsFantastical = clamp(0.5 + (fantasySignal - realistSignal) * 0.2);

  // violence_tolerance: horror/action + dark/intense vibes → 1.0
  const violentGenre = countMatches(g, VIOLENT_GENRES);
  const violentVibe = countMatches(v, VIOLENT_TAGS);
  const violenceTolerance = clamp(0.5 + (violentGenre * 0.1 + violentVibe * 0.1));

  // emotional_intensity: emotional/heartfelt vibes → 1.0
  const emotionalSignal = countMatches(v, EMOTIONAL_TAGS) + descKeywords(desc, DESC_EMOTIONAL) * 0.2;
  const emotionalIntensity = clamp(0.5 + emotionalSignal * 0.12);

  // world_building_preference: immersive/epic + fantasy/sci-fi + long form → 1.0
  const wbVibe = countMatches(v, WORLDBUILD_TAGS);
  const wbGenre = countMatches(g, WORLDBUILD_GENRES);
  const wbLength = totalEp > 50 ? 0.15 : totalEp > 20 ? 0.1 : 0;
  const wbDesc = descKeywords(desc, DESC_WORLD) * 0.15;
  const worldBuildingPreference = clamp(0.5 + wbVibe * 0.1 + wbGenre * 0.08 + wbLength + wbDesc);

  // character_vs_plot: slow-burn/character vibes → 1.0, fast/action → 0.0
  const charSignal = countMatches(v, CHAR_TAGS);
  const plotSignal = countMatches(v, PLOT_TAGS);
  const characterVsPlot = clamp(0.5 + (charSignal - plotSignal) * 0.12);

  // novelty_vs_familiar: unusual genre combos + low vote counts → higher
  const genreComboRarity = g.length >= 3 ? 0.1 : 0;
  const lowVotes = voteCount < 1000 ? 0.15 : voteCount < 5000 ? 0.08 : 0;
  const noveltyVsFamiliar = clamp(0.5 + genreComboRarity + lowVotes);

  return {
    dark_vs_light: darkVsLight,
    serious_vs_fun: seriousVsFun,
    slow_vs_fast: slowVsFast,
    complex_vs_simple: complexVsSimple,
    realistic_vs_fantastical: realisticVsFantastical,
    violence_tolerance: violenceTolerance,
    emotional_intensity: emotionalIntensity,
    world_building_preference: worldBuildingPreference,
    character_vs_plot: characterVsPlot,
    novelty_vs_familiar: noveltyVsFamiliar,
  };
}

/**
 * Taste similarity between two dimension vectors, 0.0–1.0.
 *
 * Uses weighted Euclidean distance instead of cosine similarity.
 * Dimensions where the user has strong preferences (far from neutral 0.5)
 * are weighted more heavily, so a clear taste preference meaningfully
 * separates matching items from non-matching ones.
 * A neutral user profile (all ~0.5) produces near-1.0 for everything —
 * correct behavior when we don't yet know the user's preferences.
 */
export function tasteSimilarity(a: TasteDimensions, b: TasteDimensions): number {
  let weightedSqDiff = 0;
  let totalWeight = 0;

  for (const key of DIMENSION_KEYS) {
    // How strongly does the user prefer this dimension? (0 = neutral, 1 = extreme)
    const userStrength = Math.abs(a[key] - 0.5) * 2;
    // Weight = user's preference strength; neutral user weights all dims equally at 0.1
    const weight = Math.max(userStrength, 0.1);
    weightedSqDiff += weight * (a[key] - b[key]) ** 2;
    totalWeight += weight;
  }

  // Normalize: max possible weighted distance when all weights = 1 and all diffs = 1
  const normalizedDist = Math.sqrt(weightedSqDiff / totalWeight);
  // Map distance 0→1 to similarity 1→0
  return Math.max(0, 1 - normalizedDist);
}

/**
 * Find the highest-matching dimension name between two profiles.
 */
export function highestMatchingDimension(user: TasteDimensions, item: TasteDimensions): string {
  const labels: Record<keyof TasteDimensions, [string, string]> = {
    dark_vs_light: ["dark, intense stories", "light, uplifting stories"],
    serious_vs_fun: ["serious drama", "fun, lighthearted content"],
    slow_vs_fast: ["slow-burn storytelling", "fast-paced action"],
    complex_vs_simple: ["complex, layered narratives", "straightforward stories"],
    realistic_vs_fantastical: ["fantastical worlds", "grounded, realistic stories"],
    violence_tolerance: ["intense, gritty content", "milder content"],
    emotional_intensity: ["emotionally rich stories", "lighter emotional tone"],
    world_building_preference: ["deep world-building", "focused narratives"],
    character_vs_plot: ["character-driven stories", "plot-driven stories"],
    novelty_vs_familiar: ["hidden gems", "popular favorites"],
  };

  let bestKey: keyof TasteDimensions = "dark_vs_light";
  let bestMatch = -1;

  for (const key of DIMENSION_KEYS) {
    // How close are they on this dimension?
    const closeness = 1 - Math.abs(user[key] - item[key]);
    // Weight by how extreme both are (both near 0 or both near 1 = more meaningful)
    const extremity = Math.abs(user[key] - 0.5) + Math.abs(item[key] - 0.5);
    const score = closeness * (1 + extremity);
    if (score > bestMatch) {
      bestMatch = score;
      bestKey = key;
    }
  }

  const [highLabel, lowLabel] = labels[bestKey];
  return user[bestKey] >= 0.5 ? highLabel : lowLabel;
}

/**
 * Update a user's taste profile based on a new rating.
 * score 4-5: shift 10% toward item dimensions
 * score 1-2: shift 10% away
 * score 3: no shift
 */
export function updateTasteProfile(
  currentProfile: TasteDimensions,
  itemDimensions: TasteDimensions,
  score: number,
  ratingAgeDays: number = 0,
): TasteDimensions {
  if (score === 3) return currentProfile;

  // Time weighting
  let timeWeight = 1.0;
  if (ratingAgeDays <= 30) timeWeight = 1.5;
  else if (ratingAgeDays > 180) timeWeight = 0.7;

  const shiftAmount = 0.1 * timeWeight;
  const direction = score >= 4 ? 1 : -1; // positive = toward, negative = away

  const updated = { ...currentProfile };
  for (const key of DIMENSION_KEYS) {
    const diff = itemDimensions[key] - currentProfile[key];
    updated[key] = clamp(currentProfile[key] + diff * shiftAmount * direction);
  }

  return updated;
}

export { DIMENSION_KEYS };
