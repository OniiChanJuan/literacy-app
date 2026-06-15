import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/cross-connections/recs/[recId]/vote
 *
 * Per-rec thumbs (mobile). Body: { vote: 1 | -1 | 0 }.
 *   1  → upvote    (recorded)
 *  -1  → downvote  (recorded)
 *   0  → clear existing vote
 *
 * CAPTURE-ONLY. Writes connection_rec_votes (vote + user + connection_rec +
 * timestamp) and drives the thumb's selected state. It touches NOTHING in the
 * ranking/strength path — no curated_strength, no community_adjustment, no
 * quality_score. The finer per-rec signal is banked for future Stage-3 use
 * without affecting what's shown now. (Desktop's per-connection thumbs use a
 * separate lane, cross_connection_votes.)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ recId: string }> },
) {
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!rateLimit(`cc-rec-vote:${claims.sub}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many votes" }, { status: 429 });
  }

  const { recId } = await params;
  const connectionRecId = Number.parseInt(recId);
  if (!Number.isFinite(connectionRecId)) {
    return NextResponse.json({ error: "Invalid rec id" }, { status: 400 });
  }

  let body: { vote?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }
  const next = body.vote;
  if (next !== 1 && next !== -1 && next !== 0) {
    return NextResponse.json({ error: "vote must be -1, 0, or 1" }, { status: 400 });
  }

  try {
    // Record-only: write (or clear) the per-rec vote row. No ranking/strength write.
    if (next === 0) {
      await prisma.connectionRecVote.deleteMany({
        where: { userId: claims.sub, connectionRecId },
      });
    } else {
      await prisma.connectionRecVote.upsert({
        where: { userId_connectionRecId: { userId: claims.sub, connectionRecId } },
        create: { userId: claims.sub, connectionRecId, vote: next },
        update: { vote: next },
      });
    }
    return NextResponse.json({ ok: true, userVote: next });
  } catch (err) {
    console.error("cc rec vote error:", err);
    return NextResponse.json({ error: "Vote failed" }, { status: 500 });
  }
}
