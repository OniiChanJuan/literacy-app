/**
 * Quality ranking system for items across all views.
 * Handles scoring, filtering, deduplication, and diversity.
 */

// ── Normalized score ────────────────────────────────────────────────────
/**
 * Normalize an item's best available score to 0.0–1.0.
 * @param voteCount - item's community vote count; used to filter community sources below their minimum threshold
 */
export function normalizeScore(ext: Record<string, number>, type: string, voteCount = 0): number {
  // Priority order per type — prefer real editorial sources, then community
  const priorities: Record<string, string[]> = {
    movie: ["imdb", "tmdb", "rt_critics", "metacritic"],
    tv:    ["imdb", "tmdb", "rt_critics", "mal"],
    game:  ["igdb_critics", "igdb", "metacritic", "opencritic", "steam"],
    book:  ["google_books"],
    manga: ["mal", "anilist"],
    comic: ["google_books", "comicvine"],
    music: ["pitchfork", "spotify_popularity", "aoty", "rym"],
    podcast: ["spotify_popularity"],
  };

  const maxScales: Record<string, number> = {
    tmdb: 10, igdb: 100, igdb_critics: 100, google_books: 5,
    spotify_popularity: 100,
    imdb: 10, rt_critics: 100, rt_audience: 100,
    metacritic: 100, mal: 10, anilist: 100,
    steam: 100, pitchfork: 10,
    comicvine: 5, aoty: 100, opencritic: 100, rym: 5,
    letterboxd: 5, storygraph: 5,
  };

  // Minimum vote counts for community-aggregated sources.
  // Editorial sources (imdb, rt_*, metacritic, pitchfork, spotify_popularity) have no minimum.
  const rankThresholds: Record<string, number> = {
    tmdb: 20, mal: 50, igdb: 20, igdb_critics: 5,
    google_books: 10, steam: 50, anilist: 20,
    opencritic: 5, aoty: 5, rym: 5, letterboxd: 10,
  };

  const order = priorities[type] || Object.keys(ext);

  // If rt_critics and rt_audience have big gap, average them
  if (ext.rt_critics !== undefined && ext.rt_audience !== undefined) {
    const gap = Math.abs(ext.rt_critics - ext.rt_audience);
    if (gap > 30) {
      const avg = (ext.rt_critics + ext.rt_audience) / 2;
      ext = { ...ext, rt_critics: avg };
    }
  }

  for (const key of order) {
    if (ext[key] === undefined) continue;
    // Skip community sources that don't meet the minimum vote threshold
    const threshold = rankThresholds[key];
    if (threshold !== undefined && voteCount < threshold) continue;
    const scale = maxScales[key] || 10;
    return ext[key] / scale;
  }

  // Fallback: use any editorial score regardless of vote count
  const editorialKeys = ["imdb", "rt_critics", "metacritic", "pitchfork"];
  for (const key of editorialKeys) {
    if (ext[key] !== undefined) {
      return ext[key] / (maxScales[key] || 10);
    }
  }

  return 0;
}

// ── Quality rank ────────────────────────────────────────────────────────
export function qualityRank(item: {
  ext: Record<string, number>;
  type: string;
  year: number;
  voteCount?: number;
  popularityScore?: number;
}, currentYear = 2026): number {
  const votes = item.voteCount || item.popularityScore || 0;
  const norm = normalizeScore(item.ext, item.type, votes);
  const logVotes = Math.log10(votes + 1);
  const yearDiff = currentYear - item.year;
  const recencyBonus = yearDiff <= 0 ? 1.2 : yearDiff === 1 ? 1.1 : yearDiff === 2 ? 1.05 : 1.0;

  // Items less than 30 days old: halve vote weight
  const isVeryNew = item.year === currentYear;

  let rank = (norm * 0.5) + (logVotes * (isVeryNew ? 0.125 : 0.25)) + (recencyBonus * 0.1);

  // False positive check: top 5% score but bottom 25% votes
  if (norm > 0.9 && votes < 100) {
    rank *= 0.7;
  }

  return rank;
}

