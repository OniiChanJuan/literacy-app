/**
 * Platform link definitions and URL construction helpers.
 * Each platform has a base URL template and optional affiliate tag support.
 */

export interface PlatformLink {
  platform: string;
  url: string;
  category: "stream" | "buy" | "free" | "play";
}

export interface PlatformLinkDef {
  label: string;
  category: "stream" | "buy" | "free" | "play";
  /** Build a direct URL for an item on this platform */
  buildUrl?: (meta: LinkMeta) => string | null;
  /** Affiliate tag query param name (e.g. "tag" for Amazon) */
  affiliateParam?: string;
}

interface LinkMeta {
  title: string;
  type: string;
  spotifyId?: string | null;
  tmdbId?: number | null;
  igdbId?: number | null;
  googleBooksId?: string | null;
  malId?: number | null;
  comicVineId?: number | null;
  year?: number;
}

function searchQuery(title: string): string {
  return encodeURIComponent(title);
}

/**
 * All known platforms with URL builders.
 * URLs are constructed from item metadata — no API calls needed.
 */
export const PLATFORM_DEFS: Record<string, PlatformLinkDef> = {
  // ── Streaming video ──
  netflix: {
    label: "Netflix",
    category: "stream",
    buildUrl: (m) => `https://www.netflix.com/search?q=${searchQuery(m.title)}`,
  },
  prime: {
    label: "Prime Video",
    category: "stream",
    buildUrl: (m) => `https://www.amazon.com/s?k=${searchQuery(m.title)}&i=instant-video`,
    affiliateParam: "tag",
  },
  hbo: {
    label: "Max",
    category: "stream",
    buildUrl: (m) => `https://play.max.com/search?q=${searchQuery(m.title)}`,
  },
  hulu: {
    label: "Hulu",
    category: "stream",
    buildUrl: (m) => `https://www.hulu.com/search?q=${searchQuery(m.title)}`,
  },
  apple: {
    label: "Apple TV+",
    category: "stream",
    buildUrl: (m) => `https://tv.apple.com/search?term=${searchQuery(m.title)}`,
  },
  disney: {
    label: "Disney+",
    category: "stream",
    buildUrl: (m) => `https://www.disneyplus.com/search/${searchQuery(m.title)}`,
  },
  theaters: {
    label: "Theaters",
    category: "stream",
    buildUrl: (m) => `https://www.fandango.com/search?q=${searchQuery(m.title)}`,
  },

  // ── Books ──
  kindle: {
    label: "Kindle",
    category: "buy",
    buildUrl: (m) => `https://www.amazon.com/s?k=${searchQuery(m.title)}&i=digital-text`,
    affiliateParam: "tag",
  },
  audible: {
    label: "Audible",
    category: "buy",
    buildUrl: (m) => `https://www.audible.com/search?keywords=${searchQuery(m.title)}`,
  },
  library: {
    label: "Library",
    category: "free",
    buildUrl: (m) => `https://www.worldcat.org/search?q=${searchQuery(m.title)}`,
  },
  google_books: {
    label: "Google Books",
    category: "buy",
    buildUrl: (m) => m.googleBooksId
      ? `https://books.google.com/books?id=${m.googleBooksId}`
      : `https://books.google.com/books?q=${searchQuery(m.title)}`,
  },

  // ── Gaming ──
  steam: {
    label: "Steam",
    category: "play",
    buildUrl: (m) => `https://store.steampowered.com/search/?term=${searchQuery(m.title)}`,
  },
  pc: {
    label: "PC",
    category: "play",
    buildUrl: () => null, // no direct link
  },
  ps5: { label: "PS5", category: "play",
    buildUrl: (m) => `https://store.playstation.com/search/${searchQuery(m.title)}`,
  },
  ps4: { label: "PS4", category: "play",
    buildUrl: (m) => `https://store.playstation.com/search/${searchQuery(m.title)}`,
  },
  ps3: { label: "PS3", category: "play", buildUrl: () => null },
  ps2: { label: "PS2", category: "play", buildUrl: () => null },
  ps1: { label: "PS1", category: "play", buildUrl: () => null },
  ps: { label: "PlayStation", category: "play",
    buildUrl: (m) => `https://store.playstation.com/search/${searchQuery(m.title)}`,
  },
  psp: { label: "PSP", category: "play", buildUrl: () => null },
  vita: { label: "PS Vita", category: "play", buildUrl: () => null },
  xsx: { label: "Xbox Series X|S", category: "play",
    buildUrl: (m) => `https://www.xbox.com/games/store/search/${searchQuery(m.title)}`,
  },
  xone: { label: "Xbox One", category: "play",
    buildUrl: (m) => `https://www.xbox.com/games/store/search/${searchQuery(m.title)}`,
  },
  x360: { label: "Xbox 360", category: "play", buildUrl: () => null },
  xbox: { label: "Xbox", category: "play",
    buildUrl: (m) => `https://www.xbox.com/games/store/search/${searchQuery(m.title)}`,
  },
  switch: { label: "Nintendo Switch", category: "play",
    buildUrl: (m) => `https://www.nintendo.com/us/search/#q=${searchQuery(m.title)}&cat=games`,
  },
  switch2: { label: "Switch 2", category: "play",
    buildUrl: (m) => `https://www.nintendo.com/us/search/#q=${searchQuery(m.title)}&cat=games`,
  },

  // ── Music ──
  spotify: {
    label: "Spotify",
    category: "stream",
    buildUrl: (m) => m.spotifyId
      ? `https://open.spotify.com/album/${m.spotifyId}`
      : `https://open.spotify.com/search/${searchQuery(m.title)}`,
  },
  apple_music: {
    label: "Apple Music",
    category: "stream",
    buildUrl: (m) => `https://music.apple.com/search?term=${searchQuery(m.title)}`,
  },

  // ── Podcasts ──
  apple_pod: {
    label: "Apple Podcasts",
    category: "stream",
    buildUrl: (m) => `https://podcasts.apple.com/search?term=${searchQuery(m.title)}`,
  },

  // ── Manga/Comics ──
  mangaplus: {
    label: "Manga Plus",
    category: "free",
    buildUrl: (m) => `https://mangaplus.shueisha.co.jp/search_result?keyword=${searchQuery(m.title)}`,
  },
  viz: {
    label: "VIZ",
    category: "stream",
    buildUrl: (m) => `https://www.viz.com/search?search=${searchQuery(m.title)}`,
  },
  comixology: {
    label: "ComiXology",
    category: "buy",
    buildUrl: (m) => `https://www.amazon.com/s?k=${searchQuery(m.title)}&i=comics-702702`,
    affiliateParam: "tag",
  },

  // ── Retro / niche (no URLs) ──
  mac: { label: "Mac", category: "play", buildUrl: () => null },
  linux: { label: "Linux", category: "play", buildUrl: () => null },
  dos: { label: "DOS", category: "play", buildUrl: () => null },
  wiiu: { label: "Wii U", category: "play", buildUrl: () => null },
  wii: { label: "Wii", category: "play", buildUrl: () => null },
  gc: { label: "GameCube", category: "play", buildUrl: () => null },
  n64: { label: "N64", category: "play", buildUrl: () => null },
  snes: { label: "SNES", category: "play", buildUrl: () => null },
  nes: { label: "NES", category: "play", buildUrl: () => null },
  "3ds": { label: "3DS", category: "play", buildUrl: () => null },
  ds: { label: "Nintendo DS", category: "play", buildUrl: () => null },
  gba: { label: "GBA", category: "play", buildUrl: () => null },
  gbc: { label: "Game Boy Color", category: "play", buildUrl: () => null },
  gb: { label: "Game Boy", category: "play", buildUrl: () => null },
  dc: { label: "Dreamcast", category: "play", buildUrl: () => null },
  genesis: { label: "Sega Genesis", category: "play", buildUrl: () => null },
  saturn: { label: "Sega Saturn", category: "play", buildUrl: () => null },
  segacd: { label: "Sega CD", category: "play", buildUrl: () => null },
  gg: { label: "Game Gear", category: "play", buildUrl: () => null },
  sms: { label: "Master System", category: "play", buildUrl: () => null },
  ios: { label: "iOS", category: "play", buildUrl: () => null },
  android: { label: "Android", category: "play", buildUrl: () => null },
  browser: { label: "Browser", category: "free", buildUrl: () => null },
  arcade: { label: "Arcade", category: "play", buildUrl: () => null },
  stadia: { label: "Stadia", category: "play", buildUrl: () => null },
  amiga: { label: "Amiga", category: "play", buildUrl: () => null },
  c64: { label: "Commodore 64", category: "play", buildUrl: () => null },
  atari2600: { label: "Atari 2600", category: "play", buildUrl: () => null },
  jaguar: { label: "Atari Jaguar", category: "play", buildUrl: () => null },
};

