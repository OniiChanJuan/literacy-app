import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/auth/resend-verification
 * Resends the email verification link for the currently logged-in user.
 * TODO: Integrate email service (Resend, SendGrid, or Vercel Email) to send the link.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Rate limit: 3 resends per user per hour
  if (!rateLimit(`resend-verify:${session.user.id}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, emailVerified: true, authProvider: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ message: "Email is already verified." });
    }

    // Invalidate existing unused verification tokens
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate new token (24 hours)
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.emailVerificationToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // TODO: Send email with verification link using Resend/SendGrid/Vercel Email
    const baseUrl = process.env.NEXTAUTH_URL || "https://literacy-app.vercel.app";
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
    console.log(`\n[Auth] Email verification link for ${user.email?.slice(0, 3)}***:`);
    console.log(`[Auth] Verify link: ${verifyUrl}\n`);

    return NextResponse.json({ message: "Verification email sent. Check your inbox." });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
