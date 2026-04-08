/**
 * /[type]/[slug] — Canonical item detail page.
 *
 * Examples:
 *   /movie/interstellar
 *   /book/the-way-of-kings
 *   /game/elden-ring
 *   /tv/breaking-bad
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VALID_SLUG_TYPES } from "@/lib/slugs";
import { ItemPageRender, dbItemToItem } from "@/app/item/_page-impl";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";
import type { Metadata } from "next";

const TYPE_LABEL: Record<string, string> = {
  movie: "Movie", tv: "TV Show", book: "Book", manga: "Manga",
  comic: "Comic", game: "Game", music: "Album", podcast: "Podcast",
};

const SCHEMA_TYPE: Record<string, string> = {
  movie: "Movie", tv: "TVSeries", book: "Book", manga: "Book",
  comic: "Book", game: "VideoGame", music: "MusicAlbum", podcast: "PodcastSeries",
};

// ISR: regenerate page in background every 5 minutes.
// Item metadata (title, cover, description, scores) rarely changes —
// this serves cached HTML from CDN instead of hitting the DB on every visit.
export const revalidate = 300;

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}): Promise<Metadata> {
  const { type, slug } = await params;
  if (!VALID_SLUG_TYPES.has(type)) return { title: SITE_NAME };

  const dbItem = await prisma.item
    .findFirst({ where: { type, slug }, select: { title: true, description: true, cover: true, year: true } })
    .catch(() => null);

  if (!dbItem) return { title: SITE_NAME };

  const typeLabel = TYPE_LABEL[type] || type;
  const yearSuffix = dbItem.year ? ` (${dbItem.year})` : "";
  // Unique per-item title: "Dune (2021) — Movie Reviews & Ratings | CrossShelf"
  const pageTitle = `${dbItem.title}${yearSuffix} — ${typeLabel} Reviews & Ratings`;
  const descSrc = (dbItem.description || "").replace(/<[^>]*>/g, "").trim();
  const description = descSrc
    ? `${descSrc.slice(0, 150)}${descSrc.length > 150 ? "…" : ""} Rate and review ${dbItem.title} on ${SITE_NAME}.`
    : `Rate, review, and discover ${dbItem.title} and similar ${typeLabel.toLowerCase()}s on ${SITE_NAME}.`;
  const image = dbItem.cover?.startsWith("http") ? dbItem.cover : undefined;

  return {
    title: pageTitle,
    description,
    alternates: { canonical: `/${type}/${slug}` },
    openGraph: {
      type: "website",
      url: absoluteUrl(`/${type}/${slug}`),
      title: pageTitle,
      description,
      siteName: SITE_NAME,
      ...(image ? { images: [{ url: image, width: 300, height: 450 }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: pageTitle,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ItemSlugPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type, slug } = await params;

  // Only handle known media types — let other routes (e.g. /franchise/...) pass through
  if (!VALID_SLUG_TYPES.has(type)) notFound();

  const dbItem = await prisma.item
    .findFirst({ where: { type, slug } })
    .catch(() => null);

  if (!dbItem) notFound();

  const item = dbItemToItem(dbItem);

  // Fetch artwork colors
  let primaryColor: string | null = dbItem.primaryColor || null;
  let secondaryColor: string | null = dbItem.secondaryColor || null;

  // Fetch DLC / parent game data for games
  let dlcs: any[] = [];
  let parentGame: { id: number; title: string } | null = null;
  let itemSubtype: string | null = null;

  if (type === "game") {
    try {
      const gameData = await prisma.item.findUnique({
        where: { id: dbItem.id },
        select: {
          parentItemId: true,
          itemSubtype: true,
          parentItem: { select: { id: true, title: true } },
          dlcs: {
            select: {
              id: true, title: true, type: true, year: true, cover: true, itemSubtype: true,
              externalScores: {
                select: { source: true, score: true, maxScore: true },
                take: 1,
                orderBy: { score: "desc" },
              },
            },
            orderBy: { year: "asc" },
          },
        },
      });
      if (gameData?.parentItem) {
        parentGame = gameData.parentItem;
        itemSubtype = gameData.itemSubtype || null;
      }
      if (gameData?.dlcs?.length) {
        dlcs = gameData.dlcs.map((d: any) => ({ ...d, bestScore: d.externalScores?.[0] || null }));
      }
    } catch {}
  }

  // Structured data for item detail pages — helps Google show rich results
  const schemaType = SCHEMA_TYPE[type] || "CreativeWork";
  const cleanDesc = (dbItem.description || "").replace(/<[^>]*>/g, "").slice(0, 500);
  const ldJson: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: dbItem.title,
    url: absoluteUrl(`/${type}/${slug}`),
    ...(cleanDesc ? { description: cleanDesc } : {}),
    ...(dbItem.cover?.startsWith("http") ? { image: dbItem.cover } : {}),
    ...(dbItem.year ? { datePublished: String(dbItem.year) } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />
      <ItemPageRender
        item={item}
        routeId={String(dbItem.id)}
        isExternal={false}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        dlcs={dlcs}
        parentGame={parentGame}
        itemSubtype={itemSubtype}
      />
    </>
  );
}
