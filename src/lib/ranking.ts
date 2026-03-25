/**
 * Quality ranking system for items across all views.
 * Handles scoring, filtering, deduplication, and diversity.
 */

// ── Normalized score ────────────────────────────────────────────────────
export function normalizeScore(ext: Record<string, number>, type: string): number {
  // Priority order per type
  const priorities: Record<string, string[]> = {
    movie: ["imdb", "rt", "meta", "rt_audience"],
    tv: ["imdb", "rt", "meta", "mal"],
    game: ["meta", "ign", "steam", "igdb"],
    book: ["goodreads"],
    manga: ["mal", "anilist"],
    comic: ["goodreads", "comicvine"],
    music: ["pitchfork", "spotify_popularity", "aoty"],
    podcast: ["spotify_popularity"],
  };

  const maxScales: Record<string, number> = {
    imdb: 10, rt: 100, rt_audience: 100, meta: 100, mal: 10, anilist: 100,
    goodreads: 5, ign: 10, steam: 100, pitchfork: 10, spotify_popularity: 100,
    igdb: 100, comicvine: 5, aoty: 100,
  };

  const order = priorities[type] || Object.keys(ext);

  // If rt_critics and rt_audience have big gap, average them
  if (ext.rt !== undefined && ext.rt_audience !== undefined) {
    const gap = Math.abs(ext.rt - ext.rt_audience);
    if (gap > 30) {
      const avg = (ext.rt + ext.rt_audience) / 2;
      ext = { ...ext, rt: avg };
    }
  }

  for (const key of order) {
    if (ext[key] !== undefined) {
      const scale = maxScales[key] || 10;
      return ext[key] / scale;
    }
  }

  // Fallback: try any available score
  for (const [key, val] of Object.entries(ext)) {
    const scale = maxScales[key] || 10;
    return val / scale;
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
  const norm = normalizeScore(item.ext, item.type);
  const votes = item.voteCount || item.popularityScore || 0;
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
  const norm = normalizeScore(item.ext, item.type);
  const votes = item.voteCount || item.popularityScore || 0;

  // Universal: must have title, cover, and real description
  if (!item.title) return false;
  if (!item.cover || !item.cover.startsWith("http")) return false;
  if (!item.description || item.description.length < 20) return false;

  switch (item.type) {
    case "movie":
    case "tv":
      return norm >= 0.6 && votes >= 50;
    case "game":
      return norm >= 0.6 && (votes >= 10 || item.ext.meta !== undefined);
    case "manga":
      return norm >= 0.6 && votes >= 100;
    case "book":
      return norm >= 0.6 && votes >= 20;
    case "music":
      // Music: accept if has any ext score >= 0.5, OR has spotify_popularity >= 15, OR popularityScore > 0
      if (norm >= 0.5) return true;
      if (item.ext.spotify_popularity !== undefined && item.ext.spotify_popularity >= 15) return true;
      return (item.popularityScore || 0) > 0;
    case "comic":
      // Comics: accept if has ext score >= 0.6 OR popularityScore > 0
      if (norm >= 0.6) return true;
      return (item.popularityScore || 0) > 0;
    case "podcast":
      // Podcasts: accept if has ext score >= 0.5 OR popularityScore > 0
      if (norm >= 0.5) return true;
      return (item.popularityScore || 0) > 0;
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
