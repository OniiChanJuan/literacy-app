import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/auth/reset-password
 * Validates the reset token and updates the user's password.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`reset-password:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { token, password } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Invalid or missing reset token" }, { status: 400 });
  }

  // Validate password strength
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (password.length > 128) {
    return NextResponse.json({ error: "Password is too long" }, { status: 400 });
  }
  if (!/[A-Z]/.test(password)) {
    return NextResponse.json({ error: "Password must contain at least one uppercase letter" }, { status: 400 });
  }
  if (!/[a-z]/.test(password)) {
    return NextResponse.json({ error: "Password must contain at least one lowercase letter" }, { status: 400 });
  }
  if (!/[0-9]/.test(password)) {
    return NextResponse.json({ error: "Password must contain at least one number" }, { status: 400 });
  }

  try {
    // Find and validate the token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!resetToken) {
      return NextResponse.json({ error: "Invalid or expired reset link. Please request a new one." }, { status: 400 });
    }

    if (resetToken.used) {
      return NextResponse.json({ error: "This reset link has already been used. Please request a new one." }, { status: 400 });
    }

    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password and mark token as used in a transaction
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    console.log(`[Auth] Password reset successful for user ${resetToken.user.email?.slice(0, 3)}***`);

    return NextResponse.json({ message: "Password has been reset successfully. You can now sign in." });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
