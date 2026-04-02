import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/explore/filters
 * Returns genres, vibes, and tags sorted by item frequency (most common first).
 * Used by the Explore page to populate scroll rows (top 10) and dropdown panels (full list).
 * Cached for 5 minutes.
 */
export async function GET() {
  try {
    const [genreRows, vibeRows] = await Promise.all([
      prisma.$queryRaw<{ genre: string }[]>`
        SELECT unnest(genre) AS genre, COUNT(*) AS count
        FROM items
        WHERE "isUpcoming" = false
          AND cover IS NOT NULL
          AND cover LIKE 'http%'
        GROUP BY genre
        HAVING COUNT(*) >= 2
        ORDER BY count DESC
        LIMIT 200
      `,
      prisma.$queryRaw<{ vibe: string }[]>`
        SELECT unnest(vibes) AS vibe, COUNT(*) AS count
        FROM items
        WHERE "isUpcoming" = false
          AND cover IS NOT NULL
          AND cover LIKE 'http%'
        GROUP BY vibe
        HAVING COUNT(*) >= 2
        ORDER BY count DESC
        LIMIT 100
      `,
    ]);

    // Tags are stored as JSONB keys in item_tags column — try gracefully
    let tagSlugs: string[] = [];
    try {
      const tagRows = await prisma.$queryRaw<{ tag: string }[]>`
        SELECT key AS tag, COUNT(*) AS count
        FROM items, jsonb_object_keys(item_tags) AS key
        WHERE "isUpcoming" = false
          AND item_tags IS NOT NULL
        GROUP BY key
        HAVING COUNT(*) >= 2
        ORDER BY count DESC
        LIMIT 150
      `;
      tagSlugs = tagRows.map((r) => r.tag).filter(Boolean);
    } catch {
      // item_tags column may not exist or be empty — fall back to empty
    }

    const genres = genreRows.map((r) => r.genre).filter(Boolean);
    const vibes = vibeRows.map((r) => r.vibe).filter(Boolean);

    const res = NextResponse.json({ genres, vibes, tags: tagSlugs });
    res.headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
    return res;
  } catch (error) {
    console.error("[explore/filters] error:", error);
    return NextResponse.json({ genres: [], vibes: [], tags: [] });
  }
}
