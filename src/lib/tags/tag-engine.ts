/**
 * Tag Assignment Engine — merges tags from multiple layers.
 * Layer 1: API source tags (highest priority)
 * Layer 2: Keyword co-occurrence matching
 * Layer 3: Genre/vibe inference
 * Merging: max weight + 0.05 per additional confirming layer, cap 0.95
 */

import { tagAppliesTo, TAG_MAP } from "./tag-definitions";
import { matchKeywords } from "./keyword-clusters";
import {
  TMDB_KEYWORD_MAP,
  IGDB_THEME_MAP,
  IGDB_GAME_MODE_MAP,
  IGDB_GENRE_MAP,
  MAL_GENRE_MAP,
  MAL_THEME_MAP,
  MAL_DEMOGRAPHIC_MAP,
  SPOTIFY_GENRE_MAP,
  COMIC_VINE_CONCEPT_MAP,
} from "./api-mappings";

export interface WeightedTag {
  weight: number;
  category: string;
}

export type ItemTags = Record<string, WeightedTag>;

interface TagAssignmentInput {
  title: string;
  type: string;  // movie, tv, book, manga, comic, game, music, podcast
  description: string;
  genres: string[];
  vibes: string[];
  // API-specific data (optional)
  tmdbKeywords?: string[];
  igdbThemes?: number[];
  igdbGameModes?: number[];
  igdbGenres?: number[];
  malGenres?: string[];
  malThemes?: string[];
  malDemographic?: string;
  spotifyArtistGenres?: string[];
  spotifyFeatures?: { energy?: number; valence?: number; danceability?: number; acousticness?: number; instrumentalness?: number; tempo?: number };
  comicVineConcepts?: string[];
}

/**
 * Assign tags to an item by running all layers and merging.
 */
export function assignTags(input: TagAssignmentInput): ItemTags {
  const layers: Record<string, number>[] = [];

  // ── Layer 1: API source tags ──
  const apiTags = getApiTags(input);
  if (Object.keys(apiTags).length > 0) layers.push(apiTags);

  // ── Layer 2: Keyword co-occurrence ──
  const searchText = `${input.title} ${input.description}`;
  const keywordTags = matchKeywords(searchText, input.genres);
  if (Object.keys(keywordTags).length > 0) layers.push(keywordTags);

  // ── Layer 3: Genre/vibe inference ──
  const inferredTags = inferFromGenresAndVibes(input.genres, input.vibes, input.type);
  if (Object.keys(inferredTags).length > 0) layers.push(inferredTags);

  // ── Merge layers ──
  const merged = mergeLayers(layers, input.type);

  return merged;
}

/**
 * Layer 1: Extract tags from external API data
 */
