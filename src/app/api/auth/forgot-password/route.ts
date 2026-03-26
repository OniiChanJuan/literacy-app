import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { isValidEmail, rateLimit } from "@/lib/validation";

/**
 * POST /api/auth/forgot-password
 * Generates a password reset token and logs the reset URL.
 * TODO: Integrate email service (Resend, SendGrid, or Vercel Email) to send the link.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = (body.email as string)?.toLowerCase()?.trim();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  // Rate limit: 3 reset requests per email per hour
  if (!rateLimit(`reset:${email}`, 3, 60 * 60 * 1000)) {
    // Still show the same message to avoid revealing whether the email exists
    return NextResponse.json({
      message: "If an account with that email exists, we've sent a reset link.",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, password: true, authProvider: true },
    });

    // Don't reveal whether the email exists
    if (!user) {
      return NextResponse.json({
        message: "If an account with that email exists, we've sent a reset link.",
      });
    }

    // Don't allow password reset for Google-only accounts
    if (user.authProvider === "oauth.google" && !user.password) {
      console.log(`[Auth] Password reset requested for Google-only account: ${email.slice(0, 3)}***`);
      return NextResponse.json({
        message: "If an account with that email exists, we've sent a reset link.",
      });
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate secure token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // TODO: Send email with reset link using Resend/SendGrid/Vercel Email
    const baseUrl = process.env.NEXTAUTH_URL || "https://literacy-app.vercel.app";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    console.log(`\n[Auth] Password reset link for ${email.slice(0, 3)}***:`);
    console.log(`[Auth] Reset link: ${resetUrl}\n`);

    return NextResponse.json({
      message: "If an account with that email exists, we've sent a reset link.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({
      message: "If an account with that email exists, we've sent a reset link.",
    });
  }
}
