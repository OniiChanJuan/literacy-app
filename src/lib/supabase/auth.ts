import { createClient } from "./server";

export interface AuthClaims {
  /** Supabase Auth user UUID (also the public.users.id value). */
  sub: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Server-side auth. Returns the verified JWT claims, or null if the
 * user is not signed in / the token is invalid.
 *
 * SECURITY: uses getClaims() (signature-validated) when available,
 * falling back to getUser() which hits the Supabase auth server. Never
 * uses getSession() — that only reads the cookie and can be spoofed.
 */
export async function getClaims(): Promise<AuthClaims | null> {
  const supabase = await createClient();
  const anyAuth = supabase.auth as unknown as {
    getClaims?: () => Promise<{ data: { claims: AuthClaims | null } | null; error: unknown }>;
    getUser: () => Promise<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
  };

  if (typeof anyAuth.getClaims === "function") {
    try {
      const { data } = await anyAuth.getClaims();
      return data?.claims ?? null;
    } catch {
      return null;
    }
  }

  // Fallback for older @supabase/ssr versions
  try {
    const { data } = await anyAuth.getUser();
    if (!data?.user) return null;
    return { sub: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

/** Convenience — returns just the user id (sub) or null. */
export async function getUserId(): Promise<string | null> {
  const claims = await getClaims();
  return claims?.sub ?? null;
}
