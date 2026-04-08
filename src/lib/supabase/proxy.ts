import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth proxy (formerly "middleware") — refreshes expired Supabase auth
 * tokens on every request and propagates the refreshed cookies both
 * back to the browser and forward to Server Components.
 *
 * Do not remove the `supabase.auth.getClaims()` call below — it triggers
 * the refresh. Do not add logic between `createServerClient` and
 * `getClaims()` other than cookie plumbing.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: Do not run code between createServerClient and getUser().
  // Touching cookies or awaiting other work here will desync the session.
  try {
    // getUser() hits Supabase's /auth/v1/user endpoint which both
    // refreshes the access token (so the Set-Cookie propagates back
    // to the browser via the setAll callback above) and returns the
    // authenticated user. This is the pattern Supabase recommends for
    // Next.js SSR middleware.
    await supabase.auth.getUser();
  } catch {
    // Ignore — proxy must not block the request on auth errors.
  }

  return supabaseResponse;
}
