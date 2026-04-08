import { NextRequest, NextResponse } from "next/server";
import { getClaims } from "@/lib/supabase/auth";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { sanitize, rateLimit } from "@/lib/validation";

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

/** GET /api/settings — get current user's profile + settings */
export async function GET() {
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true, email: true, username: true, name: true, image: true,
        bio: true, avatar: true, authProvider: true, isPrivate: true,
        memberNumber: true, createdAt: true,
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Get or create settings
    let settings = await prisma.userSettings.findUnique({ where: { userId: claims.sub } });
    if (!settings) {
      settings = await prisma.userSettings.create({ data: { userId: claims.sub } });
    }

    // Look up identities (OAuth providers + email/password) from
    // Supabase Auth. The user's `app_metadata.providers` array tells
    // us which sign-in methods are linked.
    let connectedProviders: string[] = [];
    let hasPassword = false;
    try {
      const supabase = await createServerSupabase();
      const { data: { user: au } } = await supabase.auth.getUser();
      const providers = (au?.app_metadata?.providers as string[] | undefined) || [];
      connectedProviders = providers.filter((p) => p !== "email");
      hasPassword = providers.includes("email");
    } catch { /* non-fatal */ }

    return NextResponse.json({
      user: { ...user, hasPassword },
      settings,
      connectedProviders,
    });
  } catch (error) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** PUT /api/settings — update profile and/or settings */
export async function PUT(req: NextRequest) {
  const claims = await getClaims();
  if (!claims?.sub) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!rateLimit(`settings:${claims.sub}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many changes. Try again in a minute." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const updates: any = {};
  const settingsUpdates: any = {};

  // Profile fields
  if (body.name !== undefined) {
    const clean = sanitize(body.name).trim();
    if (clean.length > 50) return NextResponse.json({ error: "Display name max 50 characters" }, { status: 400 });
    updates.name = clean;
  }

  if (body.username !== undefined) {
    const clean = sanitize(body.username).toLowerCase().trim();
    if (!USERNAME_REGEX.test(clean)) {
      return NextResponse.json({ error: "Username: 3-20 chars, letters/numbers/underscores/hyphens" }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { username: clean } });
    if (existing && existing.id !== claims.sub) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    updates.username = clean;
  }

  if (body.bio !== undefined) {
    const clean = sanitize(body.bio).trim();
    if (clean.length > 250) return NextResponse.json({ error: "Bio max 250 characters" }, { status: 400 });
    updates.bio = clean;
  }

  if (body.email !== undefined) {
    const clean = body.email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email: clean } });
    if (existing && existing.id !== claims.sub) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    updates.email = clean;
  }

  if (body.isPrivate !== undefined) updates.isPrivate = !!body.isPrivate;

  // Settings fields
  const boolFields = [
    "showRatingsPublicly", "showLibraryPublicly", "showActivityPublicly",
    "showMatureContent", "emailNewFollower", "emailReviewLiked",
    "emailFranchiseRelease", "emailWeeklyDigest",
  ];
  for (const f of boolFields) {
    if (body[f] !== undefined) settingsUpdates[f] = !!body[f];
  }
  if (body.theme !== undefined && ["dark", "light"].includes(body.theme)) {
    settingsUpdates.theme = body.theme;
  }
  if (body.defaultMediaType !== undefined) {
    settingsUpdates.defaultMediaType = sanitize(body.defaultMediaType);
  }
  if (body.favoriteMediaTypes !== undefined && Array.isArray(body.favoriteMediaTypes)) {
    settingsUpdates.favoriteMediaTypes = body.favoriteMediaTypes.slice(0, 3);
  }

  try {
    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: claims.sub }, data: updates });
    }
    if (Object.keys(settingsUpdates).length > 0) {
      await prisma.userSettings.upsert({
        where: { userId: claims.sub },
        update: settingsUpdates,
        create: { userId: claims.sub, ...settingsUpdates },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
