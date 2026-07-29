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
import { ItemPageRender, dbItemToItem, getPrimaryCreator } from "@/app/item/_page-impl";
import { EXPLORE_SEGMENT_BY_TYPE } from "@/lib/explore-segments";
import { getItemBySlug } from "@/lib/item-lookup";
import { getRelatedItems } from "@/lib/related-items";
import { TYPES, type MediaType } from "@/lib/data";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";
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
  // notFound() here (not in the page body) so the response is a real HTTP 404 —
  // thrown during render it arrives after streaming starts and the status stays 200.
  if (!VALID_SLUG_TYPES.has(type)) notFound();

  const dbItem = await getItemBySlug(type, slug);

  if (!dbItem) notFound();

  const typeLabel = TYPE_LABEL[type] || type;
  const yearSuffix = dbItem.year ? ` (${dbItem.year})` : "";
  // Unique per-item title: "Dune (2021) — Movie Reviews & Ratings | CrossShelf"
  const pageTitle = `${dbItem.title}${yearSuffix} — ${typeLabel} Reviews & Ratings`;
  const descSrc = (dbItem.description || "").replace(/<[^>]*>/g, "").trim();
  const description = descSrc
    ? `${descSrc.slice(0, 150)}${descSrc.length > 150 ? "…" : ""} Rate and review ${dbItem.title} on ${SITE_NAME}.`
    : `Rate, review, and discover ${dbItem.title} and similar ${typeLabel.toLowerCase()}s on ${SITE_NAME}.`;
  return {
    title: pageTitle,
    description,
    alternates: { canonical: `/${type}/${slug}` },
    // No images here — the opengraph-image.tsx file convention in this
    // segment generates the 1200×630 share card and would be overridden
    // by (and conflict with) any images set in metadata.
    openGraph: {
      type: "website",
      url: absoluteUrl(`/${type}/${slug}`),
      title: pageTitle,
      description,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
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

  const dbItem = await getItemBySlug(type, slug);

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

  // Stable, crawlable related links (cheap bounded queries — cached with the
  // page by ISR, so they only recompute every `revalidate` seconds)
  const relatedLinks = await getRelatedItems({
    id: dbItem.id,
    type,
    genre: dbItem.genre ?? [],
  }).catch(() => []);

  // Community rating aggregate for structured data. COMMUNITY ratings only —
  // NEVER the CrossShelf Score: it blends external critics, and Google's
  // review-snippet policy requires aggregateRating to come directly from
  // this site's own users. Marking up the blended score risks a manual action.
  const ratingAgg = await prisma.rating
    .aggregate({ where: { itemId: dbItem.id }, _avg: { score: true }, _count: true })
    .catch(() => null);
  const ratingCount = ratingAgg?._count ?? 0;
  const ratingAvg = ratingAgg?._avg?.score ?? null;

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
    ...(dbItem.genre?.length ? { genre: dbItem.genre } : {}),
  };

  const creator = getPrimaryCreator(item.people, item.type);
  if (creator?.name) {
    if (type === "movie" || type === "tv") {
      ldJson.director = { "@type": "Person", name: creator.name };
    } else if (type === "music") {
      ldJson.byArtist = { "@type": "MusicGroup", name: creator.name };
    } else {
      ldJson.author = { "@type": "Person", name: creator.name };
    }
  }

  // Suppress below 5 ratings — "5.0 from 1 rating" stars are spammy and useless.
  if (ratingCount >= 5 && ratingAvg != null) {
    ldJson.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(ratingAvg.toFixed(1)),
      ratingCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Explore", item: absoluteUrl("/explore") },
      {
        "@type": "ListItem",
        position: 2,
        name: TYPES[type as MediaType]?.label ?? type,
        item: absoluteUrl(`/explore/${EXPLORE_SEGMENT_BY_TYPE[type]}`),
      },
      { "@type": "ListItem", position: 3, name: dbItem.title },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(ldJson) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }}
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
        relatedLinks={relatedLinks}
      />
    </>
  );
}
