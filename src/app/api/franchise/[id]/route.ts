import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * GET /api/franchise/[id] — Get full franchise detail with all items
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`franchise-detail:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { id } = await params;
  const franchiseId = parseInt(id);
  if (!franchiseId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
      include: {
        parentFranchise: { select: { id: true, name: true, icon: true } },
        childFranchises: {
          select: { id: true, name: true, icon: true, _count: { select: { items: true } } },
        },
        items: {
          include: {
            item: {
              select: {
                id: true, title: true, type: true, year: true,
                cover: true, ext: true, genre: true, vibes: true,
                isUpcoming: true, releaseDate: true, description: true,
              },
            },
          },
        },
      },
    });

    if (!franchise) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Sort items chronologically
    const items = franchise.items
      .map((fi) => fi.item)
      .sort((a, b) => a.year - b.year);

    // Get unique media types
    const mediaTypes = [...new Set(items.map((i) => i.type))];

    // Group by decade for timeline
    const decades = new Map<string, typeof items>();
    for (const item of items) {
      const decade = `${Math.floor(item.year / 10) * 10}s`;
      if (!decades.has(decade)) decades.set(decade, []);
      decades.get(decade)!.push(item);
    }

    // For parent universes: group items by sub-franchise
    let subFranchiseItems: { name: string; id: number; icon: string; items: typeof items }[] = [];
    if (franchise.childFranchises.length > 0) {
      // Fetch child franchise items
      const childIds = franchise.childFranchises.map(cf => cf.id);
      const childLinks = await prisma.franchiseItem.findMany({
        where: { franchiseId: { in: childIds } },
        select: { franchiseId: true, itemId: true },
      });
      // Map item IDs to child franchises
      const itemToChild = new Map<number, number>();
      for (const cl of childLinks) {
        itemToChild.set(cl.itemId, cl.franchiseId);
      }

      // Group items by sub-franchise
      const grouped = new Map<number, typeof items>();
      const ungrouped: typeof items = [];
      for (const item of items) {
        const childId = itemToChild.get(item.id);
        if (childId) {
          if (!grouped.has(childId)) grouped.set(childId, []);
          grouped.get(childId)!.push(item);
        } else {
          ungrouped.push(item);
        }
      }

      for (const cf of franchise.childFranchises) {
        const cfItems = grouped.get(cf.id) || [];
        if (cfItems.length > 0) {
          subFranchiseItems.push({
            name: cf.name,
            id: cf.id,
            icon: cf.icon || "",
            items: cfItems.sort((a, b) => a.year - b.year),
          });
        }
      }
      if (ungrouped.length > 0) {
        subFranchiseItems.push({
          name: "Other",
          id: 0,
          icon: "",
          items: ungrouped.sort((a, b) => a.year - b.year),
        });
      }
    }

    const res = NextResponse.json({
      id: franchise.id,
      name: franchise.name,
      icon: franchise.icon,
      description: franchise.description,
      totalItems: items.length,
      mediaTypes,
      items,
      decades: Object.fromEntries(decades),
      parentFranchise: franchise.parentFranchise,
      childFranchises: franchise.childFranchises.map((cf) => ({
        id: cf.id, name: cf.name, icon: cf.icon, itemCount: cf._count.items,
      })),
      subFranchiseItems: subFranchiseItems.length > 0 ? subFranchiseItems : undefined,
    });
    res.headers.set("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res;
  } catch (error: any) {
    console.error("Franchise detail error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
