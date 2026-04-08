import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaims } from "@/lib/supabase/auth";
import { validateName, validateBio, rateLimit } from "@/lib/validation";

export async function GET() {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true, name: true, email: true, bio: true, avatar: true, image: true,
        isPrivate: true, createdAt: true,
        _count: { select: { ratings: true, reviews: true, libraryEntries: true } },
      },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Rate limit profile updates
  if (!rateLimit(`profile:${claims.sub}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { name, bio, isPrivate } = body;
  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    const nameResult = validateName(name);
    if (!nameResult.valid) return NextResponse.json({ error: nameResult.error }, { status: 400 });
    data.name = nameResult.value;
  }

  if (bio !== undefined) {
    const bioResult = validateBio(bio);
    if (!bioResult.valid) return NextResponse.json({ error: bioResult.error }, { status: 400 });
    data.bio = bioResult.value;
  }

  if (isPrivate !== undefined) {
    if (typeof isPrivate !== "boolean") return NextResponse.json({ error: "Invalid privacy setting" }, { status: 400 });
    data.isPrivate = isPrivate;
  }

  try {
    const user = await prisma.user.update({
      where: { id: claims.sub },
      data,
      select: { id: true, name: true, bio: true, isPrivate: true },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** DELETE /api/profile — delete account and all data */
export async function DELETE() {
  const claims = await getClaims();
  if (!claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    // Cascade deletes handle ratings, reviews, library entries, follows, sessions, accounts
    await prisma.user.delete({ where: { id: claims.sub } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
