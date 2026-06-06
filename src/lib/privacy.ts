/**
 * Centralized privacy-flag helpers used by every route that returns
 * one user's data to another. Mirrors the four toggles on the
 * settings page:
 *
 *   - users.is_private              (boolean on User)
 *   - user_settings.showRatingsPublicly
 *   - user_settings.showLibraryPublicly
 *   - user_settings.showActivityPublicly
 *
 * Defaults — applied when no user_settings row exists for a user
 * (which happens for users who never opened the Settings page):
 *
 *   showRatingsPublicly   true
 *   showLibraryPublicly   true
 *   showActivityPublicly  true
 *
 * These match the Prisma model's @default(true) on UserSettings.
 *
 * Routes should treat the owner as exempt from every toggle (the
 * owning user always sees their own data regardless of flag state).
 *
 * NOTE: today the app reads via Prisma's superuser pooler which
 * bypasses RLS, so enforcement lives entirely in this module. A
 * follow-up will mirror these gates as SECURITY DEFINER SQL helpers
 * + RLS policy extensions for the PostgREST-key code path.
 */
import { prisma } from "./prisma";

export interface PrivacyFlags {
  showRatingsPublicly: boolean;
  showLibraryPublicly: boolean;
  showActivityPublicly: boolean;
}

export const DEFAULT_PRIVACY_FLAGS: PrivacyFlags = {
  showRatingsPublicly: true,
  showLibraryPublicly: true,
  showActivityPublicly: true,
};

/**
 * Fetch the show* flags for a batch of user IDs. Returns a Map keyed
 * by userId; userIds with no user_settings row resolve to the
 * defaults (all true).
 *
 * Does NOT fetch is_private — that lives on the User / PublicUserProfile
 * model and is already commonly available in the routes via profileMap.
 */
export async function loadPrivacyFlags(userIds: string[]): Promise<Map<string, PrivacyFlags>> {
  const map = new Map<string, PrivacyFlags>();
  if (userIds.length === 0) return map;

  // Dedup
  const uniq = Array.from(new Set(userIds));
  const rows = await prisma.userSettings.findMany({
    where: { userId: { in: uniq } },
    select: {
      userId: true,
      showRatingsPublicly: true,
      showLibraryPublicly: true,
      showActivityPublicly: true,
    },
  });

  for (const r of rows) {
    map.set(r.userId, {
      showRatingsPublicly: r.showRatingsPublicly,
      showLibraryPublicly: r.showLibraryPublicly,
      showActivityPublicly: r.showActivityPublicly,
    });
  }
  // Fill defaults for any uniq id without a row
  for (const id of uniq) {
    if (!map.has(id)) map.set(id, { ...DEFAULT_PRIVACY_FLAGS });
  }
  return map;
}

/**
 * Convenience for the single-user case. Defaults applied when no row
 * exists.
 */
export async function loadPrivacyFlagsForUser(userId: string): Promise<PrivacyFlags> {
  const m = await loadPrivacyFlags([userId]);
  return m.get(userId) ?? { ...DEFAULT_PRIVACY_FLAGS };
}
