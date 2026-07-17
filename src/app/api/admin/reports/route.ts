import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";
import { isAdmin } from "@/lib/admin";

/**
 * GET /api/admin/reports — List reports
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`admin-reports:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

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
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`admin-reports-put:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

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
