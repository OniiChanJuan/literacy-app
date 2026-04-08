import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/users/[id] — get public profile + stats + top rated + library
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = _req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`users-profile:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, username: true, bio: true, avatar: true, image: true,
      isPrivate: true, createdAt: true, memberNumber: true,
      _count: { select: { ratings: true, reviews: true, libraryEntries: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check if this is the user's own profile
  const claims = await getClaims();
  const isOwn = claims?.sub === id;
  const showLibrary = !user.isPrivate || isOwn;

  // Follower/following counts + isFollowing
  const [followerCount, followingCount, followRecord] = await Promise.all([
    prisma.follow.count({ where: { followedId: id } }),
    prisma.follow.count({ where: { followerId: id } }),
    claims?.sub && !isOwn
      ? prisma.follow.findUnique({
          where: { followerId_followedId: { followerId: claims.sub, followedId: id } },
        })
      : Promise.resolve(null),
  ]);

  // Top rated items — include item data
  let topRatings: any[] = [];
  if (showLibrary) {
    topRatings = await prisma.rating.findMany({
      where: { userId: id },
      orderBy: { score: "desc" },
      take: 10,
      select: {
        itemId: true, score: true, recommendTag: true,
        item: {
          select: {
            id: true, title: true, type: true, genre: true, vibes: true,
            year: true, cover: true, description: true, totalEp: true, ext: true,
          },
        },
      },
    });
  }

  // Library entries with item data
  let library: any[] = [];
  if (showLibrary) {
    library = await prisma.libraryEntry.findMany({
      where: { userId: id },
      select: {
        itemId: true, status: true, progressCurrent: true,
        item: {
          select: {
            id: true, title: true, type: true, genre: true, vibes: true,
            year: true, cover: true, description: true, totalEp: true, ext: true,
          },
        },
      },
    });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      bio: user.bio,
      avatar: user.avatar || user.image || "",
      isPrivate: user.isPrivate,
      createdAt: user.createdAt,
      ratingsCount: showLibrary ? user._count.ratings : 0,
      reviewsCount: showLibrary ? user._count.reviews : 0,
      trackedCount: showLibrary ? user._count.libraryEntries : 0,
      memberNumber: user.memberNumber,
      followerCount,
      followingCount,
      isFollowing: !!followRecord,
    },
    topRatings,
    library: showLibrary ? library : null,
    isOwn,
  });
}
