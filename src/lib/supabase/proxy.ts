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

  // IMPORTANT: Do not run code between createServerClient and getClaims().
  // Touching cookies or awaiting other work here will desync the session.
  try {
    // getClaims() is available in recent @supabase/ssr versions and
    // validates the JWT signature. If it's not exposed, fall back to
    // getUser() which also triggers a refresh and hits /auth/v1/user.
    const anyAuth = supabase.auth as unknown as {
      getClaims?: () => Promise<unknown>;
      getUser: () => Promise<unknown>;
    };
    if (typeof anyAuth.getClaims === "function") {
      await anyAuth.getClaims();
    } else {
      await anyAuth.getUser();
    }
  } catch {
    // Ignore — proxy must not block the request on auth errors.
  }

  return supabaseResponse;
}
