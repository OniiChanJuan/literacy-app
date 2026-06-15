import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/cross-connections/[id]/vote
 *
 * Body: { vote: 1 | -1 | 0 }
 *   1  → upvote    (recorded)
 *  -1  → downvote  (recorded)
 *   0  → clear existing vote
 *
 * CAPTURE-ONLY — deliberate pre-50-user decoupling (2026-06-14). The vote is
 * RECORDED in cross_connection_votes (vote + user + connection + timestamp) and
 * read back to drive the thumb's selected state, but it NO LONGER mutates the
 * curated connection strength (cross_connections.quality_score). Curated
 * editorial strength must never be auto-mutated by community votes until
 * vote-weighting is deliberately enabled at 50+ real users — with a couple of
 * test accounts, ~7 downvotes would otherwise drop a hand-authored connection
 * below the 0.3 hide threshold and bury it. The signal keeps accumulating for
 * future Stage-3 use; it just stops moving cards. See
 * docs/investigations/crossshelf-thumbs-vote-audit-2026-06-14.md.
 *
 * Idempotent: re-voting the same direction is a no-op; switching overwrites.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!rateLimit(`cc-vote:${claims.sub}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many votes" }, { status: 429 });
  }

  const { id } = await params;
  const connectionId = Number.parseInt(id);
  if (!Number.isFinite(connectionId)) {
    return NextResponse.json({ error: "Invalid connection id" }, { status: 400 });
  }

  let body: { vote?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }
  const next = body.vote;
  if (next !== 1 && next !== -1 && next !== 0) {
    return NextResponse.json({ error: "vote must be -1, 0, or 1" }, { status: 400 });
  }

  try {
    // Record-only: write the vote row (or clear it). NO quality_score
    // mutation — see the capture-only note above.
    if (next === 0) {
      await prisma.crossConnectionVote.deleteMany({
        where: { userId: claims.sub, connectionId },
      });
    } else {
      await prisma.crossConnectionVote.upsert({
        where: { userId_connectionId: { userId: claims.sub, connectionId } },
        create: { userId: claims.sub, connectionId, vote: next },
        update: { vote: next },
      });
    }

    return NextResponse.json({ ok: true, userVote: next });
  } catch (err) {
    console.error("cc vote error:", err);
    return NextResponse.json({ error: "Vote failed" }, { status: 500 });
  }
}
