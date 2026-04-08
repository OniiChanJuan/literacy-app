import { createClient } from "./server";

export interface AuthClaims {
  /** Supabase Auth user UUID (also the public.users.id value). */
  sub: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Server-side auth. Returns the verified user's id/email as a claims
 * object, or null if not signed in.
 *
 * SECURITY: uses supabase.auth.getUser(), which makes a server-to-server
 * call to Supabase's /auth/v1/user endpoint. That endpoint validates the
 * JWT's signature before returning the user. This is the pattern
 * recommended by Supabase for server-side auth checks — never
 * getSession(), which only reads a cookie and can be spoofed.
 *
 * We intentionally do NOT call getClaims() here. The newer getClaims()
 * helper is faster (no network round-trip) but has had a few API shape
 * changes and fails silently with chunked session cookies in some
 * @supabase/ssr versions. Since for-you / ratings / library all hit
 * Postgres anyway, the extra ~30ms from getUser() is negligible.
 */
export async function getClaims(): Promise<AuthClaims | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return { sub: data.user.id, email: data.user.email ?? undefined };
  } catch {
    return null;
  }
}

/** Convenience — returns just the user id (sub) or null. */
export async function getUserId(): Promise<string | null> {
  const claims = await getClaims();
  return claims?.sub ?? null;
}
