import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/validation";

// PATCH /api/library/progress — update progress for a library entry
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!rateLimit(`library-progress:${session.user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const userId = session.user.id;
  const body = await req.json();
  const { itemId, progress } = body as { itemId: number; progress: number };

  if (!itemId || typeof progress !== "number") {
    return NextResponse.json({ error: "itemId and progress required" }, { status: 400 });
  }

  try {
    const entry = await prisma.libraryEntry.update({
      where: { userId_itemId: { userId, itemId } },
      data: { progressCurrent: Math.max(0, progress) },
    });
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
}
