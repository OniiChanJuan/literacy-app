import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import { loadPrivacyFlagsForUser } from "@/lib/privacy";

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

  // Read profile via the public_user_profiles view (the safe-fields
  // projection of users — see scripts/migrate-create-public-user-profiles-view.ts).
  // _count lives on the base User model and is fetched separately.
  const user = await prisma.publicUserProfile.findUnique({ where: { id } });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const counts = await prisma.user.findUnique({
    where: { id },
    select: { _count: { select: { ratings: true, reviews: true, libraryEntries: true } } },
  });

  // Check if this is the user's own profile
  const claims = await getClaims();
  const isOwn = claims?.sub === id;

  // Privacy gates. Owner sees their own data regardless of toggle state.
  // is_private acts as a master switch over the passive-consumption
  // surfaces (ratings + library). The show* toggles narrow further
  // even when is_private=false.
  const flags = await loadPrivacyFlagsForUser(id);
  const showRatings = isOwn || (!user.isPrivate && flags.showRatingsPublicly);
  // showLibraryPublicly already considered alongside is_private here.
  const showLibrary = isOwn || (!user.isPrivate && flags.showLibraryPublicly);

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
  if (showRatings) {
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
      ratingsCount: showRatings ? (counts?._count.ratings ?? 0) : 0,
      reviewsCount: counts?._count.reviews ?? 0, // reviews are always public
      trackedCount: showLibrary ? (counts?._count.libraryEntries ?? 0) : 0,
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