function getApiTags(input: TagAssignmentInput): Record<string, number> {
  const tags: Record<string, number> = {};

  // TMDB keywords
  if (input.tmdbKeywords) {
    for (const kw of input.tmdbKeywords) {
      const slug = TMDB_KEYWORD_MAP[kw.toLowerCase()];
      if (slug) {
        tags[slug] = Math.max(tags[slug] || 0, 0.8);
      }
    }
  }

  // IGDB themes
  if (input.igdbThemes) {
    for (const themeId of input.igdbThemes) {
      const slug = IGDB_THEME_MAP[themeId];
      if (slug) tags[slug] = Math.max(tags[slug] || 0, 0.8);
    }
  }

  // IGDB game modes
  if (input.igdbGameModes) {
    for (const modeId of input.igdbGameModes) {
      const slug = IGDB_GAME_MODE_MAP[modeId];
      if (slug) tags[slug] = Math.max(tags[slug] || 0, 0.9); // primary classification
    }
  }

  // IGDB genres
  if (input.igdbGenres) {
    for (const genreId of input.igdbGenres) {
      const slugs = IGDB_GENRE_MAP[genreId];
      if (slugs) {
        for (const slug of slugs) {
          tags[slug] = Math.max(tags[slug] || 0, 0.85);
        }
      }
    }
  }

  // MAL genres
  if (input.malGenres) {
    for (const g of input.malGenres) {
      const slug = MAL_GENRE_MAP[g];
      if (slug) tags[slug] = Math.max(tags[slug] || 0, 0.8);
    }
  }

  // MAL themes
  if (input.malThemes) {
    for (const t of input.malThemes) {
      const slug = MAL_THEME_MAP[t];
      if (slug) tags[slug] = Math.max(tags[slug] || 0, 0.85);
    }
  }

  // MAL demographic
  if (input.malDemographic) {
    const slug = MAL_DEMOGRAPHIC_MAP[input.malDemographic];
    if (slug) tags[slug] = Math.max(tags[slug] || 0, 0.9);
  }

  // Spotify genres
  if (input.spotifyArtistGenres) {
    for (const g of input.spotifyArtistGenres) {
      const low = g.toLowerCase();
      // Try exact match first, then partial
      let slug = SPOTIFY_GENRE_MAP[low];
      if (!slug) {
        for (const [key, val] of Object.entries(SPOTIFY_GENRE_MAP)) {
          if (low.includes(key)) { slug = val; break; }
        }
      }
      if (slug) tags[slug] = Math.max(tags[slug] || 0, 0.85);
    }
  }

  // Spotify audio features → tone tags
  if (input.spotifyFeatures) {
    const f = input.spotifyFeatures;
    if (f.energy !== undefined && f.energy > 0.8) tags["fast-paced"] = Math.max(tags["fast-paced"] || 0, 0.7);
    if (f.energy !== undefined && f.energy < 0.3) tags["meditative"] = Math.max(tags["meditative"] || 0, 0.6);
    if (f.valence !== undefined && f.valence > 0.7) tags["uplifting"] = Math.max(tags["uplifting"] || 0, 0.6);
    if (f.valence !== undefined && f.valence < 0.3) tags["melancholic"] = Math.max(tags["melancholic"] || 0, 0.6);
    if (f.acousticness !== undefined && f.acousticness > 0.7) tags["acoustic"] = Math.max(tags["acoustic"] || 0, 0.7);
    if (f.instrumentalness !== undefined && f.instrumentalness > 0.5) tags["instrumental"] = Math.max(tags["instrumental"] || 0, 0.7);
    if (f.danceability !== undefined && f.danceability > 0.7) tags["party"] = Math.max(tags["party"] || 0, 0.6);
  }

  // Comic Vine concepts
  if (input.comicVineConcepts) {
    for (const c of input.comicVineConcepts) {
      const slug = COMIC_VINE_CONCEPT_MAP[c.toLowerCase()];
      if (slug) tags[slug] = Math.max(tags[slug] || 0, 0.8);
    }
  }

  return tags;
}

/**
 * Layer 3: Infer tags from existing genre and vibe arrays.
 * This catches items that have good genre/vibe data but no API keywords.
 */
function inferFromGenresAndVibes(
  genres: string[],
  vibes: string[],
  type: string,
): Record<string, number> {
  const tags: Record<string, number> = {};
  const lowerGenres = new Set(genres.map(g => g.toLowerCase()));
  const lowerVibes = new Set(vibes.map(v => v.toLowerCase()));

  // Genre → tag mapping (universal)
  const genreToTag: Record<string, string[]> = {
    "sci-fi": ["near-future"], "science fiction": ["near-future"],
    "fantasy": ["medieval"], "dark fantasy": ["medieval", "brutal"],
    "horror": ["eerie", "tense"], "thriller": ["suspenseful", "tense"],
    "mystery": ["mystery-box", "whodunit"], "crime": ["underworld"],
    "romance": ["intimate"], "drama": ["intimate"],
    "comedy": ["playful"], "action": ["fast-paced"],
    "adventure": ["exploration"], "western": ["rural"],
    "war": ["war", "warzone"], "historical": ["ancient-world"],
    "documentary": ["documentary-style", "based-on-true-story"],
    "animation": ["whimsical"], "family": ["family", "cozy"],
    "psychological": ["philosophical", "tense"],
  };

  for (const [genre, tagSlugs] of Object.entries(genreToTag)) {
    if (lowerGenres.has(genre)) {
      for (const slug of tagSlugs) {
        tags[slug] = Math.max(tags[slug] || 0, 0.5);
      }
    }
  }

  // Vibe → tag mapping
  const vibeToTag: Record<string, string> = {
    "dark": "bleak", "atmospheric": "meditative", "mind-bending": "philosophical",
    "slow burn": "slow-burn", "thought-provoking": "philosophical",
    "emotional": "intimate", "epic": "grandiose", "intense": "tense",
    "wholesome": "cozy", "gritty": "brutal", "heartbreaking": "melancholic",
    "satirical": "satirical", "surreal": "dreamscape", "brutal": "brutal",
    "uplifting": "uplifting", "chaotic": "chaotic", "immersive": "dense",
    "melancholic": "melancholic", "stylish": "noir", "cozy": "cozy",
    "cerebral": "philosophical", "heartfelt": "sincere", "funny": "playful",
    "fast-paced": "fast-paced",
  };

  for (const [vibe, slug] of Object.entries(vibeToTag)) {
    if (lowerVibes.has(vibe)) {
      tags[slug] = Math.max(tags[slug] || 0, 0.55);
    }
  }

  // Music genre → music tags
  if (type === "music") {
    const musicGenreToTag: Record<string, string> = {
      "hip-hop": "hip-hop", "rock": "rock", "pop": "pop",
      "electronic": "electronic", "r&b": "rnb", "metal": "metal",
      "jazz": "jazz", "classical": "classical", "indie": "indie-rock",
      "punk": "punk", "alternative": "alternative", "country": "country",
      "folk": "folk", "latin": "latin", "k-pop": "k-pop",
      "soul": "soul", "funk": "funk", "blues": "blues",
      "ambient": "ambient",
    };
    for (const [g, slug] of Object.entries(musicGenreToTag)) {
      if (lowerGenres.has(g)) {
        tags[slug] = Math.max(tags[slug] || 0, 0.7);
      }
    }
  }

  return tags;
}

