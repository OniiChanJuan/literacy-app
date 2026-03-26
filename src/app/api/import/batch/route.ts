import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";
import {
  ParsedImportItem,
  parseLetterboxdCSV,
  parseLetterboxdWatchlist,
  parseLetterboxdReviews,
  parseGoodreadsCSV,
  parseMALItems,
  parseSteamGames,
  parseSpotifyAlbums,
} from "@/lib/import-parsers";
import { searchTmdb, getTmdbDetails, tmdbItemId } from "@/lib/tmdb";
import { searchGoogleBooks } from "@/lib/google-books";
import { cleanDescription } from "@/lib/clean-description";

// Match a parsed import item to our DB (or create it)
async function resolveItem(item: ParsedImportItem): Promise<number | null> {
  // 1. Try to find by external ID in our DB
  if (item.externalId) {
    let existing = null;

    if (item.source === "myanimelist") {
      existing = await prisma.item.findFirst({ where: { malId: parseInt(item.externalId) } });
    } else if (item.source === "steam") {
      // Steam games don't have igdbId mapping, search by title
    } else if (item.source === "spotify") {
      existing = await prisma.item.findFirst({ where: { spotifyId: item.externalId } });
    } else if (item.source === "goodreads" && item.externalId.length >= 10) {
      // ISBN13 — search Google Books
      existing = await prisma.item.findFirst({
        where: {
          title: { equals: item.title, mode: "insensitive" },
          type: "book",
        },
      });
    }

    if (existing) return existing.id;
  }

  // 2. Search by title + year in our DB
  const titleMatch = await prisma.item.findFirst({
    where: {
      title: { equals: item.title, mode: "insensitive" },
      type: mapMediaType(item.mediaType),
      ...(item.year ? { year: item.year } : {}),
    },
  });
  if (titleMatch) return titleMatch.id;

  // 3. Fuzzy title match (without year constraint)
  const fuzzyMatch = await prisma.item.findFirst({
    where: {
      title: { equals: item.title, mode: "insensitive" },
      type: mapMediaType(item.mediaType),
    },
  });
  if (fuzzyMatch) return fuzzyMatch.id;

  // 4. Search external APIs and create item
  try {
    if (item.mediaType === "movie" || item.mediaType === "tv") {
      return await resolveViaTmdb(item);
    } else if (item.mediaType === "book") {
      return await resolveViaGoogleBooks(item);
    } else if (item.mediaType === "anime" || item.mediaType === "manga") {
      return await resolveViaJikan(item);
    } else if (item.mediaType === "game") {
      return await resolveViaIgdb(item);
    } else if (item.mediaType === "music") {
      return await resolveViaSpotify(item);
    }
  } catch {
    // API search failed, skip this item
  }

  return null;
}

function mapMediaType(mt: string): string {
  if (mt === "anime") return "tv"; // anime stored as tv type
  return mt;
}

async function resolveViaTmdb(item: ParsedImportItem): Promise<number | null> {
  const results = await searchTmdb(item.title);
  if (!results.length) return null;

  // Find best match by title + year
  let best = results[0];
  if (item.year) {
    const yearMatch = results.find(r => r.year === item.year);
    if (yearMatch) best = yearMatch;
  }

  // Check if this TMDB item exists in our DB
  const existing = await prisma.item.findFirst({ where: { tmdbId: best.id } });
  if (existing) return existing.id;

  // Get full details and create
  const type = best.type === "movie" ? "movie" as const : "tv" as const;
  const details = await getTmdbDetails(type, best.id);
  if (!details) return null;

  const created = await prisma.item.create({
    data: {
      title: details.title,
      type: details.type,
      genre: details.genre,
      vibes: details.vibes,
      year: details.year,
      cover: details.cover,
      description: cleanDescription(details.desc, details.type),
      people: details.people as any,
      awards: details.awards as any,
      platforms: details.platforms as any,
      ext: details.ext as any,
      totalEp: details.totalEp,
      tmdbId: best.id,
      popularityScore: 0,
      voteCount: 0,
      lastSyncedAt: new Date(),
    },
  });

  return created.id;
}

