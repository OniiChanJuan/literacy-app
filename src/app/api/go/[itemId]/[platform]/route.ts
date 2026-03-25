import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildPlatformUrl } from "@/lib/platform-links";

/**
 * GET /api/go/:itemId/:platform
 * Logs the click and redirects to the platform URL.
 * Falls back to a search URL if no stored link exists.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string; platform: string }> },
) {
  const { itemId, platform } = await params;
  const numericId = parseInt(itemId);

  if (isNaN(numericId)) {
    return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
  }

  // Fetch item to get stored links and metadata
  const item = await prisma.item.findUnique({
    where: { id: numericId },
    select: {
      id: true,
      title: true,
      type: true,
      year: true,
      spotifyId: true,
      tmdbId: true,
      igdbId: true,
      googleBooksId: true,
      malId: true,
      comicVineId: true,
      platformLinks: true,
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // Try stored link first, then generate on-the-fly
  const storedLinks = (item.platformLinks as Record<string, string>) || {};
  let url = storedLinks[platform] || null;

  if (!url) {
    url = buildPlatformUrl(platform, {
      title: item.title,
      type: item.type,
      spotifyId: item.spotifyId,
      tmdbId: item.tmdbId,
      igdbId: item.igdbId,
      googleBooksId: item.googleBooksId,
      malId: item.malId,
      comicVineId: item.comicVineId,
      year: item.year,
    });
  }

  if (!url) {
    return NextResponse.json({ error: "No link available for this platform" }, { status: 404 });
  }

  // Log click asynchronously (don't block redirect)
  let userId: string | null = null;
  try {
    const session = await auth();
    userId = session?.user?.id || null;
  } catch {
    // Skip auth if it fails
  }

  // Fire-and-forget click logging
  prisma.$executeRaw`
    INSERT INTO platform_clicks (item_id, platform, user_id, referrer, created_at)
    VALUES (${numericId}, ${platform}, ${userId}, ${req.headers.get("referer") || null}, NOW())
  `.catch(() => {});

  return NextResponse.redirect(url, 302);
}
