import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * GET /api/export-data — GDPR Article 20 data portability
 * Returns a JSON file containing ALL user data.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`export-data:${session.user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const uid = session.user.id;

  const [user, settings, ratings, reviews, library, following, followers, signals, dismissed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: uid },
      select: {
        email: true, username: true, name: true, bio: true, avatar: true,
        memberNumber: true, isPrivate: true, tasteProfile: true,
        authProvider: true, createdAt: true, updatedAt: true,
        termsAcceptedAt: true,
      },
    }),
    prisma.userSettings.findUnique({
      where: { userId: uid },
    }),
    prisma.rating.findMany({
      where: { userId: uid },
      include: { item: { select: { title: true, type: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.review.findMany({
      where: { userId: uid },
      include: { item: { select: { title: true, type: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.libraryEntry.findMany({
      where: { userId: uid },
      include: { item: { select: { title: true, type: true } } },
    }),
    prisma.follow.findMany({
      where: { followerId: uid },
      include: { followed: { select: { username: true, name: true } } },
    }),
    prisma.follow.findMany({
      where: { followedId: uid },
      include: { follower: { select: { username: true, name: true } } },
    }),
    prisma.implicitSignal.findMany({
      where: { userId: uid },
      include: { item: { select: { title: true, type: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.dismissedItem.findMany({
      where: { userId: uid },
      include: { item: { select: { title: true, type: true } } },
    }),
  ]);

  const exportData = {
    exportDate: new Date().toISOString(),
    exportedBy: "Literacy — literacy.app",
    profile: {
      email: user?.email,
      username: user?.username,
      displayName: user?.name,
      bio: user?.bio,
      avatar: user?.avatar,
      memberNumber: user?.memberNumber,
      isPrivate: user?.isPrivate,
      authProvider: user?.authProvider,
      accountCreated: user?.createdAt,
      lastUpdated: user?.updatedAt,
      termsAcceptedAt: user?.termsAcceptedAt,
    },
    tasteProfile: user?.tasteProfile || null,
    settings: settings ? {
      showRatingsPublicly: settings.showRatingsPublicly,
      showLibraryPublicly: settings.showLibraryPublicly,
      showActivityPublicly: settings.showActivityPublicly,
      theme: settings.theme,
      defaultMediaType: settings.defaultMediaType,
      showMatureContent: settings.showMatureContent,
      emailNewFollower: settings.emailNewFollower,
      emailReviewLiked: settings.emailReviewLiked,
      emailFranchiseRelease: settings.emailFranchiseRelease,
      emailWeeklyDigest: settings.emailWeeklyDigest,
      favoriteMediaTypes: settings.favoriteMediaTypes,
    } : null,
    ratings: ratings.map((r) => ({
      itemTitle: r.item.title,
      itemType: r.item.type,
      score: r.score,
      recommendTag: r.recommendTag,
      date: r.createdAt,
    })),
    reviews: reviews.map((r) => ({
      itemTitle: r.item.title,
      itemType: r.item.type,
      text: r.text,
      containsSpoilers: r.containsSpoilers,
      helpfulCount: r.helpfulCount,
      date: r.createdAt,
      lastEdited: r.updatedAt,
    })),
    library: library.map((l) => ({
      itemTitle: l.item.title,
      itemType: l.item.type,
      status: l.status,
      progressCurrent: l.progressCurrent,
      progressTotal: l.progressTotal,
      startedAt: l.startedAt,
      completedAt: l.completedAt,
    })),
    following: following.map((f) => ({
      username: f.followed.username,
      name: f.followed.name,
      since: f.createdAt,
    })),
    followers: followers.map((f) => ({
      username: f.follower.username,
      name: f.follower.name,
      since: f.createdAt,
    })),
    implicitSignals: signals.map((s) => ({
      itemTitle: s.item.title,
      itemType: s.item.type,
      signalType: s.signalType,
      value: s.value,
      date: s.createdAt,
    })),
    dismissedItems: dismissed.map((d) => ({
      itemTitle: d.item.title,
      itemType: d.item.type,
      date: d.createdAt,
    })),
  };

  const res = new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="literacy-data-export-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
  return res;
}