async function resolveViaGoogleBooks(item: ParsedImportItem): Promise<number | null> {
  const query = item.externalId && item.externalId.length >= 10
    ? `isbn:${item.externalId}`
    : item.title;
  const results = await searchGoogleBooks(query);
  if (!results.length) return null;

  const best = results[0];
  // Check if exists by volumeId
  const existing = await prisma.item.findFirst({ where: { googleBooksId: best.volumeId } });
  if (existing) return existing.id;

  // GoogleBookSearchResult extends Item — has all fields we need
  const created = await prisma.item.create({
    data: {
      title: best.title,
      type: "book",
      genre: best.genre,
      vibes: best.vibes,
      year: best.year,
      cover: best.cover,
      description: cleanDescription(best.desc, "book"),
      people: best.people as any,
      awards: best.awards as any,
      platforms: best.platforms as any,
      ext: best.ext as any,
      totalEp: best.totalEp,
      googleBooksId: best.volumeId,
      popularityScore: 0,
      voteCount: 0,
      lastSyncedAt: new Date(),
    },
  });

  return created.id;
}

async function resolveViaJikan(item: ParsedImportItem): Promise<number | null> {
  if (item.externalId) {
    const malId = parseInt(item.externalId);
    // Check if exists
    const existing = await prisma.item.findFirst({ where: { malId } });
    if (existing) return existing.id;

    // Fetch details from Jikan
    const { getJikanAnimeDetails, getJikanMangaDetails } = await import("@/lib/jikan");
    const details = item.mediaType === "anime"
      ? await getJikanAnimeDetails(malId)
      : await getJikanMangaDetails(malId);

    if (!details) return null;

    const created = await prisma.item.create({
      data: {
        title: details.title,
        type: details.type,
        genre: details.genre,
        vibes: details.vibes,
        year: details.year,
        cover: details.cover,
        description: cleanDescription(details.desc, details.type),
        people: details.people as any,
        awards: details.awards as any,
        platforms: details.platforms as any,
        ext: details.ext as any,
        totalEp: details.totalEp,
        malId,
        popularityScore: 0,
        voteCount: 0,
        lastSyncedAt: new Date(),
      },
    });

    return created.id;
  }

  // Search by title
  const { searchJikanAnime, searchJikanManga } = await import("@/lib/jikan");
  const results = item.mediaType === "anime"
    ? await searchJikanAnime(item.title)
    : await searchJikanManga(item.title);

  if (!results.length) return null;
  const best = results[0];

  const existing = await prisma.item.findFirst({ where: { malId: best.malId } });
  if (existing) return existing.id;

  return null; // Don't create without full details for Jikan
}

async function resolveViaIgdb(item: ParsedImportItem): Promise<number | null> {
  const { searchIgdb } = await import("@/lib/igdb");
  const results = await searchIgdb(item.title);
  if (!results.length) return null;

  const best = results[0];
  const existing = await prisma.item.findFirst({
    where: { title: { equals: best.title, mode: "insensitive" }, type: "game" },
  });
  if (existing) return existing.id;

  // Create from search result
  const created = await prisma.item.create({
    data: {
      title: best.title,
      type: "game",
      genre: best.genre,
      vibes: best.vibes,
      year: best.year,
      cover: best.cover,
      description: cleanDescription(best.desc, "game"),
      people: best.people as any,
      awards: [],
      platforms: best.platforms as any,
      ext: best.ext as any,
      totalEp: 0,
      popularityScore: 0,
      voteCount: 0,
      lastSyncedAt: new Date(),
    },
  });

  return created.id;
}

