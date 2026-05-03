/**
 * migrate-rls-users-owner-write.ts (Session 2c)
 *
 * Adds owner-only UPDATE and DELETE policies on public.users for
 * defense-in-depth. NO SELECT policy is created — anon and
 * authenticated continue to get nothing from the base users table
 * via PostgREST. Public profile reads go through the
 * public_user_profiles view (created in commit 1 of Session 2c).
 *
 * NO INSERT policy is created either — the handle_new_user trigger
 * is SECURITY DEFINER and bypasses RLS regardless.
 *
 * Prisma's superuser pooler connection bypasses these policies, so
 * /api/profile, /api/settings, /api/account, etc. continue to work
 * unchanged.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-rls-users-owner-write.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP POLICY IF EXISTS users_owner_update ON public.users;
 *   DROP POLICY IF EXISTS users_owner_delete ON public.users;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Adding owner-only UPDATE/DELETE policies on users ===\n");

  await pg.query("BEGIN");
  try {
    await pg.query(`DROP POLICY IF EXISTS users_owner_update ON public.users;`);
    await pg.query(`
      CREATE POLICY users_owner_update
        ON public.users
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    `);
    console.log("  ✓ users_owner_update");

    await pg.query(`DROP POLICY IF EXISTS users_owner_delete ON public.users;`);
    await pg.query(`
      CREATE POLICY users_owner_delete
        ON public.users
        FOR DELETE
        TO authenticated
        USING (auth.uid() = id);
    `);
    console.log("  ✓ users_owner_delete");

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  const { rows } = await pg.query(`
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies WHERE schemaname='public' AND tablename='users'
    ORDER BY policyname;
  `);
  console.log("Final users policies:");
  console.table(rows);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
