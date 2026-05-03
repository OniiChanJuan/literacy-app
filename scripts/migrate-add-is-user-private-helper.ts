/**
 * migrate-add-is-user-private-helper.ts (Session 2b — helper function)
 *
 * Adds public.is_user_private(target_user_id uuid) RETURNS boolean.
 * Returns users.is_private for the given user, or false if no such
 * user (matches existing app behavior — unknown users are NOT treated
 * as private; the profile route 404s on lookup before any privacy
 * check happens, so the only realistic caller of this with an unknown
 * id is RLS evaluation against an orphaned row, which the FK should
 * already prevent).
 *
 * Hardening (matches Session 1 handle_new_user pattern):
 *   - SECURITY DEFINER so the policy can read users even when users
 *     itself is locked down in Session 2c.
 *   - SET search_path = public, pg_temp to neutralize any schema-
 *     hijack attack via search_path.
 *   - LANGUAGE sql + STABLE so Postgres can cache within a query
 *     (a single SELECT, no side effects).
 *   - REVOKE EXECUTE FROM PUBLIC, GRANT EXECUTE TO anon, authenticated.
 *     The library_entries SELECT policy needs both roles to call it.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-add-is-user-private-helper.ts
 *
 * Idempotent (CREATE OR REPLACE FUNCTION + DROP POLICY-style guards
 * for the grant/revoke).
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP FUNCTION IF EXISTS public.is_user_private(uuid);
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Creating public.is_user_private(uuid) ===\n");

  await pg.query("BEGIN");
  try {
    await pg.query(`
      CREATE OR REPLACE FUNCTION public.is_user_private(target_user_id uuid)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $$
        SELECT COALESCE(
          (SELECT is_private FROM public.users WHERE id = target_user_id),
          false
        );
      $$;
    `);
    console.log("  ✓ function created");

    // Lock down execution. Do PUBLIC revoke first, then explicit grants.
    await pg.query(`REVOKE EXECUTE ON FUNCTION public.is_user_private(uuid) FROM PUBLIC;`);
    console.log("  ✓ revoked EXECUTE from PUBLIC");

    await pg.query(`GRANT EXECUTE ON FUNCTION public.is_user_private(uuid) TO anon, authenticated;`);
    console.log("  ✓ granted EXECUTE to anon, authenticated");

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  // Echo final state
  const { rows: fn } = await pg.query(`
    SELECT proname, prosecdef, proconfig, provolatile
    FROM pg_proc
    WHERE proname='is_user_private' AND pronamespace='public'::regnamespace;
  `);
  console.log("Function state:");
  console.table(fn);

  const { rows: grants } = await pg.query(`
    SELECT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND routine_name='is_user_private'
    ORDER BY grantee;
  `);
  console.log("\nGrants:");
  console.table(grants);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