// ── Quality floors ──────────────────────────────────────────────────────
export function meetsQualityFloor(item: {
  type: string;
  ext: Record<string, number>;
  voteCount?: number;
  popularityScore?: number;
  title?: string;
  cover?: string;
  description?: string;
}): boolean {
  const votes = item.voteCount || item.popularityScore || 0;
  const norm = normalizeScore(item.ext, item.type, votes);

  // Universal: must have title, cover, and real description
  if (!item.title) return false;
  if (!item.cover || !item.cover.startsWith("http")) return false;
  if (!item.description || item.description.length < 20) return false;

  switch (item.type) {
    case "movie":
    case "tv":
      return norm >= 0.6 && votes >= 50;
    case "game":
      return norm >= 0.6 && (votes >= 10 || item.ext.metacritic !== undefined || item.ext.igdb !== undefined);
    case "manga":
      return norm >= 0.6 && votes >= 100;
    case "book":
      // Require 5+ votes to filter out textbooks and obscure single-rating entries
      return norm >= 0.5 && votes >= 5;
    case "music":
      // Require votes or meaningful Spotify signal — no-signal albums shouldn't surface
      if (norm >= 0.5 && votes >= 5) return true;
      if ((item.ext as any).spotify_popularity !== undefined && (item.ext as any).spotify_popularity >= 20) return true;
      return false;
    case "comic":
      // Comics have fewer ratings — keep bar lower at 3
      return norm >= 0.6 && votes >= 3;
    case "podcast":
      // Accept if has signal: votes or enough episodes as popularity proxy
      if (norm >= 0.5 && votes >= 3) return true;
      if ((item.ext as any).spotify_popularity !== undefined && (item.ext as any).spotify_popularity >= 15) return true;
      return false;
    default:
      return norm >= 0.5;
  }
}

// ── Diversity enforcement ───────────────────────────────────────────────
interface DiversityItem {
  id: number;
  type: string;
  year: number;
  genre: string[];
  people?: any[];
  franchiseId?: number | null;
}

export function applyDiversity(
  items: DiversityItem[],
  maxPerFranchise = 3,
  maxPerCreator = 2,
  maxPerDecade = 3,
): DiversityItem[] {
  const franchiseCount = new Map<number, number>();
  const creatorCount = new Map<string, number>();
  const decadeCount = new Map<number, number>();
  const result: DiversityItem[] = [];

  for (const item of items) {
    const decade = Math.floor(item.year / 10) * 10;

    // Check franchise cap
    if (item.franchiseId) {
      const fc = franchiseCount.get(item.franchiseId) || 0;
      if (fc >= maxPerFranchise) continue;
      franchiseCount.set(item.franchiseId, fc + 1);
    }

    // Check creator cap
    const creators = Array.isArray(item.people)
      ? (item.people as any[])
          .filter((p) => ["Director", "Author", "Creator", "Developer"].some((r) => (p.role || "").includes(r)))
          .map((p) => p.name?.toLowerCase())
          .filter(Boolean)
      : [];

    let creatorBlocked = false;
    for (const c of creators) {
      const cc = creatorCount.get(c) || 0;
      if (cc >= maxPerCreator) { creatorBlocked = true; break; }
    }
    if (creatorBlocked) continue;
    creators.forEach((c) => creatorCount.set(c, (creatorCount.get(c) || 0) + 1));

    // Check decade cap (soft — only enforce after 8 items to allow some clusters)
    const dc = decadeCount.get(decade) || 0;
    if (dc >= maxPerDecade && result.length > 8) continue;
    decadeCount.set(decade, dc + 1);

    result.push(item);
  }

  return result;
}

// ── Row deduplication ───────────────────────────────────────────────────
export class RowDeduplicator {
  private usedIds = new Set<number>();

  exclude(items: any[]): any[] {
    return items.filter((item) => {
      if (this.usedIds.has(item.id)) return false;
      this.usedIds.add(item.id);
      return true;
    });
  }

  markUsed(ids: number[]) {
    ids.forEach((id) => this.usedIds.add(id));
  }
}

// ── Type interleaving ───────────────────────────────────────────────────
/**
 * Reorders items so media types are spread out rather than clustered.
 * Uses round-robin from largest type bucket first, so the most common
 * type is maximally distributed. Never shows more than ~2 of the same
 * type consecutively unless one type dominates heavily.
 */
export function interleaveByType<T extends { type: string }>(items: T[]): T[] {
  if (items.length <= 1) return items;

  // Group into per-type buckets preserving order within each type
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const b = buckets.get(item.type) || [];
    b.push(item);
    buckets.set(item.type, b);
  }

  // Sort buckets by initial size desc so the largest type is spread most evenly
  const sorted = [...buckets.values()].sort((a, b) => b.length - a.length);

  const result: T[] = [];
  while (sorted.some((b) => b.length > 0)) {
    for (const bucket of sorted) {
      if (bucket.length > 0) result.push(bucket.shift()!);
    }
  }
  return result;
}

