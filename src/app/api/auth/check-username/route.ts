import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`check-username:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const username = req.nextUrl.searchParams.get("username")?.toLowerCase().trim();

  if (!username) {
    return NextResponse.json({ available: false, error: "Username required" });
  }

  if (!USERNAME_REGEX.test(username)) {
    return NextResponse.json({
      available: false,
      error: "3-20 characters, letters, numbers, underscores, hyphens only",
    });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    return NextResponse.json({ available: !existing });
  } catch {
    return NextResponse.json({ available: false, error: "Check failed" });
  }
}
