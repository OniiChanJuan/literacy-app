import { NextRequest, NextResponse } from "next/server";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";
import { recordImpressions } from "@/lib/connection-credit";

/**
 * POST /api/cross-connections/impressions
 *
 * Body: { connectionIds: number[] }
 *
 * Records that the current user just saw these connection cards on
 * Cross your shelf. Used as the attribution anchor for downstream
 * signals (library-add, rating, etc.) within the next 14–30 days.
 *
 * Fire-and-forget from the client: returns 200 quickly, runs the
 * insert asynchronously. Auth-only (anon visits don't generate
 * attributable signals — we couldn't tie them to anything).
 */
export async function POST(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ ok: true }); // silently ignore for anon

  if (!rateLimit(`cc-impressions:${claims.sub}`, 60, 60_000)) {
    return NextResponse.json({ ok: true }); // soft rate-limit (don't error noisily)
  }

  let body: { connectionIds?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const ids = Array.isArray(body.connectionIds)
    ? body.connectionIds.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : [];
  if (ids.length === 0) return NextResponse.json({ ok: true });

  // Hard cap — a page should never emit more than this in one batch.
  const capped = ids.slice(0, 20);

  // Fire-and-forget — the client doesn't await this.
  recordImpressions(claims.sub, capped).catch(() => {});

  return NextResponse.json({ ok: true, count: capped.length });
}
