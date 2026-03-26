import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/verify-email
 * Validates the email verification token and marks the user's email as verified.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { token } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Invalid or missing verification token" }, { status: 400 });
  }

  try {
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, email: true, emailVerified: true } } },
    });

    if (!verificationToken) {
      return NextResponse.json({ error: "Invalid verification link." }, { status: 400 });
    }

    if (verificationToken.used) {
      // Already verified — not an error, just redirect them
      return NextResponse.json({ message: "Email already verified.", alreadyVerified: true });
    }

    if (new Date() > verificationToken.expiresAt) {
      return NextResponse.json({ error: "This verification link has expired. Please request a new one." }, { status: 400 });
    }

    // Mark email as verified and token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerified: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { used: true },
      }),
    ]);

    console.log(`[Auth] Email verified for ${verificationToken.user.email?.slice(0, 3)}***`);

    return NextResponse.json({ message: "Email verified successfully!" });
  } catch (error) {
    console.error("Verify email error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
