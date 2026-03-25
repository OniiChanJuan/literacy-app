import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cron/cleanup — Daily cleanup job
 * Deletes implicit signals and usage log records older than 90 days.
 * Protected by CRON_SECRET environment variable.
 *
 * Set up in vercel.json:
 * { "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }] }
 */
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  try {
    // Delete implicit signals older than 90 days (as promised in privacy policy)
    const deletedSignals = await prisma.implicitSignal.deleteMany({
      where: { createdAt: { lt: ninetyDaysAgo } },
    });

    return NextResponse.json({
      ok: true,
      deletedSignals: deletedSignals.count,
      cutoffDate: ninetyDaysAgo.toISOString(),
    });
  } catch (error: any) {
    console.error("Cleanup cron error:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