// ── Vibe keyword analysis ───────────────────────────────────────────────
const VIBE_KEYWORDS: Record<string, string[]> = {
  "emotional": ["grief", "loss", "heartbreak", "tears", "moving", "touching", "poignant", "bittersweet", "devastating", "tender", "love", "sacrifice", "emotional"],
  "dark": ["murder", "death", "horror", "nightmare", "bleak", "grim", "sinister", "twisted", "disturbing", "violent", "gritty", "noir", "dark"],
  "atmospheric": ["immersive", "world-building", "haunting", "ethereal", "moody", "ambient", "dreamlike", "surreal", "meditative", "atmospheric"],
  "epic": ["war", "battle", "kingdom", "empire", "destiny", "quest", "journey", "legendary", "saga", "ancient", "throne", "epic"],
  "mind-bending": ["twist", "paradox", "reality", "dimension", "time travel", "loop", "illusion", "perception", "consciousness", "simulation", "mind"],
  "wholesome": ["heartwarming", "friendship", "family", "cozy", "gentle", "uplifting", "hopeful", "sweet", "charming", "feel-good", "wholesome"],
  "intense": ["suspense", "edge of seat", "adrenaline", "relentless", "gripping", "pulse-pounding", "nonstop", "high-stakes", "intense", "thriller"],
  "slow-burn": ["buildup", "patience", "gradual", "layered", "deliberate", "unfolding", "simmering", "tension", "slow burn", "character study"],
  "funny": ["comedy", "humor", "laugh", "hilarious", "witty", "satirical", "absurd", "parody", "slapstick", "funny"],
  "cerebral": ["philosophical", "existential", "intellectual", "thought-provoking", "complex", "nuanced", "deep", "symbolic", "allegorical", "cerebral"],
  "stylish": ["visual", "aesthetic", "cinematic", "artistic", "stunning", "beautiful", "colorful", "sleek", "style", "stylish"],
  "brutal": ["violent", "graphic", "bloody", "savage", "ruthless", "merciless", "hardcore", "unflinching", "raw", "brutal"],
  "cozy": ["comfort", "warm", "relaxing", "peaceful", "calm", "soothing", "nostalgic", "homey", "gentle", "cozy"],
  "melancholic": ["sad", "melancholy", "wistful", "longing", "nostalgia", "bittersweet", "somber", "lonely", "reflective", "melancholic"],
};

export function analyzeVibes(description: string, genres: string[], existingVibes: string[]): Record<string, number> {
  const text = [description, ...genres, ...existingVibes].join(" ").toLowerCase();
  const weights: Record<string, number> = {};

  for (const [vibe, keywords] of Object.entries(VIBE_KEYWORDS)) {
    let weight = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) weight += 0.1;
    }
    // Existing vibe tag is worth 0.3
    if (existingVibes.some((v) => v.toLowerCase().includes(vibe))) {
      weight += 0.3;
    }
    weights[vibe] = Math.min(weight, 1.0);
  }

  return weights;
}

// ── Search result ranking ───────────────────────────────────────────────
export function rankSearchResults(
  results: any[],
  query: string,
): any[] {
  const q = query.toLowerCase().trim();

  return results.sort((a, b) => {
    const aTitle = (a.title || "").toLowerCase();
    const bTitle = (b.title || "").toLowerCase();

    // Exact title match first
    const aExact = aTitle === q ? 100 : 0;
    const bExact = bTitle === q ? 100 : 0;
    if (aExact !== bExact) return bExact - aExact;

    // Starts-with match
    const aStarts = aTitle.startsWith(q) ? 50 : 0;
    const bStarts = bTitle.startsWith(q) ? 50 : 0;
    if (aStarts !== bStarts) return bStarts - aStarts;

    // Local results beat API results
    const aLocal = a.source === "local" ? 20 : 0;
    const bLocal = b.source === "local" ? 20 : 0;
    if (aLocal !== bLocal) return bLocal - aLocal;

    // Then by relevance × popularity
    const aPop = Math.log10((a.voteCount || a.popularityScore || 1) + 1);
    const bPop = Math.log10((b.voteCount || b.popularityScore || 1) + 1);
    return bPop - aPop;
  });
}
