/**
 * /sitemaps/[shard] — individual sitemap files, referenced by /sitemap.xml.
 *
 *   pages.xml       → public static pages (auth-walled routes are excluded
 *                     on purpose: /library, /login, /signup, /settings)
 *   {type}-{n}.xml  → catalog items for one media type, 40k per shard,
 *                     ordered by id so shard contents stay stable between crawls
 *   franchises.xml  → franchise pages
 */
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";
import { VALID_SLUG_TYPES } from "@/lib/slugs";
import {
  SITEMAP_PER_SHARD,
  renderUrlset,
  sitemapItemWhere,
  toLastmod,
  xmlResponse,
  type SitemapEntry,
} from "@/lib/sitemap-xml";

export const revalidate = 86400;

const PUBLIC_STATIC_PATHS = [
  "/",
  "/explore",
  "/people",
  "/privacy",
  "/terms",
  "/guidelines",
  "/accessibility",
  "/cookies",
  "/dmca",
  "/do-not-sell",
  "/sitemap-page",
];

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shard: string }> }
) {
  const { shard } = await ctx.params;

  if (shard === "pages.xml") {
    const entries: SitemapEntry[] = PUBLIC_STATIC_PATHS.map((p) => ({
      loc: `${SITE_URL}${p}`,
    }));
    return xmlResponse(renderUrlset(entries));
  }

  if (shard === "franchises.xml") {
    const franchises = await prisma.franchise.findMany({
      select: { id: true, createdAt: true },
      orderBy: { id: "asc" },
    });
    if (!franchises.length) return new Response("Not found", { status: 404 });
    return xmlResponse(
      renderUrlset(
        franchises.map((f) => ({
          loc: `${SITE_URL}/franchise/${f.id}`,
          lastmod: toLastmod(f.createdAt),
        }))
      )
    );
  }

  const m = shard.match(/^([a-z]+)-(\d+)\.xml$/);
  if (!m || !VALID_SLUG_TYPES.has(m[1])) {
    return new Response("Not found", { status: 404 });
  }
  const [, type, idxRaw] = m;
  const idx = Number(idxRaw);

  const items = await prisma.item.findMany({
    where: sitemapItemWhere(type),
    select: { slug: true, createdAt: true, lastSyncedAt: true },
    orderBy: { id: "asc" },
    skip: idx * SITEMAP_PER_SHARD,
    take: SITEMAP_PER_SHARD,
  });
  if (!items.length) return new Response("Not found", { status: 404 });

  return xmlResponse(
    renderUrlset(
      items
        .filter((i): i is typeof i & { slug: string } => !!i.slug)
        .map((i) => ({
          loc: `${SITE_URL}/${type}/${i.slug}`,
          lastmod: toLastmod(i.lastSyncedAt ?? i.createdAt),
        }))
    )
  );
}
