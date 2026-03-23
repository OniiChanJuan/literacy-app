import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEMO_USER_ID } from "@/lib/constants";

// PATCH /api/library/progress — update progress for a library entry
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { itemId, progress } = body as { itemId: number; progress: number };

  if (!itemId || typeof progress !== "number") {
    return NextResponse.json({ error: "itemId and progress required" }, { status: 400 });
  }

  try {
    const entry = await prisma.libraryEntry.update({
      where: { userId_itemId: { userId: DEMO_USER_ID, itemId } },
      data: { progressCurrent: Math.max(0, progress) },
    });
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
}
