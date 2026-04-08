"use client";

/**
 * NextAuth-shaped React shim over Supabase Auth.
 *
 * Lets the existing client components keep importing { useSession,
 * signIn, signOut } from a single place — only the import path
 * changes from "next-auth/react" to "@/lib/supabase/use-session".
 *
 * Returned shape mirrors next-auth/react:
 *   useSession() → { data: { user: { id, email, name, image } } | null, status }
 *
 * On the server, never use this. Use getClaims()/getUserId() from
 * "@/lib/supabase/auth" so the JWT signature is validated.
 */

import { useEffect, useState, useCallback, useContext, createContext } from "react";
import type { ReactNode } from "react";
import { createClient } from "./client";
import type { Session, User } from "@supabase/supabase-js";

export interface ShimSessionUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}
export interface ShimSession {
  user: ShimSessionUser;
}
export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface Ctx {
  data: ShimSession | null;
  status: SessionStatus;
}
const SessionCtx = createContext<Ctx>({ data: null, status: "loading" });

function toShim(session: Session | null): ShimSession | null {
  if (!session?.user) return null;
  const u: User = session.user;
  const meta = (u.user_metadata || {}) as Record<string, unknown>;
  return {
    user: {
      id: u.id,
      email: u.email ?? null,
      name:
        (meta.full_name as string) ||
        (meta.name as string) ||
        (meta.display_name as string) ||
        u.email?.split("@")[0] ||
        null,
      image:
        (meta.avatar_url as string) ||
        (meta.picture as string) ||
        null,
    },
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ShimSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data: s }) => {
      if (cancelled) return;
      setData(toShim(s.session));
      setStatus(s.session ? "authenticated" : "unauthenticated");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setData(toShim(session));
      setStatus(session ? "authenticated" : "unauthenticated");
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  return <SessionCtx.Provider value={{ data, status }}>{children}</SessionCtx.Provider>;
}

export function useSession(): { data: ShimSession | null; status: SessionStatus } {
  return useContext(SessionCtx);
}

/** NextAuth-shaped signOut shim. */
export async function signOut(opts?: { callbackUrl?: string }): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  const target = opts?.callbackUrl || "/";
  if (typeof window !== "undefined") {
    window.location.href = target;
  }
}

/**
 * NextAuth-shaped signIn shim. Only the providers we use are wired.
 *   signIn("credentials", { email, password, redirect: false }) -> password
 *   signIn("google", { callbackUrl })                          -> OAuth redirect
 */
export async function signIn(
  provider: "credentials" | "google" | "discord",
  opts?: { email?: string; password?: string; redirect?: boolean; callbackUrl?: string },
): Promise<{ error?: string; ok?: boolean; url?: string | null } | void> {
  const supabase = createClient();
  const callback = opts?.callbackUrl || "/";

  if (provider === "credentials") {
    if (!opts?.email || !opts?.password) {
      return { error: "Email and password required", ok: false };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: opts.email,
      password: opts.password,
    });
    if (error) return { error: error.message, ok: false };
    if (opts.redirect !== false && typeof window !== "undefined") {
      window.location.href = callback;
    }
    return { ok: true, url: callback };
  }

  // OAuth providers
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(callback)}`
      : undefined;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  if (error) return { error: error.message, ok: false };
  return { ok: true };
}
