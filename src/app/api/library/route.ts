import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEMO_USER_ID } from "@/lib/constants";

// GET /api/library — fetch all library entries for demo user
export async function GET() {
  const rows = await prisma.libraryEntry.findMany({
    where: { userId: DEMO_USER_ID },
  });

  const entries: Record<number, { status: string; progress: number }> = {};
  for (const r of rows) {
    entries[r.itemId] = { status: r.status, progress: r.progressCurrent };
  }

  return NextResponse.json({ entries });
}

// PUT /api/library — upsert or delete a library entry
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { itemId, status, progress } = body as {
    itemId: number;
    status: string | null;
    progress?: number;
  };

  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  if (status === null) {
    // Remove from library
    await prisma.libraryEntry.deleteMany({
      where: { userId: DEMO_USER_ID, itemId },
    });
    return NextResponse.json({ deleted: true });
  }

  const entry = await prisma.libraryEntry.upsert({
    where: { userId_itemId: { userId: DEMO_USER_ID, itemId } },
    update: { status, progressCurrent: progress ?? 0 },
    create: {
      userId: DEMO_USER_ID,
      itemId,
      status,
      progressCurrent: progress ?? 0,
    },
  });

  return NextResponse.json(entry);
}
