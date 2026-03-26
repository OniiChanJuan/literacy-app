import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isValidStatus, rateLimit } from "@/lib/validation";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ entries: {}, items: {} });
  }

  try {
    const rows = await prisma.libraryEntry.findMany({
      where: { userId: session.user.id },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            type: true,
            genre: true,
            vibes: true,
            year: true,
            cover: true,
            description: true,
            totalEp: true,
            ext: true,
          },
        },
      },
    });

    const entries: Record<number, { status: string; progress: number }> = {};
    const items: Record<number, any> = {};
    for (const r of rows) {
      entries[r.itemId] = { status: r.status, progress: r.progressCurrent };
      if (r.item) {
        items[r.itemId] = {
          id: r.item.id,
          title: r.item.title,
          type: r.item.type,
          genre: r.item.genre || [],
          vibes: r.item.vibes || [],
          year: r.item.year,
          cover: r.item.cover || "",
          desc: r.item.description || "",
          totalEp: r.item.totalEp || 0,
          ext: r.item.ext || {},
          people: [],
          awards: [],
          platforms: [],
        };
      }
    }

    return NextResponse.json({ entries, items });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;

  if (!rateLimit(`library:${userId}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { itemId, status, progress } = body;

  if (!itemId || typeof itemId !== "number") {
    return NextResponse.json({ error: "Valid itemId required" }, { status: 400 });
  }

  // null status = delete entry
  if (status === null) {
    try {
      await prisma.libraryEntry.deleteMany({ where: { userId, itemId } });
      return NextResponse.json({ deleted: true });
    } catch {
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  }

  if (!isValidStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const entry = await prisma.libraryEntry.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: { status, progressCurrent: typeof progress === "number" ? Math.max(0, progress) : 0 },
      create: { userId, itemId, status, progressCurrent: typeof progress === "number" ? Math.max(0, progress) : 0 },
    });

    return NextResponse.json({ itemId: entry.itemId, status: entry.status });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
