import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

async function getCounts(userId: string) {
  const [followerCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followedId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);
  return { followerCount, followingCount };
}

// GET /api/users/[id]/follow — check follow status + counts
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const counts = await getCounts(id);

  let following = false;
  if (session?.user?.id) {
    const f = await prisma.follow.findUnique({
      where: { followerId_followedId: { followerId: session.user.id, followedId: id } },
    });
    following = !!f;
  }

  return NextResponse.json({ following, ...counts });
}

// POST /api/users/[id]/follow — follow a user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  if (id === session.user.id) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });

  if (!rateLimit(`follow-post:${session.user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  await prisma.follow.upsert({
    where: { followerId_followedId: { followerId: session.user.id, followedId: id } },
    update: {},
    create: { followerId: session.user.id, followedId: id },
  });

  const counts = await getCounts(id);
  return NextResponse.json({ following: true, ...counts });
}

// DELETE /api/users/[id]/follow — unfollow a user
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!rateLimit(`follow-delete:${session.user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { id } = await params;

  await prisma.follow.deleteMany({
    where: { followerId: session.user.id, followedId: id },
  });

  const counts = await getCounts(id);
  return NextResponse.json({ following: false, ...counts });
}
