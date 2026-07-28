/**
 * Shared helpers for the sharded sitemap:
 *   /sitemap.xml            → sitemap index (src/app/sitemap.xml/route.ts)
 *   /sitemaps/pages.xml     → static pages  (src/app/sitemaps/[shard]/route.ts)
 *   /sitemaps/{type}-{n}.xml → catalog items, one shard series per media type
 *   /sitemaps/franchises.xml → franchise pages
 *
 * Google's limits are 50,000 URLs / 50 MB per file — 40k leaves headroom.
 */
import type { Prisma } from "@prisma/client";
import { VALID_SLUG_TYPES } from "@/lib/slugs";

export const SITEMAP_PER_SHARD = 40_000;

/** Media types that get their own shard series, in stable order. */
export const SITEMAP_ITEM_TYPES: string[] = Array.from(VALID_SLUG_TYPES);

/** Items eligible for the sitemap: sluggable, released, top-level. */
export function sitemapItemWhere(type?: string): Prisma.ItemWhereInput {
  return {
    ...(type ? { type } : { type: { in: SITEMAP_ITEM_TYPES } }),
    slug: { not: null },
    isUpcoming: false,
    parentItemId: null,
  };
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface SitemapEntry {
  loc: string;
  /** YYYY-MM-DD */
  lastmod?: string;
}

export function renderUrlset(entries: SitemapEntry[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map(
        (e) =>
          `  <url><loc>${xmlEscape(e.loc)}</loc>` +
          (e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : "") +
          `</url>`
      )
      .join("\n") +
    `\n</urlset>\n`
  );
}

export function renderSitemapIndex(locs: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    locs.map((u) => `  <sitemap><loc>${xmlEscape(u)}</loc></sitemap>`).join("\n") +
    `\n</sitemapindex>\n`
  );
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

export function toLastmod(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}
