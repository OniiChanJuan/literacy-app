/**
 * Centralized site config. Every SEO / OG / canonical URL / email /
 * brand-name reference should come from here so rebranding only
 * touches one file.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://crossshelf.app";

export const SITE_NAME = "CrossShelf";
export const SITE_TAGLINE = "Fluent in every medium";
export const SITE_TITLE_DEFAULT = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const SITE_TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

export const SITE_DESCRIPTION =
  "Rate, collect, and discover across movies, TV, games, anime, books, manga, music, podcasts, and comics. Your shelf across every medium.";

export const SITE_DESCRIPTION_SHORT =
  "Your shelf across every medium.";

export const CONTACT_EMAIL = {
  privacy: "privacy@crossshelf.app",
  dmca: "dmca@crossshelf.app",
  accessibility: "accessibility@crossshelf.app",
  admin: "admin@crossshelf.app",
} as const;

export const OG_IMAGE = `${SITE_URL}/opengraph-image`;

/** Build an absolute URL from a path, for canonical / OG / sitemap. */
export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
