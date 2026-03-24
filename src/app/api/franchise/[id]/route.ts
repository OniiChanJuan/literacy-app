import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/franchise/[id] — Get full franchise detail with all items
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    });
    res.headers.set("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res;
  } catch (error: any) {
    console.error("Franchise detail error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