/** Affiliate tag values per platform, keyed by platform slug */
const AFFILIATE_TAGS: Record<string, string> = {
  // Set these in env: AFFILIATE_TAG_AMAZON, etc.
  // Populated at runtime from env vars
};

/** Check if affiliate links are enabled globally */
export function affiliateEnabled(): boolean {
  return process.env.ENABLE_AFFILIATE_LINKS === "true";
}

/** Get the affiliate tag for a platform, if any */
export function getAffiliateTag(platform: string): string | null {
  if (!affiliateEnabled()) return null;
  const def = PLATFORM_DEFS[platform];
  if (!def?.affiliateParam) return null;
  // Look for env var like AFFILIATE_TAG_AMAZON
  const envKey = `AFFILIATE_TAG_${platform.toUpperCase()}`;
  return process.env[envKey] || AFFILIATE_TAGS[platform] || null;
}

/**
 * Build the destination URL for a platform link.
 * Appends affiliate tag if enabled and configured.
 */
export function buildPlatformUrl(
  platform: string,
  meta: LinkMeta,
): string | null {
  const def = PLATFORM_DEFS[platform];
  if (!def?.buildUrl) return null;

  const url = def.buildUrl(meta);
  if (!url) return null;

  // Append affiliate tag if applicable
  const tag = getAffiliateTag(platform);
  if (tag && def.affiliateParam) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}${def.affiliateParam}=${tag}`;
  }

  return url;
}

/**
 * Generate all platform links for an item based on its platforms array and metadata.
 */
export function generatePlatformLinks(
  platforms: any[],
  meta: LinkMeta,
): Record<string, string> {
  const links: Record<string, string> = {};

  for (const p of platforms) {
    const key = typeof p === "string" ? p : p?.key || "";
    if (!key) continue;

    const url = buildPlatformUrl(key, meta);
    if (url) {
      links[key] = url;
    }
  }

  return links;
}

/** Category display order and labels */
export const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: "stream", label: "Stream" },
  { key: "play", label: "Play" },
  { key: "buy", label: "Buy / Rent" },
  { key: "free", label: "Free" },
];

/** Get the category for a platform */
export function getPlatformCategory(platform: string): string {
  return PLATFORM_DEFS[platform]?.category || "stream";
}
