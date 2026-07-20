import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cron/cleanup — Daily cleanup + housekeeping job
 *
 * Tasks:
 *   1. Delete implicit_signals older than 90 days (privacy policy).
 *   2. Prune connection_events older than 30 days. Both attribution
 *      windows are <= 30d, so anything older carries no value.
 *   3. Decay cross_connections.quality_score 5% toward 1.0 per night.
 *      A connection at 1.50 drifts to 1.475 overnight, 1.0 after
 *      ~135 nights of no activity. Floors a stale 0.30 the same way.
 *
 * Protected by CRON_SECRET environment variable. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is
 * set in the project env, so CRON_SECRET MUST be configured in Vercel
 * (Production) for the nightly job to authenticate.
 *
 * vercel.json: { "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }] }
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Fail CLOSED. A missing secret must never mean "no auth required" — if
  // CRON_SECRET is unset we reject everyone (the job simply won't run until
  // it's configured), and when set we require an exact bearer match. This
  // route does destructive deletes + a corpus decay, so an unauthenticated
  // caller must never reach the body.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    // 1. implicit_signals — 90 day retention
    const deletedSignals = await prisma.implicitSignal.deleteMany({
      where: { createdAt: { lt: ninetyDaysAgo } },
    });

    // 2. connection_events — 30 day retention (longest attribution
    //    window). Older rows can no longer trigger any credit.
    const deletedEvents = await prisma.connectionEvent.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });

    // 3. quality_score decay — 5% toward 1.0 per night. Skip if a
    //    connection's score is already exactly 1.0.
    const decayed = await prisma.$executeRawUnsafe(
      `UPDATE cross_connections
       SET quality_score = quality_score + (1.0 - quality_score) * 0.05
       WHERE ABS(quality_score - 1.0) > 1e-6`
    );

    return NextResponse.json({
      ok: true,
      deletedSignals: deletedSignals.count,
      deletedEvents: deletedEvents.count,
      decayedConnections: decayed,
      signalCutoff: ninetyDaysAgo.toISOString(),
      eventCutoff: thirtyDaysAgo.toISOString(),
    });
  } catch (error: any) {
    console.error("Cleanup cron error:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
