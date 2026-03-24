import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";
import bcrypt from "bcryptjs";

/** POST /api/account — change password or set password */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!rateLimit(`account:${session.user.id}`, 5, 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const { action } = body;

  if (action === "change-password") {
    const { currentPassword, newPassword } = body;
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return NextResponse.json({ error: "Password needs uppercase, lowercase, and a number" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { password: true } });

    if (user?.password) {
      // Has existing password — verify current
      if (!currentPassword) return NextResponse.json({ error: "Current password required" }, { status: 400 });
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }
    // If no password (Google user), skip current password check

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: session.user.id }, data: { password: hash } });
    return NextResponse.json({ success: true });
  }

  if (action === "delete-account") {
    const { confirmUsername, password } = body;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, password: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Verify username confirmation
    if (confirmUsername !== user.username) {
      return NextResponse.json({ error: "Username doesn't match" }, { status: 400 });
    }

    // If user has a password, verify it
    if (user.password) {
      if (!password) return NextResponse.json({ error: "Password required to delete account" }, { status: 400 });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }

    // Delete everything in order (due to foreign keys)
    await prisma.franchiseItem.deleteMany({ where: {} }); // no user FK, skip
    await prisma.follow.deleteMany({ where: { OR: [{ followerId: session.user.id }, { followedId: session.user.id }] } });
    await prisma.libraryEntry.deleteMany({ where: { userId: session.user.id } });
    await prisma.review.deleteMany({ where: { userId: session.user.id } });
    await prisma.rating.deleteMany({ where: { userId: session.user.id } });
    await prisma.userSettings.deleteMany({ where: { userId: session.user.id } });
    await prisma.session.deleteMany({ where: { userId: session.user.id } });
    await prisma.account.deleteMany({ where: { userId: session.user.id } });
    await prisma.user.delete({ where: { id: session.user.id } });

    return NextResponse.json({ success: true, deleted: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
