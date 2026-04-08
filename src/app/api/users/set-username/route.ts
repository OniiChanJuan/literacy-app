import { NextRequest, NextResponse } from "next/server";
import { getClaims } from "@/lib/supabase/auth";
import { prisma } from "@/lib/prisma";
import { sanitize, rateLimit } from "@/lib/validation";

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

export async function POST(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`set-username:${claims.sub}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = sanitize(body.username || "").toLowerCase().trim();

  if (!username || !USERNAME_REGEX.test(username)) {
    return NextResponse.json({ error: "Invalid username format" }, { status: 400 });
  }

  try {
    // Check uniqueness
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== claims.sub) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: claims.sub },
      data: {
        username,
        termsAcceptedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Set username error");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
