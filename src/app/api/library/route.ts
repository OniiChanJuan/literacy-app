import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { isValidStatus, rateLimit } from "@/lib/validation";
import { creditDownstream } from "@/lib/connection-credit";

const COMPLETED_STATUSES = new Set(["completed", "caught_up"]);

export async function GET() {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ entries: {}, items: {} });
  }

  try {
    const rows = await prisma.libraryEntry.findMany({
      where: { userId: claims.sub },
      select: {
        itemId: true,
        status: true,
        progressCurrent: true,
        createdAt: true,
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

    const entries: Record<number, { status: string; progress: number; createdAt: string }> = {};
    const items: Record<number, any> = {};
    for (const r of rows) {
      entries[r.itemId] = { status: r.status, progress: r.progressCurrent, createdAt: r.createdAt.toISOString() };
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
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = claims.sub;

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
      const before = await prisma.libraryEntry.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      await prisma.libraryEntry.deleteMany({ where: { userId, itemId } });
      // Reversal credit if the entry existed.
      if (before) {
        creditDownstream({ userId, itemId, signal: { kind: "library_deleted" } }).catch(() => {});
      }
      return NextResponse.json({ deleted: true });
    } catch {
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  }

  if (!isValidStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const prevEntry = await prisma.libraryEntry.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    const entry = await prisma.libraryEntry.upsert({
      where: { userId_itemId: { userId, itemId } },
      update: { status, progressCurrent: typeof progress === "number" ? Math.max(0, progress) : 0 },
      create: { userId, itemId, status, progressCurrent: typeof progress === "number" ? Math.max(0, progress) : 0 },
    });

    // Downstream credits — fire the highest applicable signal.
    // tier-3 (completed/caught_up) supersedes tier-2 (library_add) via
    // the credit ladder, so we can fire library_add unconditionally on
    // first-create and library_completed if the new status hits the set.
    if (!prevEntry) {
      creditDownstream({ userId, itemId, signal: { kind: "library_add" } }).catch(() => {});
    }
    if (COMPLETED_STATUSES.has(status) && (!prevEntry || !COMPLETED_STATUSES.has(prevEntry.status))) {
      creditDownstream({ userId, itemId, signal: { kind: "library_completed" } }).catch(() => {});
    }

    return NextResponse.json({ itemId: entry.itemId, status: entry.status });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
