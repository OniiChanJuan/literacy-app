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
import type { Metadata } from "next";

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
  if (!VALID_SLUG_TYPES.has(type)) return { title: "Literacy" };

  const dbItem = await prisma.item
    .findFirst({ where: { type, slug }, select: { title: true, description: true, cover: true } })
    .catch(() => null);

  if (!dbItem) return { title: "Literacy" };

  const title = `${dbItem.title} — Literacy`;
  const description = (dbItem.description || "").slice(0, 160).replace(/<[^>]*>/g, "");
  const image = dbItem.cover?.startsWith("http") ? dbItem.cover : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/${type}/${slug}` },
    openGraph: {
      title,
      description,
      ...(image ? { images: [{ url: image, width: 300, height: 450 }] } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
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

  return (
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
  );
}
