import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/library — fetch all library entries for authenticated user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ entries: {} });
  }

  const rows = await prisma.libraryEntry.findMany({
    where: { userId: session.user.id },
  });

  const entries: Record<number, { status: string; progress: number }> = {};
  for (const r of rows) {
    entries[r.itemId] = { status: r.status, progress: r.progressCurrent };
  }

  return NextResponse.json({ entries });
}

// PUT /api/library — upsert or delete a library entry
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;
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
    await prisma.libraryEntry.deleteMany({
      where: { userId, itemId },
    });
    return NextResponse.json({ deleted: true });
  }

  const entry = await prisma.libraryEntry.upsert({
    where: { userId_itemId: { userId, itemId } },
    update: { status, progressCurrent: progress ?? 0 },
    create: { userId, itemId, status, progressCurrent: progress ?? 0 },
  });

  return NextResponse.json(entry);
}
