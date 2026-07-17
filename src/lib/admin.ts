/**
 * Centralized admin authorization.
 *
 * Until a proper DB role column lands, admin identity is an email
 * allowlist. Source of truth is the ADMIN_EMAILS env var (comma-
 * separated); when unset we fall back to the known owner account so
 * the admin surfaces keep working in local/preview without config.
 *
 * This replaces two duplicated hardcodes that previously lived in
 * /api/admin/reports and /api/cross-connections. When the role column
 * arrives, change ONLY this file.
 *
 * SECURITY: uses getClaims() (server-verified getUser()), never the
 * spoofable session cookie. Fails closed — no email / not on the list
 * => not admin.
 */
import { getClaims } from "@/lib/supabase/auth";

const DEFAULT_ADMIN_EMAILS = [
  "admin@crossshelf.app",
  "juanguajardo2014@gmail.com", // member #1 — project owner
];

/** The active admin allowlist, lowercased. Env overrides the default. */
export function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS;
  const list = raw
    ? raw.split(",").map((e) => e.trim()).filter(Boolean)
    : DEFAULT_ADMIN_EMAILS;
  return new Set(list.map((e) => e.toLowerCase()));
}

/** True only for a signed-in user whose verified email is on the allowlist. */
export async function isAdmin(): Promise<boolean> {
  const claims = await getClaims();
  const email = claims?.email?.toLowerCase();
  if (!email) return false;
  return adminEmails().has(email);
}
