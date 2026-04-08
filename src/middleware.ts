import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Refresh Supabase auth session & propagate cookies ──────────────
  // updateSession calls supabase.auth.getClaims() to validate/refresh the
  // JWT and returns a NextResponse with any new Set-Cookie headers.
  const response = await updateSession(request);

  // ── 2. Protected-route redirect ───────────────────────────────────────
  // Unauthenticated users trying to hit /library or /settings get bounced
  // to /login. We check the Supabase auth cookie name pattern.
  const protectedPaths = ["/library", "/settings"];
  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isProtected) {
    // Supabase sets cookies named `sb-<project-ref>-auth-token*`.
    const hasSupabaseSession = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
    if (!hasSupabaseSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── 3. Global Privacy Control (GPC) acknowledgement ───────────────────
  const gpcHeader = request.headers.get("sec-gpc");
  if (gpcHeader === "1") {
    response.headers.set("X-GPC-Acknowledged", "true");
  }

  // ── 4. Security headers ───────────────────────────────────────────────
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // Content Security Policy — added *.supabase.co to connect-src so the
  // browser Supabase client can hit /auth/v1/*.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://image.tmdb.org https://images.igdb.com https://books.google.com https://i.scdn.co https://cdn.myanimelist.net https://comicvine.gamespot.com https://upload.wikimedia.org https://covers.openlibrary.org https://*.archive.org https://lh3.googleusercontent.com",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co https://api.themoviedb.org https://api.igdb.com https://api.jikan.moe https://api.spotify.com https://id.twitch.tv https://www.googleapis.com https://comicvine.gamespot.com",
    "frame-ancestors 'none'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every request except static assets.
     * API routes DO need the proxy (so session refresh propagates), so
     * they're NOT excluded here — unlike the old middleware.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
