import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/follows — get current user's following list
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`follows:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ following: [], followers: [] });
  }

  const follows = await prisma.follow.findMany({
    where: { followerId: claims.sub },
    select: { followedId: true },
  });

  // Fetch profile data via the safe-fields view rather than a base
  // include — keeps the public read surface narrow.
  const profiles = follows.length > 0
    ? await prisma.publicUserProfile.findMany({
        where: { id: { in: follows.map((f) => f.followedId) } },
      })
    : [];

  return NextResponse.json({
    following: profiles.map((p) => ({
      id: p.id,
      name: p.name || "Anonymous",
      avatar: p.image || p.avatar || "",
    })),
  });
}

// POST /api/follows — follow a user
export async function POST(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`follows-post:${claims.sub}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { userId } = await req.json() as { userId: string };
  if (!userId || userId === claims.sub) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  await prisma.follow.upsert({
    where: {
      followerId_followedId: {
        followerId: claims.sub,
        followedId: userId,
      },
    },
    update: {},
    create: { followerId: claims.sub, followedId: userId },
  });

  return NextResponse.json({ followed: true });
}

// DELETE /api/follows — unfollow a user
export async function DELETE(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`follows-delete:${claims.sub}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { userId } = await req.json() as { userId: string };
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  await prisma.follow.deleteMany({
    where: { followerId: claims.sub, followedId: userId },
  });

  return NextResponse.json({ unfollowed: true });
}
