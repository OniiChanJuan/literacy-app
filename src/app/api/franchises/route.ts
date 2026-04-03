import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * GET /api/franchises?itemId=123 — Get franchise data for a specific item
 * Returns the most specific (smallest) franchise + parent universe info
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`franchises:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const itemId = parseInt(req.nextUrl.searchParams.get("itemId") || "0");
  if (!itemId) return NextResponse.json(null);

  try {
    const franchiseLinks = await prisma.franchiseItem.findMany({
      where: { itemId },
      include: {
        franchise: {
          include: {
            parentFranchise: { select: { id: true, name: true, icon: true } },
            items: {
              include: {
                item: {
                  select: {
                    id: true, title: true, type: true, year: true,
                    cover: true, ext: true, isUpcoming: true, releaseDate: true, slug: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (franchiseLinks.length === 0) return NextResponse.json(null);

    // Pick the most specific franchise (smallest item count = most specific)
    const franchise = franchiseLinks
      .map((fl) => fl.franchise)
      .sort((a, b) => a.items.length - b.items.length)[0];

    // Build other items list
    const otherItems = franchise.items
      .filter((fi) => fi.itemId !== itemId)
      .map((fi) => {
        const item = fi.item;
        const ext = (item.ext || {}) as Record<string, number>;
        let bestScore: { label: string; display: string; value: number } | null = null;

        const priority = ["imdb", "rt", "meta", "mal", "goodreads", "pitchfork", "ign", "steam"];
        for (const key of priority) {
          if (ext[key] !== undefined) {
            const val = ext[key];
            if (["imdb", "mal", "ign", "pitchfork"].includes(key)) {
              bestScore = { label: key === "imdb" ? "IMDb" : key === "mal" ? "MAL" : key.toUpperCase(), display: val.toFixed(1), value: val };
            } else if (key === "goodreads") {
              bestScore = { label: "Goodreads", display: val.toFixed(1), value: val };
            } else if (key === "rt") {
              bestScore = { label: "RT", display: `${val}%`, value: val / 10 };
            } else if (key === "meta") {
              bestScore = { label: "Meta", display: `${val}`, value: val / 10 };
            } else {
              bestScore = { label: key.toUpperCase(), display: String(val), value: val };
            }
            break;
          }
        }

        return {
          id: item.id, title: item.title, type: item.type, year: item.year,
          cover: item.cover, isUpcoming: item.isUpcoming, releaseDate: item.releaseDate,
          score: bestScore,
        };
      })
      .sort((a, b) => a.year - b.year);

    // Deduplicate by normalized title + type + year
    const seen = new Set<string>();
    const deduped = otherItems.filter((item) => {
      const normalized = item.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      const key = `${normalized}::${item.type}::${item.year}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const allTypes = new Set(franchise.items.map((fi) => fi.item.type));

    // Community rating aggregate
    const ratingAgg = await prisma.franchiseRating.aggregate({
      where: { franchiseId: franchise.id },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const communityAverage = ratingAgg._avg.rating
      ? Math.round(ratingAgg._avg.rating * 10) / 10
      : null;
    const totalVotes = ratingAgg._count.rating;

    // Determine franchise color based on icon or dominant type
    const typeColors: Record<string, string> = {
      "🕷": "#E84855", "🦇": "#1a1a2e", "🦸": "#E84855", "🧬": "#3185FC",
      "⚡": "#F9A620", "💍": "#C45BAA", "🐺": "#E84855", "🧟": "#2EC4B6",
      "🎬": "#E84855", "🗾": "#FF6B6B", "🎮": "#2EC4B6", "📖": "#3185FC",
      "📺": "#C45BAA", "🎵": "#9B5DE5", "🔗": "#9B5DE5",
    };
    const color = typeColors[franchise.icon] || "#C45BAA";

    // Sibling franchises — other children of the same parent
    type UniverseSeries = { id: number; name: string; icon: string; itemCount: number; firstCover: string | null };
    let siblingFranchises: UniverseSeries[] = [];
    if (franchise.parentFranchiseId) {
      const rawSiblings = await (prisma as any).franchise.findMany({
        where: { parentFranchiseId: franchise.parentFranchiseId, id: { not: franchise.id } },
        include: {
          _count: { select: { items: true } },
          items: {
            take: 1,
            where: { item: { cover: { not: null } } },
            include: { item: { select: { cover: true } } },
          },
        },
      });
      siblingFranchises = rawSiblings.map((s: any) => ({
        id: s.id,
        name: s.name,
        icon: s.icon || "🔗",
        itemCount: s._count.items,
        firstCover: s.items[0]?.item?.cover ?? null,
      }));
    }

    // Child franchises — sub-series within THIS franchise (Scenario D: item is in a parent universe directly)
    let childFranchises: UniverseSeries[] = [];
    const rawChildren = await (prisma as any).franchise.findMany({
      where: { parentFranchiseId: franchise.id },
      include: {
        _count: { select: { items: true } },
        items: {
          take: 1,
          where: { item: { cover: { not: null } } },
          include: { item: { select: { cover: true } } },
        },
      },
    });
    if (rawChildren.length > 0) {
      childFranchises = rawChildren.map((c: any) => ({
        id: c.id,
        name: c.name,
        icon: c.icon || "🔗",
        itemCount: c._count.items,
        firstCover: c.items[0]?.item?.cover ?? null,
      }));
    }

    const res = NextResponse.json({
      id: franchise.id,
      name: franchise.name,
      icon: franchise.icon || "🔗",
      color,
      totalItems: franchise.items.length,
      mediaTypes: allTypes.size,
      otherItems: deduped,
      parentFranchise: franchise.parentFranchise || null,
      siblingFranchises,
      childFranchises,
      communityAverage,
      totalVotes,
    });
    res.headers.set("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res;
  } catch (error: any) {
    console.error("Franchise API error:", error);
    return NextResponse.json(null);
  }
}
