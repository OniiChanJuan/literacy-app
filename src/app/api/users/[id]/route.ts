import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/users/[id] — get public profile + stats + top rated + library
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const session = await auth();
  const isOwn = session?.user?.id === id;
  const showLibrary = !user.isPrivate || isOwn;

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
    },
    topRatings,
    library: showLibrary ? library : null,
    isOwn,
  });
}
