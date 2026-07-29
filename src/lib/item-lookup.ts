import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Request-memoized item lookup for /[type]/[slug].
 *
 * Shared by the segment layout (existence gate), generateMetadata, and the
 * page body — React's cache() dedupes them to ONE query per request, so the
 * layout's 404 gate adds no extra DB load.
 */
export const getItemBySlug = cache(async (type: string, slug: string) => {
  return prisma.item.findFirst({ where: { type, slug } }).catch(() => null);
});
