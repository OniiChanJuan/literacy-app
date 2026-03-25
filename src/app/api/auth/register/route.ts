import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sanitize, isValidEmail, validateName, rateLimit, getClientIp } from "@/lib/validation";

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

export async function POST(req: NextRequest) {
  // Rate limit: 3 signups per IP per hour
  const ip = getClientIp(req);
  if (!rateLimit(`signup:${ip}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many signup attempts. Try again later." },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { name, username, email, password, honeypot, agreedToTerms, confirmedAge } = body;

  // Honeypot check
  if (honeypot) {
    return NextResponse.json({ id: "ok", email, name }, { status: 201 });
  }

  if (!confirmedAge) {
    return NextResponse.json({ error: "You must confirm you are at least 13 years old" }, { status: 400 });
  }

  if (!agreedToTerms) {
    return NextResponse.json({ error: "You must agree to the Terms of Service and Privacy Policy" }, { status: 400 });
  }

  // Validate username
  const cleanUsername = sanitize(username || "").toLowerCase().trim();
  if (!cleanUsername || !USERNAME_REGEX.test(cleanUsername)) {
    return NextResponse.json({ error: "Username must be 3-20 characters: letters, numbers, underscores, hyphens" }, { status: 400 });
  }

  // Validate name
  const nameResult = validateName(name || "");
  if (!nameResult.valid) {
    return NextResponse.json({ error: nameResult.error }, { status: 400 });
  }

  // Validate email
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  // Validate password strength
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (password.length > 128) {
    return NextResponse.json({ error: "Password is too long" }, { status: 400 });
  }
  if (!/[A-Z]/.test(password)) {
    return NextResponse.json({ error: "Password must contain at least one uppercase letter" }, { status: 400 });
  }
  if (!/[a-z]/.test(password)) {
    return NextResponse.json({ error: "Password must contain at least one lowercase letter" }, { status: 400 });
  }
  if (!/[0-9]/.test(password)) {
    return NextResponse.json({ error: "Password must contain at least one number" }, { status: 400 });
  }

  try {
    // Check email uniqueness
    const existingEmail = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existingEmail) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    // Check username uniqueness
    const existingUsername = await prisma.user.findUnique({ where: { username: cleanUsername } });
    if (existingUsername) {
      return NextResponse.json({ error: "This username is already taken" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Assign next member number atomically
    const maxResult = await prisma.user.aggregate({ _max: { memberNumber: true } });
    const nextMemberNumber = (maxResult._max.memberNumber || 0) + 1;

    const user = await prisma.user.create({
      data: {
        name: nameResult.value,
        username: cleanUsername,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        authProvider: "credentials",
        termsAcceptedAt: new Date(),
        memberNumber: nextMemberNumber,
      },
    });

    return NextResponse.json({ id: user.id, name: user.name }, { status: 201 });
  } catch (error) {
    console.error("Registration error for user:", email?.slice(0, 3) + "***");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
