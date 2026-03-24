import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/franchises?itemId=123 — Get franchise data for a specific item
 * Returns franchise info + all other items in the franchise (not the requested one)
 */
export async function GET(req: NextRequest) {
  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) {
    return NextResponse.json(null);
  }

  try {
    // Find franchise(s) this item belongs to
    const franchiseLinks = await prisma.franchiseItem.findMany({
      where: { itemId },
      include: {
        franchise: {
          include: {
            items: {
              include: {
                item: {
                  select: {
                    id: true,
                    title: true,
                    type: true,
                    year: true,
                    cover: true,
                    ext: true,
                    isUpcoming: true,
                    releaseDate: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (franchiseLinks.length === 0) {
      return NextResponse.json(null);
    }

    // Use the first franchise found (items usually belong to one franchise)
    const franchise = franchiseLinks[0].franchise;

    // Get other items (not the current one)
    const otherItems = franchise.items
      .filter((fi) => fi.itemId !== itemId)
      .map((fi) => {
        const item = fi.item;
        const ext = item.ext as Record<string, number>;
        const extEntries = Object.entries(ext);
        let bestScore: { label: string; display: string; value: number } | null = null;

        if (extEntries.length > 0) {
          const priority = ["imdb", "rt", "meta", "mal", "goodreads", "pitchfork", "ign", "steam"];
          for (const key of priority) {
            if (ext[key] !== undefined) {
              const val = ext[key];
              if (["imdb", "mal", "ign", "pitchfork"].includes(key)) {
                bestScore = { label: key.toUpperCase(), display: val.toFixed(1), value: val };
              } else if (key === "goodreads") {
                bestScore = { label: "GR", display: val.toFixed(1), value: val };
              } else {
                bestScore = { label: key.toUpperCase(), display: `${val}%`, value: val / 10 };
              }
              break;
            }
          }
          if (!bestScore && extEntries.length > 0) {
            const [k, v] = extEntries[0];
            bestScore = { label: k.toUpperCase(), display: String(v), value: v };
          }
        }

        return {
          id: item.id,
          title: item.title,
          type: item.type,
          year: item.year,
          cover: item.cover,
          isUpcoming: item.isUpcoming,
          releaseDate: item.releaseDate,
          score: bestScore,
        };
      });

    // Count unique media types
    const allTypes = new Set(franchise.items.map((fi) => fi.item.type));

    const res = NextResponse.json({
      id: franchise.id,
      name: franchise.name,
      icon: franchise.icon || "🔗",
      color: franchise.icon === "🎬" ? "#E84855" :
             franchise.icon === "🗾" ? "#FF6B6B" :
             franchise.icon === "🎮" ? "#2EC4B6" :
             franchise.icon === "📖" ? "#3185FC" :
             franchise.icon === "🔗" ? "#9B5DE5" :
             "#C45BAA",
      totalItems: franchise.items.length,
      mediaTypes: allTypes.size,
      otherItems,
    });
    res.headers.set("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res;
  } catch (error: any) {
    console.error("Franchise API error:", error);
    return NextResponse.json(null);
  }
}
