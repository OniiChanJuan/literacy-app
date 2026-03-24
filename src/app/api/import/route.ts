import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectFranchiseForItem } from "@/lib/dedup";

/**
 * POST /api/import — Import an external API item into our database
 * Body: { source, externalId, type, title, year, cover, description, genre, vibes, people, platforms, ext, totalEp }
 * Returns: the newly created (or existing) item with its local database ID
 */
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const { source, externalId, type, title } = body;
  if (!source || !title || !type) {
    return NextResponse.json({ error: "source, title, and type required" }, { status: 400 });
  }

  try {
    // Check if already imported by external ID
    let existing = null;

    if (source === "tmdb" && externalId) {
      existing = await prisma.item.findFirst({ where: { tmdbId: parseInt(externalId) } });
    } else if (source === "igdb" && externalId) {
      existing = await prisma.item.findFirst({ where: { igdbId: parseInt(externalId) } });
    } else if (source === "jikan" && externalId) {
      existing = await prisma.item.findFirst({ where: { malId: parseInt(externalId) } });
    } else if (source === "spotify" && externalId) {
      existing = await prisma.item.findFirst({ where: { spotifyId: String(externalId) } });
    } else if (source === "gbook" && externalId) {
      existing = await prisma.item.findFirst({ where: { googleBooksId: String(externalId) } });
    } else if (source === "comicvine" && externalId) {
      existing = await prisma.item.findFirst({ where: { comicVineId: parseInt(externalId) } });
    }

    // Also check by title + type + year as fallback
    if (!existing && body.year) {
      existing = await prisma.item.findFirst({
        where: {
          title: { equals: title, mode: "insensitive" },
          type,
          year: body.year,
        },
      });
    }

    if (existing) {
      return NextResponse.json({ id: existing.id, alreadyExisted: true });
    }

    // Create new item
    const item = await prisma.item.create({
      data: {
        title: body.title || "",
        type: body.type || "movie",
        genre: Array.isArray(body.genre) ? body.genre : [],
        vibes: Array.isArray(body.vibes) ? body.vibes : [],
        year: body.year || 0,
        cover: body.cover || "",
        description: body.description || body.desc || "",
        people: Array.isArray(body.people) ? body.people : [],
        awards: Array.isArray(body.awards) ? body.awards : [],
        platforms: Array.isArray(body.platforms) ? body.platforms : [],
        ext: body.ext || {},
        totalEp: body.totalEp || 0,
        isUpcoming: body.isUpcoming || false,
        popularityScore: body.popularityScore || 0,
        voteCount: body.voteCount || 0,
        tmdbId: source === "tmdb" ? parseInt(externalId) : undefined,
        igdbId: source === "igdb" ? parseInt(externalId) : undefined,
        malId: source === "jikan" ? parseInt(externalId) : undefined,
        spotifyId: source === "spotify" ? String(externalId) : undefined,
        googleBooksId: source === "gbook" ? String(externalId) : undefined,
        comicVineId: source === "comicvine" ? parseInt(externalId) : undefined,
        lastSyncedAt: new Date(),
      },
    });

    // Auto-detect franchise for new items
    try {
      const franchiseId = await detectFranchiseForItem(
        prisma, item.id, body.title, body.type, body.people,
      );
      if (franchiseId) {
        await prisma.franchiseItem.create({
          data: { franchiseId, itemId: item.id, addedBy: "auto-detect" },
        });
      }
    } catch {
      // Non-critical — don't fail the import
    }

    return NextResponse.json({ id: item.id, alreadyExisted: false }, { status: 201 });
  } catch (error: any) {
    console.error("Import error:", error.message?.slice(0, 100));
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
