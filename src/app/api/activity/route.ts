import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/activity — reviews + ratings from followed users
// Query params: sort=recent|top (default: recent), offset=0, limit=20
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`activity:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json([]);

  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") === "top" ? "top" : "recent";
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0"));
  const limit = 20;

  // Get who the user follows
  const follows = await prisma.follow.findMany({
    where: { followerId: claims.sub },
    select: { followedId: true },
  });
  const followedIds = follows.map((f) => f.followedId);

  if (followedIds.length === 0) return NextResponse.json([]);

  // Fetch reviews from followed users (without user include — we'll
  // fetch profile data via the public_user_profiles view below).
  const reviews = await prisma.review.findMany({
    where: { userId: { in: followedIds } },
    include: {
      item: { select: { id: true, title: true, type: true, cover: true, year: true, slug: true } },
      _count: { select: { helpfulVotes: true } },
    },
    orderBy: sort === "top" ? { helpfulVotes: { _count: "desc" } } : { createdAt: "desc" },
    take: 80,
  });

  // Build set of (userId-itemId) pairs that have reviews so we can exclude them from ratings
  const reviewedSet = new Set(reviews.map((r) => `${r.userId}-${r.itemId}`));

  // Fetch ratings from followed users (more than needed, we'll filter)
  const allRatings = await prisma.rating.findMany({
    where: { userId: { in: followedIds } },
    include: {
      item: { select: { id: true, title: true, type: true, cover: true, year: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Fetch the safe-fields profile for every author appearing in either set.
  const authorIds = Array.from(new Set([
    ...reviews.map((r) => r.userId),
    ...allRatings.map((r) => r.userId),
  ]));
  const profiles = authorIds.length > 0
    ? await prisma.publicUserProfile.findMany({ where: { id: { in: authorIds } } })
    : [];
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // Build lookup map for ratings by userId+itemId (for reviews needing score)
  const ratingMap = new Map(allRatings.map((r) => [`${r.userId}-${r.itemId}`, r]));

  // Rating-only: ratings with no corresponding review in our set
  const ratingOnlyItems = allRatings.filter(
    (r) => !reviewedSet.has(`${r.userId}-${r.itemId}`)
  );

  // Build unified activity list
  type ActivityEntry = {
    id: string;        // "review-N" or "rating-userId-itemId"
    userId: string;
    userName: string;
    userAvatar: string;
    userMemberNumber: number | null;
    itemId: number;
    itemTitle: string;
    itemType: string;
    itemSlug: string | null;
    itemCover: string;
    itemYear: number;
    score: number;
    recommendTag: string | null;
    text: string;      // empty string = rating only
    helpfulCount: number;
    createdAt: string;
  };

  const reviewEntries: ActivityEntry[] = reviews.map((r) => {
    const rating = ratingMap.get(`${r.userId}-${r.itemId}`);
    const u = profileMap.get(r.userId);
    return {
      id: `review-${r.id}`,
      userId: r.userId,
      userName: u?.name || "Anonymous",
      userAvatar: u?.image || u?.avatar || "",
      userMemberNumber: u?.memberNumber ?? null,
      itemId: r.item.id,
      itemTitle: r.item.title,
      itemType: r.item.type,
      itemSlug: (r.item as any).slug || null,
      itemCover: r.item.cover,
      itemYear: r.item.year,
      score: rating?.score ?? 0,
      recommendTag: rating?.recommendTag ?? null,
      text: r.text,
      helpfulCount: r._count.helpfulVotes,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const ratingEntries: ActivityEntry[] = ratingOnlyItems.map((r) => {
    const u = profileMap.get(r.userId);
    return {
    id: `rating-${r.userId}-${r.itemId}`,
    userId: r.userId,
    userName: u?.name || "Anonymous",
    userAvatar: u?.image || u?.avatar || "",
    userMemberNumber: u?.memberNumber ?? null,
    itemId: r.item.id,
    itemTitle: r.item.title,
    itemType: r.item.type,
    itemSlug: (r.item as any).slug || null,
    itemCover: r.item.cover,
    itemYear: r.item.year,
    score: r.score,
    recommendTag: r.recommendTag ?? null,
    text: "",
    helpfulCount: 0,
    createdAt: r.createdAt.toISOString(),
    };
  });

  // Merge and sort
  const all = [...reviewEntries, ...ratingEntries];

  if (sort === "top") {
    all.sort((a, b) => b.helpfulCount - a.helpfulCount || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else {
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const paginated = all.slice(offset, offset + limit);
  const hasMore = all.length > offset + limit;

  const res = NextResponse.json({ items: paginated, hasMore, total: all.length });
  // Personalized per-user — no CDN caching, but allow browser to cache 30s to reduce rapid re-fetches
  res.headers.set("Cache-Control", "private, max-age=30");
  return res;
}
