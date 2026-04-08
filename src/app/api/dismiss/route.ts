import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/dismiss — Record a dismissed recommendation
 * Body: { itemId: number }
 */
export async function POST(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ ok: true });
  }

  if (!rateLimit(`dismiss:${claims.sub}`, 120, 60_000)) {
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
    where: { userId_itemId: { userId: claims.sub, itemId } },
    update: {},
    create: { userId: claims.sub, itemId },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