/**
 * Merge tags from multiple layers.
 * Same tag from multiple layers: max(weights) + 0.05 × (extra layers - 1), cap 0.95.
 * Enforce media type restrictions.
 */
function mergeLayers(
  layers: Record<string, number>[],
  mediaType: string,
): ItemTags {
  // Collect all weights per tag
  const tagWeights: Record<string, number[]> = {};

  for (const layer of layers) {
    for (const [slug, weight] of Object.entries(layer)) {
      if (!tagWeights[slug]) tagWeights[slug] = [];
      tagWeights[slug].push(weight);
    }
  }

  // Merge
  const result: ItemTags = {};

  for (const [slug, weights] of Object.entries(tagWeights)) {
    // Media type enforcement
    if (!tagAppliesTo(slug, mediaType)) continue;

    const maxWeight = Math.max(...weights);
    const bonus = (weights.length - 1) * 0.05;
    const finalWeight = Math.min(0.95, maxWeight + bonus);

    if (finalWeight < 0.2) continue; // threshold

    const def = TAG_MAP.get(slug);
    result[slug] = {
      weight: Math.round(finalWeight * 100) / 100,
      category: def?.category || "theme",
    };
  }

  return result;
}

/**
 * Calculate tag similarity between two items.
 * sum(min(wA, wB) for shared tags) / max(sumA, sumB)
 */
export function tagSimilarity(tagsA: ItemTags, tagsB: ItemTags): number {
  if (!tagsA || !tagsB) return 0;

  const slugsA = Object.keys(tagsA);
  const slugsB = Object.keys(tagsB);
  if (slugsA.length === 0 || slugsB.length === 0) return 0;

  let sharedScore = 0;
  for (const slug of slugsA) {
    if (tagsB[slug]) {
      sharedScore += Math.min(tagsA[slug].weight, tagsB[slug].weight);
    }
  }

  const sumA = slugsA.reduce((s, slug) => s + tagsA[slug].weight, 0);
  const sumB = slugsB.reduce((s, slug) => s + tagsB[slug].weight, 0);
  const maxSum = Math.max(sumA, sumB);

  if (maxSum === 0) return 0;
  return sharedScore / maxSum;
}

/**
 * Get top N tags sorted by weight for display.
 */
export function getTopTags(
  itemTags: ItemTags | null | undefined,
  n: number = 7,
  minWeight: number = 0.4,
): { slug: string; weight: number; category: string }[] {
  if (!itemTags) return [];

  return Object.entries(itemTags)
    .filter(([, t]) => t.weight >= minWeight)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, n)
    .map(([slug, t]) => ({ slug, weight: t.weight, category: t.category }));
}
