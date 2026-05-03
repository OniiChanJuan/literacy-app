import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * GET /api/activity-public
 *
 * Platform-wide activity feed — the 4 most recent rating / review /
 * library-add actions from ANY user. Used by the "What's happening"
 * section on the For You page. No auth required.
 *
 * Each entry:
 *   { kind: "review" | "rating" | "library",
 *     createdAt, user: {name, memberNumber, avatar},
 *     item: {id, title, type, cover, slug, genre},
 *     review?: string (snippet), rating?: number, libraryStatus?: string }
 */

type Kind = "review" | "rating" | "library";

interface FeedEntry {
  kind: Kind;
  createdAt: string;
  user: {
    id: string;
    name: string;
    memberNumber: number | null;
    avatar: string | null;
  };
  item: {
    id: number;
    title: string;
    type: string;
    cover: string | null;
    slug: string | null;
    genre: string[];
  };
  rating?: number;
  reviewSnippet?: string;
  libraryStatus?: string;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`activity-public:${ip}`, 120, 60_000)) {
    return NextResponse.json([], { status: 429 });
  }

  const limit = Math.min(10, parseInt(req.nextUrl.searchParams.get("limit") || "4"));

  try {
    // Pull a little more than needed from each stream so the interleaved
    // merge still has `limit` results after sorting.
    // Drop the user include in favor of a separate
    // publicUserProfile fetch + in-memory join. Keeps the user
    // read surface narrow (view, not base table).
    const [reviews, ratings, library] = await Promise.all([
      prisma.review.findMany({
        orderBy: { createdAt: "desc" },
        take: limit + 4,
        include: {
          item: { select: { id: true, title: true, type: true, cover: true, slug: true, genre: true } },
        },
      }),
      prisma.rating.findMany({
        orderBy: { createdAt: "desc" },
        take: limit + 4,
        include: {
          item: { select: { id: true, title: true, type: true, cover: true, slug: true, genre: true } },
        },
      }),
      prisma.libraryEntry.findMany({
        orderBy: { startedAt: "desc" },
        where: { status: { in: ["want_to", "in_progress", "completed"] } },
        take: limit + 4,
        include: {
          item: { select: { id: true, title: true, type: true, cover: true, slug: true, genre: true } },
        },
      }),
    ]);

    const userIds = Array.from(new Set([
      ...reviews.map((r) => r.userId),
      ...ratings.map((r) => r.userId),
      ...library.map((l) => l.userId),
    ]));
    const profiles = userIds.length > 0
      ? await prisma.publicUserProfile.findMany({ where: { id: { in: userIds } } })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const userOrFallback = (id: string) => {
      const p = profileMap.get(id);
      return {
        id,
        name: p?.name ?? "Someone",
        memberNumber: p?.memberNumber ?? null,
        avatar: p?.avatar ?? null,
      };
    };

    const combined: FeedEntry[] = [
      ...reviews.map((r): FeedEntry => ({
        kind: "review",
        createdAt: r.createdAt.toISOString(),
        user: userOrFallback(r.userId),
        item: { ...r.item, genre: r.item.genre ?? [] },
        reviewSnippet: r.text?.slice(0, 80) ?? "",
      })),
      ...ratings.map((r): FeedEntry => ({
        kind: "rating",
        createdAt: r.createdAt.toISOString(),
        user: userOrFallback(r.userId),
        item: { ...r.item, genre: r.item.genre ?? [] },
        rating: r.score,
      })),
      ...library.map((l): FeedEntry => ({
        kind: "library",
        createdAt: (l.startedAt ?? new Date(0)).toISOString(),
        user: userOrFallback(l.userId),
        item: { ...l.item, genre: l.item.genre ?? [] },
        libraryStatus: l.status,
      })),
    ];

    combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const out = combined.slice(0, limit);

    const res = NextResponse.json(out);
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res;
  } catch (err) {
    console.error("activity-public error:", err);
    return NextResponse.json([]);
  }
}
