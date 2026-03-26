import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/auth/check-verification
 * Returns whether the current user needs email verification.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ needsVerification: false });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true, authProvider: true },
    });

    if (!user) {
      return NextResponse.json({ needsVerification: false });
    }

    // Google OAuth users are auto-verified
    if (user.authProvider === "oauth.google") {
      return NextResponse.json({ needsVerification: false });
    }

    // Credentials users need to verify
    const needsVerification = !user.emailVerified;
    return NextResponse.json({ needsVerification });
  } catch {
    return NextResponse.json({ needsVerification: false });
  }
}
