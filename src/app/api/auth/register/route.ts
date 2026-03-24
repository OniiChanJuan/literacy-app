import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sanitize, isValidEmail, validateName, rateLimit, getClientIp } from "@/lib/validation";

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

  const { name, email, password, honeypot, agreedToTerms } = body;

  // Honeypot check — bots fill hidden fields
  if (honeypot) {
    // Silently reject but return success to not tip off bots
    return NextResponse.json({ id: "ok", email, name }, { status: 201 });
  }

  // Terms agreement required
  if (!agreedToTerms) {
    return NextResponse.json({ error: "You must agree to the Terms of Service and Privacy Policy" }, { status: 400 });
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

  // Validate password
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (password.length > 128) {
    return NextResponse.json({ error: "Password is too long" }, { status: 400 });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: nameResult.value,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        authProvider: "credentials",
      },
    });

    // Never return password hash or internal details
    return NextResponse.json({ id: user.id, name: user.name }, { status: 201 });
  } catch (error) {
    console.error("Registration error for user:", email?.slice(0, 3) + "***");
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
