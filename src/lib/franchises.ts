import type { MediaType } from "./data";

export interface FranchiseItem {
  routeId: string;    // local ID (e.g. "10") or API route ID (e.g. "tmdb-movie-438631")
  type: MediaType;
  title: string;      // display name for the tab
}

export interface Franchise {
  slug: string;
  name: string;
  icon: string;
  color: string;
  cover: string;      // CSS gradient for the hero
  description: string;
  items: FranchiseItem[];
}

export const FRANCHISES: Franchise[] = [
  {
    slug: "dune",
    name: "Dune",
    icon: "🏜",
    color: "#d4a017",
    cover: "linear-gradient(135deg, #f4d03f, #d4a017, #8b6914)",
    description: "Frank Herbert's epic sci-fi saga spanning novels, films, and games across decades of storytelling.",
    items: [
      { routeId: "10", type: "book", title: "Dune (Novel)" },
      { routeId: "tmdb-movie-438631", type: "movie", title: "Dune (2021)" },
      { routeId: "tmdb-movie-693134", type: "movie", title: "Dune: Part Two" },
    ],
  },
  {
    slug: "the-witcher",
    name: "The Witcher",
    icon: "⚔",
    color: "#c0392b",
    cover: "linear-gradient(135deg, #1a1a2e, #4a0e0e, #c0392b)",
    description: "Andrzej Sapkowski's dark fantasy world of Geralt of Rivia — from novels to games to Netflix.",
    items: [
      { routeId: "9", type: "game", title: "The Witcher 3: Wild Hunt" },
      { routeId: "tmdb-tv-71912", type: "tv", title: "The Witcher (TV)" },
    ],
  },
  {
    slug: "attack-on-titan",
    name: "Attack on Titan",
    icon: "⚔",
    color: "#dc143c",
    cover: "linear-gradient(135deg, #5c3d2e, #8b4513, #dc143c)",
    description: "Hajime Isayama's story of humanity's fight against the Titans — manga and anime.",
    items: [
      { routeId: "26", type: "manga", title: "Attack on Titan (Manga)" },
      { routeId: "jikan-anime-16498", type: "tv", title: "Attack on Titan (Anime)" },
    ],
  },
  {
    slug: "the-last-of-us",
    name: "The Last of Us",
    icon: "🍄",
    color: "#2d5016",
    cover: "linear-gradient(135deg, #2d5016, #1a3a0a, #5a3e1b)",
    description: "Naughty Dog's post-apocalyptic masterpiece — the game that became a landmark HBO series.",
    items: [
      { routeId: "17", type: "game", title: "The Last of Us (Game)" },
      { routeId: "tmdb-tv-100088", type: "tv", title: "The Last of Us (TV)" },
    ],
  },
  {
    slug: "cyberpunk",
    name: "Cyberpunk",
    icon: "🌃",
    color: "#fcee09",
    cover: "linear-gradient(135deg, #fcee09, #f7a600, #e84855)",
    description: "CD Projekt Red's vision of Night City — the RPG, the anime, and the universe.",
    items: [
      { routeId: "4", type: "game", title: "Cyberpunk 2077" },
      { routeId: "jikan-anime-42310", type: "tv", title: "Cyberpunk: Edgerunners" },
    ],
  },
  {
    slug: "chainsaw-man",
    name: "Chainsaw Man",
    icon: "🪚",
    color: "#c0392b",
    cover: "linear-gradient(135deg, #c0392b, #8e1c1c, #1a1a2e)",
    description: "Tatsuki Fujimoto's unhinged shonen saga of devils and devil hunters.",
    items: [
      { routeId: "20", type: "manga", title: "Chainsaw Man (Manga)" },
      { routeId: "jikan-anime-44511", type: "tv", title: "Chainsaw Man (Anime)" },
    ],
  },
];

/** Find franchise by slug */
export function getFranchise(slug: string): Franchise | undefined {
  return FRANCHISES.find((f) => f.slug === slug);
}

/** Find franchise that contains a given item routeId */
export function getFranchiseForItem(routeId: string): Franchise | undefined {
  return FRANCHISES.find((f) => f.items.some((i) => i.routeId === routeId));
}

/** Get unique media types in a franchise */
export function getFranchiseTypes(franchise: Franchise): MediaType[] {
  const types = new Set(franchise.items.map((i) => i.type));
  const order: MediaType[] = ["book", "manga", "comic", "movie", "tv", "game", "music", "podcast"];
  return order.filter((t) => types.has(t));
}
