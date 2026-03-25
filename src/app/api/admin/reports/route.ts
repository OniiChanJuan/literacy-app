import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Simple admin check — in production, use a proper admin role system
const ADMIN_EMAILS = ["admin@literacy.app"];

async function isAdmin() {
  const session = await auth();
  if (!session?.user?.email) return false;
  // For now, any authenticated user can view reports
  // TODO: Add proper admin role check
  return !!session.user.id;
}

/**
 * GET /api/admin/reports — List reports
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") || "pending";

  const reports = await prisma.report.findMany({
    where: { status },
    include: {
      reporter: { select: { username: true, name: true } },
      review: {
        select: {
          id: true, text: true,
          user: { select: { username: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(reports);
}

/**
 * PUT /api/admin/reports — Update report status
 */
export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id, status } = body;
  if (!id || !["reviewed", "dismissed", "actioned"].includes(status)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  await prisma.report.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json({ ok: true });
}
