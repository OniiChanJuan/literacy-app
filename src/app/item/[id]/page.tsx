/**
 * /item/[id] — Legacy route that resolves numeric or external-API IDs and
 * redirects to the canonical slug URL (e.g. /movie/interstellar).
 *
 * Also handles first-visit auto-import of external items (tmdb-movie-XXX, etc.)
 * by fetching from the API, saving to DB with a slug, then redirecting.
 */

import { notFound, redirect } from "next/navigation";
import { ALL_ITEMS, isUpcoming, type Item } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { parseTmdbId, getTmdbDetails } from "@/lib/tmdb";
import { parseIgdbId, getIgdbDetails } from "@/lib/igdb";
import { parseGbookId, getGoogleBookDetails } from "@/lib/google-books";
import { parseSpotifyId, getSpotifyAlbumDetails, getSpotifyShowDetails } from "@/lib/spotify";
import { parseJikanId, getJikanMangaDetails, getJikanAnimeDetails } from "@/lib/jikan";
import { parseCvId, getComicVineDetails } from "@/lib/comicvine";
import { lookupUpcomingItem } from "@/lib/upcoming";
import { makeSlugFromTitle, slugVariants } from "@/lib/slugs";
import { ItemPageRender, dbItemToItem } from "@/app/item/_page-impl";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const numId = parseInt(id);
  let title = "Literacy";
  let description = "Rate, review, and discover across every medium.";
  let image: string | undefined;

  if (!isNaN(numId)) {
    const item = ALL_ITEMS.find((i) => i.id === numId);
    if (item) {
      title = `${item.title} — Literacy`;
      description = (item.desc || "").slice(0, 160).replace(/<[^>]*>/g, "");
      if (item.cover?.startsWith("http")) image = item.cover;
    }
  }
  if (title === "Literacy" && !isNaN(numId)) {
    try {
      const dbItem = await prisma.item.findUnique({ where: { id: numId }, select: { title: true, description: true, cover: true } });
      if (dbItem) {
        title = `${dbItem.title} — Literacy`;
        description = (dbItem.description || "").slice(0, 160).replace(/<[^>]*>/g, "");
        if (dbItem.cover?.startsWith("http")) image = dbItem.cover;
      }
    } catch {}
  }

  return {
    title,
    description,
    openGraph: { title, description, ...(image ? { images: [{ url: image, width: 300, height: 450 }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary" },
  };
}

// ── Slug helpers ─────────────────────────────────────────────────────────────

async function findAvailableSlug(type: string, title: string, year: number, id: number): Promise<string> {
  for (const candidate of slugVariants(title, year, id)) {
    const existing = await prisma.item.findFirst({
      where: { type, slug: candidate },
      select: { id: true },
    }).catch(() => null);
    if (!existing) return candidate;
  }
  return `${makeSlugFromTitle(title)}-${id}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // ── External API IDs ──────────────────────────────────────────────────────
  const tmdbParsed = parseTmdbId(id);
  const igdbParsed = parseIgdbId(id);
  const gbookParsed = parseGbookId(id);
  const spotifyParsed = parseSpotifyId(id);
  const jikanParsed = parseJikanId(id);
  const cvParsed = parseCvId(id);

  let savedId: number | null = null;
  let savedType: string | null = null;

  if (tmdbParsed) {
    let dbItem = await prisma.item.findFirst({ where: { tmdbId: tmdbParsed.tmdbId, type: tmdbParsed.type } }).catch(() => null);
    if (!dbItem) {
      const item = await getTmdbDetails(tmdbParsed.type, tmdbParsed.tmdbId);
      if (item) {
        const slug = await findAvailableSlug(item.type, item.title, item.year, tmdbParsed.tmdbId);
        dbItem = await prisma.item.create({
          data: { title: item.title, type: item.type, genre: item.genre || [], vibes: item.vibes || [], year: item.year, cover: item.cover ?? "", description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: item.totalEp || 0, tmdbId: tmdbParsed.tmdbId, slug, lastSyncedAt: new Date() },
        }).catch(() => null);
      }
    }
    if (dbItem) { savedId = dbItem.id; savedType = dbItem.type; }
  } else if (igdbParsed) {
    let dbItem = await prisma.item.findFirst({ where: { igdbId: igdbParsed } }).catch(() => null);
    if (!dbItem) {
      const item = await getIgdbDetails(igdbParsed);
      if (item) {
        const slug = await findAvailableSlug("game", item.title, item.year, igdbParsed);
        dbItem = await prisma.item.create({
          data: { title: item.title, type: "game", genre: item.genre || [], vibes: item.vibes || [], year: item.year, cover: item.cover ?? "", description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: 0, igdbId: igdbParsed, slug, lastSyncedAt: new Date() },
        }).catch(() => null);
      }
    }
    if (dbItem) { savedId = dbItem.id; savedType = dbItem.type; }
  } else if (gbookParsed) {
    let dbItem = await prisma.item.findFirst({ where: { googleBooksId: gbookParsed } }).catch(() => null);
    if (!dbItem) {
      const item = await getGoogleBookDetails(gbookParsed);
      if (item) {
        const slug = await findAvailableSlug("book", item.title, item.year, item.id as number);
        dbItem = await prisma.item.create({
          data: { title: item.title, type: "book", genre: item.genre || [], vibes: item.vibes || [], year: item.year, cover: item.cover ?? "", description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: 0, googleBooksId: gbookParsed, slug, lastSyncedAt: new Date() },
        }).catch(() => null);
      }
    }
    if (dbItem) { savedId = dbItem.id; savedType = dbItem.type; }
  } else if (spotifyParsed) {
    let dbItem = await prisma.item.findFirst({ where: { spotifyId: spotifyParsed.spotifyId } }).catch(() => null);
    if (!dbItem) {
      const item = spotifyParsed.type === "album"
        ? await getSpotifyAlbumDetails(spotifyParsed.spotifyId)
        : await getSpotifyShowDetails(spotifyParsed.spotifyId);
      if (item) {
        const slug = await findAvailableSlug(item.type, item.title, item.year, item.id as number);
        dbItem = await prisma.item.create({
          data: { title: item.title, type: item.type, genre: item.genre || [], vibes: item.vibes || [], year: item.year, cover: item.cover ?? "", description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: 0, spotifyId: spotifyParsed.spotifyId, slug, lastSyncedAt: new Date() },
        }).catch(() => null);
      }
    }
    if (dbItem) { savedId = dbItem.id; savedType = dbItem.type; }
  } else if (jikanParsed) {
    let dbItem = await prisma.item.findFirst({ where: { malId: jikanParsed.malId } }).catch(() => null);
    if (!dbItem) {
      const item = jikanParsed.type === "manga"
        ? await getJikanMangaDetails(jikanParsed.malId)
        : await getJikanAnimeDetails(jikanParsed.malId);
      if (item) {
        const slug = await findAvailableSlug(item.type, item.title, item.year, jikanParsed.malId);
        dbItem = await prisma.item.create({
          data: { title: item.title, type: item.type, genre: item.genre || [], vibes: item.vibes || [], year: item.year, cover: item.cover ?? "", description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: item.totalEp || 0, malId: jikanParsed.malId, slug, lastSyncedAt: new Date() },
        }).catch(() => null);
      }
    }
    if (dbItem) { savedId = dbItem.id; savedType = dbItem.type; }
  } else if (cvParsed) {
    let dbItem = await prisma.item.findFirst({ where: { comicVineId: cvParsed } }).catch(() => null);
    if (!dbItem) {
      const item = await getComicVineDetails(cvParsed);
      if (item) {
        const slug = await findAvailableSlug("comic", item.title, item.year, cvParsed);
        dbItem = await prisma.item.create({
          data: { title: item.title, type: "comic", genre: item.genre || [], vibes: item.vibes || [], year: item.year, cover: item.cover ?? "", description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: 0, comicVineId: cvParsed, slug, lastSyncedAt: new Date() },
        }).catch(() => null);
      }
    }
    if (dbItem) { savedId = dbItem.id; savedType = dbItem.type; }
  }

  // If we resolved an external ID to a DB row, redirect to canonical slug URL
  if (savedId !== null && savedType !== null) {
    const dbItem = await prisma.item.findUnique({ where: { id: savedId }, select: { slug: true, type: true } }).catch(() => null);
    if (dbItem?.slug) {
      redirect(`/${dbItem.type}/${dbItem.slug}`);
    }
    // No slug yet — render the item inline as fallback
    const fullItem = await prisma.item.findUnique({ where: { id: savedId } }).catch(() => null);
    if (!fullItem) notFound();
    const item = dbItemToItem(fullItem);
    return renderItemPage(item, id, true);
  }

  // ── Numeric IDs ───────────────────────────────────────────────────────────
  const numId = parseInt(id);
  if (isNaN(numId)) notFound();

  // Check DB first — if slug exists, redirect
  const dbRow = await prisma.item.findUnique({
    where: { id: numId },
    select: { id: true, type: true, slug: true },
  }).catch(() => null);

  if (dbRow?.slug) {
    redirect(`/${dbRow.type}/${dbRow.slug}`);
  }

  // Upcoming item (offset IDs)
  if (numId >= 600000 && numId < 1000000) {
    const item = await lookupUpcomingItem(numId);
    if (item) return renderItemPage(item, id, false);
  }

  // Static fallback
  const staticItem = ALL_ITEMS.find((i) => i.id === numId);
  if (staticItem) return renderItemPage(staticItem, id, false);

  // DB fallback (no slug assigned yet)
  if (dbRow) {
    const fullItem = await prisma.item.findUnique({ where: { id: numId } }).catch(() => null);
    if (fullItem) return renderItemPage(dbItemToItem(fullItem), id, false);
  }

  notFound();
}

// ── Render helper ─────────────────────────────────────────────────────────────

async function renderItemPage(item: Item, routeId: string, isExternal: boolean) {
  let primaryColor: string | null = (item as any).primaryColor || null;
  let secondaryColor: string | null = (item as any).secondaryColor || null;

  if (!primaryColor && typeof item.id === "number") {
    try {
      const dbColors = await prisma.item.findUnique({
        where: { id: item.id },
        select: { primaryColor: true, secondaryColor: true },
      });
      if (dbColors?.primaryColor) {
        primaryColor = dbColors.primaryColor;
        secondaryColor = dbColors.secondaryColor || null;
      }
    } catch {}
  }

  let dlcs: any[] = [];
  let parentGame: { id: number; title: string } | null = null;
  let itemSubtype: string | null = null;

  if (item.type === "game" && !isExternal) {
    const numericId = typeof item.id === "number" ? item.id : parseInt(routeId);
    try {
      const dbItem = await prisma.item.findUnique({
        where: { id: numericId },
        select: {
          parentItemId: true, itemSubtype: true,
          parentItem: { select: { id: true, title: true } },
          dlcs: {
            select: { id: true, title: true, type: true, year: true, cover: true, itemSubtype: true,
              externalScores: { select: { source: true, score: true, maxScore: true }, take: 1, orderBy: { score: "desc" } },
            },
            orderBy: { year: "asc" },
          },
        },
      });
      if (dbItem?.parentItem) { parentGame = dbItem.parentItem; itemSubtype = dbItem.itemSubtype || null; }
      if (dbItem?.dlcs?.length) {
        dlcs = dbItem.dlcs.map((d: any) => ({ ...d, bestScore: d.externalScores?.[0] || null }));
      }
    } catch {}
  }

  return (
    <ItemPageRender
      item={item}
      routeId={routeId}
      isExternal={isExternal}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      dlcs={dlcs}
      parentGame={parentGame}
      itemSubtype={itemSubtype}
    />
  );
}
