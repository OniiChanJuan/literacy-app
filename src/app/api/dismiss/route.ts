import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/dismiss — Record a dismissed recommendation
 * Body: { itemId: number }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: true });
  }

  if (!rateLimit(`dismiss:${session.user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const { itemId } = body;
  if (!itemId || typeof itemId !== "number") return NextResponse.json({ ok: true });

  // Upsert to avoid errors on duplicate dismiss
  await prisma.dismissedItem.upsert({
    where: { userId_itemId: { userId: session.user.id, itemId } },
    update: {},
    create: { userId: session.user.id, itemId },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
