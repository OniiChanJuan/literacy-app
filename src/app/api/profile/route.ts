import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/profile — get own profile
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, email: true, bio: true, avatar: true, image: true,
      isPrivate: true, createdAt: true,
      _count: { select: { ratings: true, reviews: true, libraryEntries: true } },
    },
  });

  return NextResponse.json(user);
}

// PATCH /api/profile — update own profile (name, bio, isPrivate)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { name, bio, isPrivate } = body as {
    name?: string;
    bio?: string;
    isPrivate?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (bio !== undefined) data.bio = bio;
  if (isPrivate !== undefined) data.isPrivate = isPrivate;

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, name: true, bio: true, isPrivate: true },
  });

  return NextResponse.json(user);
}
