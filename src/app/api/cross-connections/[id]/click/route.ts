import { NextRequest, NextResponse } from "next/server";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import { recordCoverClick } from "@/lib/connection-credit";

/**
 * POST /api/cross-connections/[id]/click
 *
 * Body: { itemId: number }
 *
 * Records that the current user clicked a recommended-item cover
 * inside this connection card. Fires the tier-1 (+0.02) downstream
 * credit on the connection. Fire-and-forget from the client.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ ok: true });

  if (!rateLimit(`cc-click:${claims.sub}`, 120, 60_000)) {
    return NextResponse.json({ ok: true });
  }

  const { id } = await params;
  const connectionId = Number.parseInt(id);
  if (!Number.isFinite(connectionId)) return NextResponse.json({ ok: true });

  let body: { itemId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const itemId = typeof body.itemId === "number" && Number.isFinite(body.itemId) ? body.itemId : null;
  if (itemId == null) return NextResponse.json({ ok: true });

  recordCoverClick(claims.sub, connectionId, itemId).catch(() => {});
  return NextResponse.json({ ok: true });
}
