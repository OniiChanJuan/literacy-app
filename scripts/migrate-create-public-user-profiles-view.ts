/**
 * migrate-create-public-user-profiles-view.ts (Session 2c)
 *
 * Creates public.public_user_profiles — a public-safe projection of
 * the users table. Excludes email, auth_provider, taste_profile,
 * terms_accepted_at, and updated_at. Granted SELECT to anon and
 * authenticated; PostgREST callers go through this view, not the
 * base table.
 *
 * Defense-in-depth: Prisma still reads the base table over the
 * superuser pooler (RLS-bypass). The view is only relevant when a
 * caller goes through PostgREST with the anon or authenticated key,
 * or — eventually — when application code is migrated to read user
 * profile data through this view explicitly.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-create-public-user-profiles-view.ts
 *
 * Idempotent (CREATE OR REPLACE VIEW + GRANT/REVOKE rerun-safe).
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP VIEW IF EXISTS public.public_user_profiles;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Creating public.public_user_profiles ===\n");

  await pg.query("BEGIN");
  try {
    await pg.query(`
      CREATE OR REPLACE VIEW public.public_user_profiles AS
      SELECT
        id,
        name,
        username,
        bio,
        avatar,
        image,
        member_number,
        created_at,
        is_private
      FROM public.users;
    `);
    console.log("  ✓ view created");

    // Supabase grants ALL on public-schema objects to anon and
    // authenticated by default (RLS is the real gatekeeper). For
    // defense-in-depth on a public-projection view, explicitly
    // strip everything and then grant only SELECT.
    await pg.query(`REVOKE ALL ON public.public_user_profiles FROM PUBLIC, anon, authenticated;`);
    console.log("  ✓ revoked all from PUBLIC, anon, authenticated");

    await pg.query(`GRANT SELECT ON public.public_user_profiles TO anon, authenticated;`);
    console.log("  ✓ granted SELECT to anon, authenticated");

    await pg.query(`
      COMMENT ON VIEW public.public_user_profiles IS
        'Public-safe projection of users. Excludes email, auth_provider, taste_profile, terms_accepted_at, updated_at. Defense-in-depth for any future PostgREST or Supabase JS client read of user profile data. Created in Session 2c of security audit work.';
    `);
    console.log("  ✓ comment set");

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  const { rows: viewDef } = await pg.query(`
    SELECT viewname, definition FROM pg_views
    WHERE schemaname='public' AND viewname='public_user_profiles';
  `);
  console.log("View definition:");
  console.table(viewDef.map((r: any) => ({ viewname: r.viewname, def_preview: r.definition.slice(0, 120).replace(/\s+/g, " ") })));

  const { rows: grants } = await pg.query(`
    SELECT grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema='public' AND table_name='public_user_profiles'
    ORDER BY grantee, privilege_type;
  `);
  console.log("\nGrants:");
  console.table(grants);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
