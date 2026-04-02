import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/users/me/following — full list of users the current user follows
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`me-following:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([]);

  const follows = await prisma.follow.findMany({
    where: { followerId: session.user.id },
    include: {
      followed: {
        select: {
          id: true,
          name: true,
          image: true,
          avatar: true,
          memberNumber: true,
          _count: { select: { ratings: true, reviews: true } },
          ratings: {
            select: { item: { select: { type: true } }, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 200,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const users = follows.map((f) => {
    const u = f.followed;

    // Compute top media types by rating count
    const typeCounts: Record<string, number> = {};
    let lastActiveAt: string | null = null;
    for (const r of u.ratings) {
      typeCounts[r.item.type] = (typeCounts[r.item.type] || 0) + 1;
      if (!lastActiveAt) lastActiveAt = r.createdAt.toISOString(); // already desc order
    }
    const topMediaTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);

    return {
      id: u.id,
      name: u.name || "Anonymous",
      avatar: u.avatar || u.image || "",
      memberNumber: u.memberNumber,
      ratedCount: u._count.ratings,
      reviewCount: u._count.reviews,
      topMediaTypes,
      lastActiveAt,
    };
  });

  return NextResponse.json(users);
}
