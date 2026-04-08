import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback — OAuth + email-link landing route.
 *
 * Supabase redirects here after Google sign-in or after the user clicks
 * an email confirmation / password reset link. The query string contains
 * a one-time `code` (PKCE), which we exchange for a session here on the
 * server. Cookies are set automatically by the SSR client; we then 302
 * to the original destination.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  // Reject open redirects: only same-origin paths.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, req.url),
    );
  }

  return NextResponse.redirect(new URL(safeNext, req.url));
}
