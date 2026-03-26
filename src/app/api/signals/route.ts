import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

const VALID_SIGNAL_TYPES = ["page_view", "want_to_add", "franchise_view", "genre_filter", "dismiss"];

/**
 * POST /api/signals — Fire-and-forget implicit signal tracking
 * Body: { itemId: number, signalType: string, value?: number }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: true }); // Silently ignore for unauthenticated users
  }

  if (!rateLimit(`signals:${session.user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const { itemId, signalType, value } = body;

  if (!itemId || typeof itemId !== "number") return NextResponse.json({ ok: true });
  if (!signalType || !VALID_SIGNAL_TYPES.includes(signalType)) return NextResponse.json({ ok: true });

  // Fire and forget — don't block response on DB write
  prisma.implicitSignal.create({
    data: {
      userId: session.user.id,
      itemId,
      signalType,
      value: typeof value === "number" ? value : 1,
    },
  }).catch(() => {}); // Silently ignore errors

  return NextResponse.json({ ok: true });
}