async function resolveViaSpotify(item: ParsedImportItem): Promise<number | null> {
  if (item.externalId) {
    const existing = await prisma.item.findFirst({ where: { spotifyId: item.externalId } });
    if (existing) return existing.id;
  }

  // Search by title
  const { searchSpotify } = await import("@/lib/spotify");
  const albumTitle = item.title.split(" — ")[0]; // remove artist suffix
  const results = await searchSpotify(albumTitle);
  if (!results.length) return null;

  const best = results[0];
  const existing = await prisma.item.findFirst({ where: { spotifyId: best.spotifyId } });
  if (existing) return existing.id;

  // Create from search result
  const created = await prisma.item.create({
    data: {
      title: best.title,
      type: best.type,
      genre: best.genre,
      vibes: best.vibes,
      year: best.year,
      cover: best.cover,
      description: cleanDescription(best.desc, best.type),
      people: best.people as any,
      awards: [],
      platforms: best.platforms as any,
      ext: best.ext as any,
      totalEp: best.totalEp,
      spotifyId: best.spotifyId,
      popularityScore: 0,
      voteCount: 0,
      lastSyncedAt: new Date(),
    },
  });

  return created.id;
}

// ─── Main batch import endpoint ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`import-batch:${session.user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const userId = session.user.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { source, items, conflictMode = "skip" } = body as {
    source: string;
    items: ParsedImportItem[];
    conflictMode: "skip" | "overwrite" | "keep_higher";
  };

  if (!source || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "source and items[] required" }, { status: 400 });
  }

  // Cap at 5000 items per import
  if (items.length > 5000) {
    return NextResponse.json({ error: "Maximum 5000 items per import" }, { status: 400 });
  }

  // Create import record
  const importRecord = await prisma.import.create({
    data: {
      userId,
      source,
      status: "processing",
      totalItems: items.length,
    },
  });

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let duplicates = 0;
  const errors: string[] = [];

  // Process items in batches of 5 with delay between batches
  const BATCH_SIZE = 5;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        try {
          // Resolve item to our DB
          const itemId = await resolveItem(item);
          if (!itemId) {
            failed++;
            return;
          }

          // Handle rating
          if (item.rating) {
            const existingRating = await prisma.rating.findUnique({
              where: { userId_itemId: { userId, itemId } },
            });

            if (existingRating) {
              duplicates++;
              if (conflictMode === "skip") {
                skipped++;
                return;
              } else if (conflictMode === "keep_higher") {
                if (existingRating.score >= item.rating) {
                  skipped++;
                  return;
                }
              }
              // overwrite or keep_higher (new is higher)
              await prisma.rating.update({
                where: { userId_itemId: { userId, itemId } },
                data: { score: item.rating, importSource: source },
              });
            } else {
              await prisma.rating.create({
                data: { userId, itemId, score: item.rating, importSource: source },
              });
            }
          }

          // Handle library status
          if (item.status) {
            const existingEntry = await prisma.libraryEntry.findUnique({
              where: { userId_itemId: { userId, itemId } },
            });

            if (!existingEntry) {
              await prisma.libraryEntry.create({
                data: { userId, itemId, status: item.status },
              });
            } else if (conflictMode === "overwrite") {
              await prisma.libraryEntry.update({
                where: { userId_itemId: { userId, itemId } },
                data: { status: item.status },
              });
            }
          }

          // Handle review
          if (item.review) {
            const existingReview = await prisma.review.findUnique({
              where: { userId_itemId: { userId, itemId } },
            });

            if (!existingReview) {
              await prisma.review.create({
                data: { userId, itemId, text: item.review },
              });
            }
          }

          imported++;
        } catch (err: any) {
          failed++;
          errors.push(`${item.title}: ${err.message?.slice(0, 80)}`);
        }
      })
    );

    // Small delay between batches to avoid hammering APIs
    if (i + BATCH_SIZE < items.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Update import record
  await prisma.import.update({
    where: { id: importRecord.id },
    data: {
      status: "completed",
      importedItems: imported,
      skippedItems: skipped,
      failedItems: failed,
      duplicateItems: duplicates,
      details: { errors: errors.slice(0, 50) },
      completedAt: new Date(),
    },
  });

  return NextResponse.json({
    importId: importRecord.id,
    imported,
    skipped,
    failed,
    duplicates,
    total: items.length,
    errors: errors.slice(0, 10),
  });
}
