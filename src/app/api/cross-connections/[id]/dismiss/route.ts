import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import { SCORE_DELTAS } from "@/lib/connection-score";

/**
 * POST /api/cross-connections/[id]/dismiss
 *
 * Records a dismissal of this connection by the current user, hides it
 * from their future Cross your shelf renders, and applies a one-time
 * SCORE_DELTAS.dismissConnection (−0.15, clamped at 0.0) to the
 * connection's quality_score.
 *
 * Idempotent — re-dismissing the same connection is a no-op (the PK on
 * connection_dismissals prevents the insert; the score delta only
 * applies on the first successful insert).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!rateLimit(`cc-dismiss:${claims.sub}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many dismissals" }, { status: 429 });
  }

  const { id } = await params;
  const connectionId = Number.parseInt(id);
  if (!Number.isFinite(connectionId)) {
    return NextResponse.json({ error: "Invalid connection id" }, { status: 400 });
  }

  try {
    // Try the insert. On unique-violation (already dismissed) we treat
    // as a no-op and don't apply the delta again.
    let wasFresh = false;
    try {
      await prisma.connectionDismissal.create({
        data: { userId: claims.sub, connectionId },
      });
      wasFresh = true;
    } catch (e: any) {
      // P2002 = unique constraint violation in Prisma
      if (e?.code !== "P2002") throw e;
    }

    if (wasFresh) {
      // Clamp to [0.0, 2.0] in SQL.
      await prisma.$executeRawUnsafe(
        `UPDATE cross_connections
         SET quality_score = LEAST(2.0, GREATEST(0.0, quality_score + $1))
         WHERE id = $2`,
        SCORE_DELTAS.dismissConnection,
        connectionId,
      );
    }

    return NextResponse.json({ ok: true, dismissed: true, fresh: wasFresh });
  } catch (err) {
    console.error("cc dismiss error:", err);
    return NextResponse.json({ error: "Dismiss failed" }, { status: 500 });
  }
}
