/**
 * Server-rendered related items for item detail pages.
 *
 * Deliberately much cheaper than /api/recommendations (which loads the whole
 * catalog into memory and is only viable behind its own cache): two bounded,
 * deterministic queries — genre overlap ordered by popularity. The result is
 * stable between crawls, which is what search engines need from internal
 * links; the rich personalized carousels stay client-side on top.
 */
import { prisma } from "@/lib/prisma";
import { VALID_SLUG_TYPES } from "@/lib/slugs";

export interface RelatedLink {
  title: string;
  type: string;
  slug: string;
  year: number | null;
}

const ELIGIBLE = {
  slug: { not: null },
  isUpcoming: false,
  parentItemId: null,
} as const;

const ORDER = [
  { popularityScore: "desc" },
  { voteCount: "desc" },
  { id: "asc" },
] as const;

export async function getRelatedItems(source: {
  id: number;
  type: string;
  genre: string[];
}): Promise<RelatedLink[]> {
  const genreFilter = source.genre.length ? { genre: { hasSome: source.genre } } : {};

  const [sameType, crossMedia] = await Promise.all([
    prisma.item.findMany({
      where: { ...ELIGIBLE, id: { not: source.id }, type: source.type, ...genreFilter },
      select: { title: true, type: true, slug: true, year: true },
      orderBy: [...ORDER],
      take: 6,
    }),
    prisma.item.findMany({
      where: {
        ...ELIGIBLE,
        id: { not: source.id },
        type: { in: Array.from(VALID_SLUG_TYPES), not: source.type },
        ...genreFilter,
      },
      select: { title: true, type: true, slug: true, year: true },
      orderBy: [...ORDER],
      take: 30,
    }),
  ]);

  // Spread the cross-media picks: max 2 per type, 6 total
  const perType: Record<string, number> = {};
  const cross: typeof crossMedia = [];
  for (const c of crossMedia) {
    if ((perType[c.type] ?? 0) >= 2) continue;
    perType[c.type] = (perType[c.type] ?? 0) + 1;
    cross.push(c);
    if (cross.length >= 6) break;
  }

  return [...sameType, ...cross].filter((i): i is typeof i & { slug: string } => !!i.slug);
}
