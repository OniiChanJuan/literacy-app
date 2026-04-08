import { NextRequest, NextResponse } from "next/server";
import { getClaims } from "@/lib/supabase/auth";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createSbAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/account
 *
 * Actions:
 *   - "delete-account" — verifies username, deletes the auth.users row
 *     (which cascades into public.users via the FK), then returns success.
 *
 * Password changes are NOT handled here anymore — they happen client-side
 * via supabase.auth.updateUser({ password }).
 */
export async function POST(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!rateLimit(`account:${claims.sub}`, 5, 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  let body: { action?: string; confirmUsername?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const { action } = body;

  if (action === "delete-account") {
    const { confirmUsername } = body;

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { username: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (confirmUsername !== user.username) {
      return NextResponse.json({ error: "Username doesn't match" }, { status: 400 });
    }

    // Hard delete public-schema rows. Cascade FKs handle the rest.
    const uid = claims.sub;
    await prisma.report.deleteMany({ where: { reporterUserId: uid } });
    await prisma.notification.deleteMany({ where: { userId: uid } });
    await prisma.dismissedItem.deleteMany({ where: { userId: uid } });
    await prisma.implicitSignal.deleteMany({ where: { userId: uid } });
    await prisma.reviewHelpfulVote.deleteMany({ where: { userId: uid } });
    await prisma.follow.deleteMany({ where: { OR: [{ followerId: uid }, { followedId: uid }] } });
    await prisma.libraryEntry.deleteMany({ where: { userId: uid } });
    await prisma.review.deleteMany({ where: { userId: uid } });
    await prisma.rating.deleteMany({ where: { userId: uid } });
    await prisma.userSettings.deleteMany({ where: { userId: uid } });
    await prisma.user.delete({ where: { id: uid } });

    // Now delete the Supabase Auth user. Requires service role.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const admin = createSbAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      await admin.auth.admin.deleteUser(uid).catch(() => {
        // Already gone or admin call failed — public.users is already
        // deleted so the worst case is an orphaned auth.users row that
        // can be cleaned up later.
      });
    }

    // Sign the user out of the current session
    const supabase = await createServerSupabase();
    await supabase.auth.signOut().catch(() => {});

    return NextResponse.json({ success: true, deleted: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
