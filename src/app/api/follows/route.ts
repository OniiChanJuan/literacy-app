import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/follows — get current user's following list
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`follows:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ following: [], followers: [] });
  }

  const following = await prisma.follow.findMany({
    where: { followerId: session.user.id },
    include: {
      followed: {
        select: { id: true, name: true, image: true, avatar: true },
      },
    },
  });

  return NextResponse.json({
    following: following.map((f) => ({
      id: f.followed.id,
      name: f.followed.name || "Anonymous",
      avatar: f.followed.image || f.followed.avatar || "",
    })),
  });
}

// POST /api/follows — follow a user
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`follows-post:${session.user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { userId } = await req.json() as { userId: string };
  if (!userId || userId === session.user.id) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  await prisma.follow.upsert({
    where: {
      followerId_followedId: {
        followerId: session.user.id,
        followedId: userId,
      },
    },
    update: {},
    create: { followerId: session.user.id, followedId: userId },
  });

  return NextResponse.json({ followed: true });
}

// DELETE /api/follows — unfollow a user
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`follows-delete:${session.user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { userId } = await req.json() as { userId: string };
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  await prisma.follow.deleteMany({
    where: { followerId: session.user.id, followedId: userId },
  });

  return NextResponse.json({ unfollowed: true });
}
