import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
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
  const claims = await getClaims();
  const counts = await getCounts(id);

  let following = false;
  if (claims?.sub) {
    const f = await prisma.follow.findUnique({
      where: { followerId_followedId: { followerId: claims.sub, followedId: id } },
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
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  if (id === claims.sub) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });

  if (!rateLimit(`follow-post:${claims.sub}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  await prisma.follow.upsert({
    where: { followerId_followedId: { followerId: claims.sub, followedId: id } },
    update: {},
    create: { followerId: claims.sub, followedId: id },
  });

  const counts = await getCounts(id);
  return NextResponse.json({ following: true, ...counts });
}

// DELETE /api/users/[id]/follow — unfollow a user
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!rateLimit(`follow-delete:${claims.sub}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const { id } = await params;

  await prisma.follow.deleteMany({
    where: { followerId: claims.sub, followedId: id },
  });

  const counts = await getCounts(id);
  return NextResponse.json({ following: false, ...counts });
}
