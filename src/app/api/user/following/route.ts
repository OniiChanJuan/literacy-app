import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

export interface FollowedFranchise {
  id: number;
  name: string;
  icon: string;
  description: string;
  totalItems: number;
  ratedItems: number;
  mediaTypes: { type: string; count: number }[];
  coverThumbs: string[]; // up to 4 cover URLs
  followerCount: number;
}

// GET /api/user/following — list franchises the current user follows, with progress metadata
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`user-following:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json([]);
  }

  const follows = await prisma.franchiseFollow.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      franchise: {
        include: {
          items: {
            include: {
              item: {
                select: { id: true, type: true, cover: true },
              },
            },
          },
          _count: { select: { follows: true } },
        },
      },
    },
  });

  if (follows.length === 0) return NextResponse.json([]);

  // Get all item IDs across all followed franchises to check which ones the user has rated
  const allItemIds = follows.flatMap((f) => f.franchise.items.map((fi) => fi.item.id));
  const uniqueItemIds = [...new Set(allItemIds)];

  const ratings = await prisma.rating.findMany({
    where: { userId: session.user.id, itemId: { in: uniqueItemIds } },
    select: { itemId: true },
  });
  const ratedSet = new Set(ratings.map((r) => r.itemId));

  const result: FollowedFranchise[] = follows.map(({ franchise }) => {
    const items = franchise.items.map((fi) => fi.item);

    // Media type breakdown
    const typeCounts = new Map<string, number>();
    for (const item of items) {
      typeCounts.set(item.type, (typeCounts.get(item.type) || 0) + 1);
    }
    const mediaTypes = [...typeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Cover thumbnails: pick items with real HTTP cover URLs
    const covers = items
      .filter((i) => i.cover?.startsWith("http"))
      .slice(0, 4)
      .map((i) => i.cover);

    return {
      id: franchise.id,
      name: franchise.name,
      icon: franchise.icon || "🔗",
      description: franchise.description || "",
      totalItems: items.length,
      ratedItems: items.filter((i) => ratedSet.has(i.id)).length,
      mediaTypes,
      coverThumbs: covers,
      followerCount: franchise._count.follows,
    };
  });

  return NextResponse.json(result);
}
