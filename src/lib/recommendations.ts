import { Item, ITEMS } from "./data";

/** Count shared elements between two arrays */
function overlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

/** Score how similar two items are based on genre + vibe overlap */
function similarityScore(a: Item, b: Item): number {
  const genreScore = overlap(a.genre, b.genre);
  const vibeScore = overlap(a.vibes, b.vibes);
  return genreScore * 2 + vibeScore; // genres weighted higher
}

/**
 * "More [same type]" — same media type, sorted by similarity
 */
export function getMoreSameType(item: Item, limit = 8): Item[] {
  return ITEMS
    .filter((i) => i.id !== item.id && i.type === item.type)
    .sort((a, b) => similarityScore(item, b) - similarityScore(item, a))
    .slice(0, limit);
}

/**
 * "Across Media" — different type, highest genre+vibe overlap
 */
export function getAcrossMedia(item: Item, limit = 8): Item[] {
  return ITEMS
    .filter((i) => i.id !== item.id && i.type !== item.type)
    .sort((a, b) => similarityScore(item, b) - similarityScore(item, a))
    .slice(0, limit);
}

/**
 * "Deep Cuts" — same vibes but more niche / less obvious overlap
 * (different type OR same type with lower genre overlap but high vibe match)
 */
export function getDeepCuts(item: Item, limit = 8): Item[] {
  return ITEMS
    .filter((i) => i.id !== item.id)
    .map((i) => ({
      item: i,
      vibeScore: overlap(item.vibes, i.vibes),
      genreScore: overlap(item.genre, i.genre),
    }))
    .filter((x) => x.vibeScore > 0)
    .sort((a, b) => {
      // Prioritize vibe match, de-prioritize genre match (find hidden gems)
      const scoreA = a.vibeScore * 3 - a.genreScore;
      const scoreB = b.vibeScore * 3 - b.genreScore;
      return scoreB - scoreA;
    })
    .slice(0, limit)
    .map((x) => x.item);
}

/**
 * "Something Different" — low similarity, different vibes/genres
 */
export function getSomethingDifferent(item: Item, limit = 8): Item[] {
  return ITEMS
    .filter((i) => i.id !== item.id)
    .sort((a, b) => similarityScore(item, a) - similarityScore(item, b))
    .slice(0, limit);
}
