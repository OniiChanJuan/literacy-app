import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/cross-connections/[id]/vote
 *
 * Body: { vote: 1 | -1 | 0 }
 *   1  → upvote    (qualityScore += 0.1, capped 2.0)
 *  -1  → downvote  (qualityScore -= 0.1, floored 0.0)
 *   0  → clear existing vote (reverses whatever delta was applied)
 *
 * Idempotent: switching vote direction applies the net delta.
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
    const existing = await prisma.crossConnectionVote.findUnique({
      where: { userId_connectionId: { userId: claims.sub, connectionId } },
      select: { vote: true },
    });
    const prev = existing?.vote ?? 0;
    const delta = (next - prev) * 0.1; // net change in quality_score

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

    if (delta !== 0) {
      // Clamp between 0.0 and 2.0 via least/greatest in SQL.
      await prisma.$executeRawUnsafe(
        `UPDATE cross_connections
         SET quality_score = LEAST(2.0, GREATEST(0.0, quality_score + $1))
         WHERE id = $2`,
        delta,
        connectionId,
      );
    }

    const after = await prisma.crossConnection.findUnique({
      where: { id: connectionId },
      select: { qualityScore: true },
    });

    return NextResponse.json({ ok: true, qualityScore: after?.qualityScore ?? 1.0, userVote: next });
  } catch (err) {
    console.error("cc vote error:", err);
    return NextResponse.json({ error: "Vote failed" }, { status: 500 });
  }
}
