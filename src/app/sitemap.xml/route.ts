/**
 * /sitemap.xml — sitemap INDEX pointing at per-type shards.
 *
 * Replaces the old single-file src/app/sitemap.ts, which hard-capped at
 * 10,000 items and silently dropped ~75% of the catalog (all comics and
 * podcasts, nearly all books and music). Shards live under /sitemaps/.
 */
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";
import {
  SITEMAP_ITEM_TYPES,
  SITEMAP_PER_SHARD,
  renderSitemapIndex,
  sitemapItemWhere,
  xmlResponse,
} from "@/lib/sitemap-xml";

// Regenerate daily. On DB failure this route throws (500) so Google keeps
// its cached copy instead of receiving a silently empty sitemap.
export const revalidate = 86400;

export async function GET() {
  const [typeCounts, franchiseCount] = await Promise.all([
    prisma.item.groupBy({
      by: ["type"],
      where: sitemapItemWhere(),
      _count: { _all: true },
    }),
    prisma.franchise.count(),
  ]);

  const countByType = new Map(typeCounts.map((c) => [c.type, c._count._all]));

  const locs: string[] = [`${SITE_URL}/sitemaps/pages.xml`];
  for (const type of SITEMAP_ITEM_TYPES) {
    const count = countByType.get(type) ?? 0;
    const shards = Math.ceil(count / SITEMAP_PER_SHARD);
    for (let i = 0; i < shards; i++) {
      locs.push(`${SITE_URL}/sitemaps/${type}-${i}.xml`);
    }
  }
  if (franchiseCount > 0) locs.push(`${SITE_URL}/sitemaps/franchises.xml`);

  return xmlResponse(renderSitemapIndex(locs));
}
