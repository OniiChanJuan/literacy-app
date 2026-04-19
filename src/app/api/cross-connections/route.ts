import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

/**
 * GET /api/cross-connections
 *
 * Personalized cross-media connections.
 *
 *   1. Pull user's top-rated (4+ star) item ids.
 *   2. Find connections whose source is one of those items AND whose
 *      recommended items haven't been rated by the user. Prioritize by
 *      qualityScore.
 *   3. Fallback: if nothing personalized (new user, niche taste, or
 *      fewer than 3 matches), top up with random editorial connections
 *      labeled with mode='discovery'.
 *
 * Connections with qualityScore < 0.3 are hidden entirely.
 */

interface ItemThumb {
  id: number;
  title: string;
  type: string;
  cover: string | null;
  slug: string | null;
}
interface ConnectionOut {
  id: number;
  mode: "because_you_loved" | "discovery";
  sourceItem: ItemThumb;
  recommendedItems: ItemThumb[];
  reason: string;
  themeTags: string[];
  qualityScore: number;
  userVote: -1 | 0 | 1;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`cross-connections:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const claims = await getClaims();
  const userId = claims?.sub ?? null;

  try {
    // Rated-by-user ids so we can exclude those from recs.
    let ratedIds = new Set<number>();
    let lovedIds: number[] = [];
    if (userId) {
      const ratings = await prisma.rating.findMany({
        where: { userId },
        select: { itemId: true, score: true },
      });
      for (const r of ratings) ratedIds.add(r.itemId);
      lovedIds = ratings.filter((r) => r.score >= 4).map((r) => r.itemId);
    }

    // User's existing votes on connections so we can show their state.
    const userVotes = userId
      ? await prisma.crossConnectionVote.findMany({
          where: { userId },
          select: { connectionId: true, vote: true },
        })
      : [];
    const voteMap = new Map<number, number>(userVotes.map((v) => [v.connectionId, v.vote]));

    // Personalized connections first (only if user has ≥1 loved item).
    let personalized: any[] = [];
    if (lovedIds.length > 0) {
      personalized = await prisma.crossConnection.findMany({
        where: {
          sourceItemId: { in: lovedIds },
          qualityScore: { gte: 0.3 },
        },
        orderBy: [{ qualityScore: "desc" }, { id: "asc" }],
        include: {
          sourceItem: { select: { id: true, title: true, type: true, cover: true, slug: true } },
        },
        take: 12,
      });
    }

    // Filter out connections whose recs overlap with rated items (personalized only).
    const filteredPersonalized = personalized.filter((c) => {
      const recs = Array.isArray(c.recommendedItems) ? c.recommendedItems : [];
      return !recs.some((r: any) => ratedIds.has(Number(r.item_id)));
    });

    // Fetch up to 6 so ultrawide can show more; CSS hides extras on smaller viewports.
    const TARGET = 6;
    const chosen: typeof personalized = filteredPersonalized.slice(0, TARGET);
    const mode: ConnectionOut["mode"] = chosen.length > 0 ? "because_you_loved" : "discovery";

    // Fill up to TARGET with random editorial connections.
    if (chosen.length < TARGET) {
      const excludeIds = new Set(chosen.map((c) => c.id));
      const randoms: any[] = await prisma.$queryRawUnsafe(`
        SELECT id, source_item_id AS "sourceItemId", recommended_items AS "recommendedItems",
               reason, theme_tags AS "themeTags", quality_score AS "qualityScore"
        FROM cross_connections
        WHERE quality_score >= 0.3
          ${excludeIds.size > 0 ? `AND id NOT IN (${[...excludeIds].join(",")})` : ""}
        ORDER BY RANDOM()
        LIMIT ${TARGET - chosen.length}
      `);
      // Attach sourceItem to each random pick.
      const srcIds = randoms.map((r) => r.sourceItemId);
      const srcRows = srcIds.length > 0
        ? await prisma.item.findMany({
            where: { id: { in: srcIds } },
            select: { id: true, title: true, type: true, cover: true, slug: true },
          })
        : [];
      const srcMap = new Map(srcRows.map((s) => [s.id, s]));
      for (const r of randoms) {
        chosen.push({ ...r, sourceItem: srcMap.get(r.sourceItemId) || null });
      }
    }

    // Hydrate recommended_items with current cover + slug so the card
    // can render thumbnails and link to the latest URL.
    const allRecIds = Array.from(
      new Set(
        chosen.flatMap((c: any) =>
          Array.isArray(c.recommendedItems) ? c.recommendedItems.map((r: any) => Number(r.item_id)) : []
        ),
      ),
    );
    const recRows = allRecIds.length > 0
      ? await prisma.item.findMany({
          where: { id: { in: allRecIds } },
          select: { id: true, title: true, type: true, cover: true, slug: true },
        })
      : [];
    const recMap = new Map(recRows.map((r) => [r.id, r]));

    const out: ConnectionOut[] = chosen
      .filter((c: any) => c.sourceItem)
      .map((c: any) => {
        const recsRaw = Array.isArray(c.recommendedItems) ? c.recommendedItems : [];
        const recs: ItemThumb[] = recsRaw
          .map((r: any) => recMap.get(Number(r.item_id)))
          .filter(Boolean) as ItemThumb[];
        return {
          id: c.id,
          mode,
          sourceItem: c.sourceItem,
          recommendedItems: recs,
          reason: c.reason,
          themeTags: c.themeTags || c.theme_tags || [],
          qualityScore: Number(c.qualityScore ?? c.quality_score ?? 1),
          userVote: (voteMap.get(c.id) ?? 0) as -1 | 0 | 1,
        };
      });

    const res = NextResponse.json({ mode, connections: out });
    res.headers.set("Cache-Control", "private, max-age=60");
    return res;
  } catch (err) {
    console.error("cross-connections error:", err);
    return NextResponse.json({ mode: "discovery" as const, connections: [] });
  }
}
