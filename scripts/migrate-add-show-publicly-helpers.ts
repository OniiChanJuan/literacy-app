/**
 * migrate-add-show-publicly-helpers.ts (Session 2d — privacy-flag helpers)
 *
 * Adds three SECURITY DEFINER helpers parallel to is_user_private,
 * each reading one show_*_publicly flag off user_settings:
 *
 *   should_show_ratings_publicly(target_user_id uuid)  RETURNS boolean
 *   should_show_library_publicly(target_user_id uuid)  RETURNS boolean
 *   should_show_activity_publicly(target_user_id uuid) RETURNS boolean
 *
 * Defaults — when no user_settings row exists for the target user,
 * each helper returns TRUE. Matches src/lib/privacy.ts
 * DEFAULT_PRIVACY_FLAGS and the Prisma model's @default(true). Users
 * who never opened the Settings page are treated as public.
 *
 * Hardening (matches is_user_private from Session 2b):
 *   - LANGUAGE sql STABLE — pure SELECT, cacheable within a query.
 *   - SECURITY DEFINER + SET search_path = public, pg_temp — so the
 *     helper still works after Session 2a locked down user_settings
 *     to owner-only SELECT, and neutralizes search_path hijack.
 *   - REVOKE EXECUTE FROM PUBLIC, GRANT EXECUTE TO anon, authenticated.
 *     The new ratings / library_entries / reviews SELECT policies
 *     need both roles to call them.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-add-show-publicly-helpers.ts
 *
 * Idempotent (CREATE OR REPLACE FUNCTION + idempotent REVOKE/GRANT).
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP FUNCTION IF EXISTS public.should_show_ratings_publicly(uuid);
 *   DROP FUNCTION IF EXISTS public.should_show_library_publicly(uuid);
 *   DROP FUNCTION IF EXISTS public.should_show_activity_publicly(uuid);
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

// [fnName, columnName]
const HELPERS: Array<[string, string]> = [
  ["should_show_ratings_publicly", "show_ratings_publicly"],
  ["should_show_library_publicly", "show_library_publicly"],
  ["should_show_activity_publicly", "show_activity_publicly"],
];

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Creating show-*-publicly helpers ===\n");

  await pg.query("BEGIN");
  try {
    for (const [fn, col] of HELPERS) {
      await pg.query(`
        CREATE OR REPLACE FUNCTION public.${fn}(target_user_id uuid)
        RETURNS boolean
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT COALESCE(
            (SELECT ${col} FROM public.user_settings WHERE user_id = target_user_id),
            true
          );
        $$;
      `);
      await pg.query(`REVOKE EXECUTE ON FUNCTION public.${fn}(uuid) FROM PUBLIC;`);
      await pg.query(`GRANT EXECUTE ON FUNCTION public.${fn}(uuid) TO anon, authenticated;`);
      console.log(`  ✓ ${fn}(uuid)`);
    }

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  const { rows: fns } = await pg.query(`
    SELECT proname, prosecdef, provolatile, proconfig
    FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname = ANY($1::text[])
    ORDER BY proname;
  `, [HELPERS.map(([f]) => f)]);
  console.log("Function state:");
  console.table(fns);

  const { rows: grants } = await pg.query(`
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema='public'
      AND routine_name = ANY($1::text[])
    ORDER BY routine_name, grantee;
  `, [HELPERS.map(([f]) => f)]);
  console.log("\nGrants:");
  console.table(grants);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
