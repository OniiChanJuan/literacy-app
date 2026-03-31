import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

// GET /api/franchises/:franchiseId/follow — check if current user follows this franchise
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ franchiseId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ following: false });
  }

  const { franchiseId } = await params;
  const id = parseInt(franchiseId);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid franchise ID" }, { status: 400 });

  const row = await prisma.franchiseFollow.findUnique({
    where: { userId_franchiseId: { userId: session.user.id, franchiseId: id } },
    select: { franchiseId: true },
  });

  const followerCount = await prisma.franchiseFollow.count({ where: { franchiseId: id } });

  return NextResponse.json({ following: !!row, followerCount });
}

// POST /api/franchises/:franchiseId/follow — toggle follow/unfollow
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ franchiseId: string }> },
) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`franchise-follow:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { franchiseId } = await params;
  const id = parseInt(franchiseId);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid franchise ID" }, { status: 400 });

  // Check franchise exists
  const franchise = await prisma.franchise.findUnique({ where: { id }, select: { id: true } });
  if (!franchise) return NextResponse.json({ error: "Franchise not found" }, { status: 404 });

  const existing = await prisma.franchiseFollow.findUnique({
    where: { userId_franchiseId: { userId: session.user.id, franchiseId: id } },
  });

  if (existing) {
    await prisma.franchiseFollow.delete({
      where: { userId_franchiseId: { userId: session.user.id, franchiseId: id } },
    });
  } else {
    await prisma.franchiseFollow.create({
      data: { userId: session.user.id, franchiseId: id },
    });
  }

  const followerCount = await prisma.franchiseFollow.count({ where: { franchiseId: id } });
  return NextResponse.json({ following: !existing, followerCount });
}
