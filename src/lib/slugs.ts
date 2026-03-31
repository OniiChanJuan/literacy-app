/**
 * URL slug utilities for clean item URLs.
 *
 * Slug format: lowercase, hyphens, ASCII only, max 80 chars.
 * Examples:
 *   "Interstellar"          → "interstellar"
 *   "The Dark Knight"       → "the-dark-knight"
 *   "Ghost in the Shell"    → "ghost-in-the-shell"
 *   "Neon Genesis Evangelion" → "neon-genesis-evangelion"
 *
 * Duplicate handling: append year, then numeric ID suffix.
 */

export type SlugMediaType =
  | "movie"
  | "tv"
  | "book"
  | "manga"
  | "game"
  | "music"
  | "comic"
  | "podcast";

/** The set of valid URL segment type names. */
export const VALID_SLUG_TYPES = new Set<string>([
  "movie",
  "tv",
  "book",
  "manga",
  "game",
  "music",
  "comic",
  "podcast",
]);

/**
 * Convert a title (and optional year/id suffix) into a URL slug.
 *
 * Rules:
 * 1. Lowercase
 * 2. Strip/replace non-ASCII with spaces (covers CJK, Arabic, etc.)
 * 3. Replace any non-alphanumeric char with hyphen
 * 4. Collapse multiple hyphens and strip leading/trailing hyphens
 * 5. Truncate to 80 chars at a word boundary
 * 6. If the slug would be empty (e.g. entirely non-Latin), fall back to "item"
 */
export function makeSlugFromTitle(title: string): string {
  let s = title
    .toLowerCase()
    // Normalize common punctuation
    .replace(/['']/g, "")        // drop apostrophes
    .replace(/[&]/g, "and")      // & → and
    .replace(/[^a-z0-9\s-]/g, " ") // strip non-ASCII / special chars
    .trim()
    .replace(/\s+/g, "-")        // spaces → hyphens
    .replace(/-{2,}/g, "-")      // collapse multiple hyphens
    .replace(/^-+|-+$/g, "");    // strip leading/trailing

  // Truncate at 80 chars, respecting word boundaries
  if (s.length > 80) {
    s = s.slice(0, 80).replace(/-[^-]*$/, "");
  }

  return s || "item";
}

/**
 * Generate a slug with optional year/id uniqueness suffix.
 * Use this when you have year and id available (e.g. during DB migration).
 *
 * Suffix logic (applied by the migration script, not here):
 *   - First: try bare slug
 *   - If taken: append "-{year}"
 *   - If still taken: append "-{id}"
 */
export function generateSlug(title: string, year?: number, id?: number): string {
  const base = makeSlugFromTitle(title);
  if (year) {
    const withYear = `${base}-${year}`;
    // Caller decides whether to use bare or year-suffixed based on uniqueness check
    // This function just returns the base; use generateSlugWithSuffix for full logic
    void withYear; // suppress unused warning
  }
  void id;
  return base;
}

/** Build slug variants in priority order for uniqueness checking. */
export function slugVariants(title: string, year?: number, id?: number): string[] {
  const base = makeSlugFromTitle(title);
  const variants: string[] = [base];
  if (year) variants.push(`${base}-${year}`);
  if (id) variants.push(`${base}-${id}`);
  return variants;
}

// ── Item URL routing ─────────────────────────────────────────────────────────

/** Minimal shape needed to build an item URL. */
interface ItemLike {
  id: number | string;
  type?: string;
  slug?: string | null;
}

/**
 * Return the canonical URL for an item.
 *
 * - If the item has a slug and a known type, returns `/${type}/${slug}`
 * - Otherwise falls back to `/item/${id}` (which will redirect once slugs are populated)
 */
export function getItemUrl(item: ItemLike): string {
  if (item.slug && item.type && VALID_SLUG_TYPES.has(item.type)) {
    return `/${item.type}/${item.slug}`;
  }
  return `/item/${item.id}`;
}
