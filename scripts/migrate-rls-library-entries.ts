/**
 * migrate-rls-library-entries.ts (Session 2b — library_entries)
 *
 * Adds privacy-aware policies to library_entries. The SELECT policy
 * is the only place in this whole audit where users.is_private is
 * actually consulted at the row level.
 *
 * Policies:
 *   library_entries_visible_to_owner_or_public   SELECT
 *     anon, authenticated
 *     USING (user_id = auth.uid() OR NOT public.is_user_private(user_id))
 *
 *     - Owners always see their own rows (auth.uid() match).
 *     - Anyone else sees only rows belonging to non-private users.
 *     - is_user_private() is SECURITY DEFINER so this still works
 *       after Session 2c locks down the users table.
 *
 *   library_entries_owner_insert  INSERT  authenticated  WITH CHECK (auth.uid() = user_id)
 *   library_entries_owner_update  UPDATE  authenticated  USING (auth.uid() = user_id)
 *                                                       WITH CHECK (auth.uid() = user_id)
 *   library_entries_owner_delete  DELETE  authenticated  USING (auth.uid() = user_id)
 *
 * DEPENDENCY: requires public.is_user_private(uuid) — run
 * scripts/migrate-add-is-user-private-helper.ts FIRST.
 *
 * Prisma bypasses RLS, so the app's existing /api/library and profile
 * routes are unaffected. Privacy is already enforced at the route
 * layer (see /api/users/[id]/route.ts: showLibrary = !user.isPrivate
 * || isOwn). This migration adds defense-in-depth for the PostgREST
 * surface.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-rls-library-entries.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP POLICY IF EXISTS "library_entries_visible_to_owner_or_public" ON public.library_entries;
 *   DROP POLICY IF EXISTS "library_entries_owner_insert"               ON public.library_entries;
 *   DROP POLICY IF EXISTS "library_entries_owner_update"               ON public.library_entries;
 *   DROP POLICY IF EXISTS "library_entries_owner_delete"               ON public.library_entries;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  // Sanity-check the helper exists. If someone runs these out of order
  // we want a loud failure, not a CREATE POLICY that silently references
  // a function that doesn't exist yet.
  const { rows: fn } = await pg.query(`
    SELECT 1 FROM pg_proc
    WHERE proname='is_user_private' AND pronamespace='public'::regnamespace;
  `);
  if (fn.length === 0) {
    console.error("✗ public.is_user_private(uuid) is not present.");
    console.error("  Run scripts/migrate-add-is-user-private-helper.ts first.");
    process.exit(1);
  }

  console.log("=== Adding privacy-aware policies to library_entries ===\n");

  await pg.query("BEGIN");
  try {
    // SELECT — owner always; others only when owner is not private.
    const sel = "library_entries_visible_to_owner_or_public";
    await pg.query(`DROP POLICY IF EXISTS "${sel}" ON public.library_entries;`);
    await pg.query(`
      CREATE POLICY "${sel}"
        ON public.library_entries
        FOR SELECT
        TO anon, authenticated
        USING (
          user_id = auth.uid()
          OR NOT public.is_user_private(user_id)
        );
    `);
    console.log(`  ✓ ${sel}`);

    // INSERT
    const ins = "library_entries_owner_insert";
    await pg.query(`DROP POLICY IF EXISTS "${ins}" ON public.library_entries;`);
    await pg.query(`
      CREATE POLICY "${ins}"
        ON public.library_entries
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id);
    `);
    console.log(`  ✓ ${ins}`);

    // UPDATE
    const upd = "library_entries_owner_update";
    await pg.query(`DROP POLICY IF EXISTS "${upd}" ON public.library_entries;`);
    await pg.query(`
      CREATE POLICY "${upd}"
        ON public.library_entries
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    `);
    console.log(`  ✓ ${upd}`);

    // DELETE
    const del = "library_entries_owner_delete";
    await pg.query(`DROP POLICY IF EXISTS "${del}" ON public.library_entries;`);
    await pg.query(`
      CREATE POLICY "${del}"
        ON public.library_entries
        FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id);
    `);
    console.log(`  ✓ ${del}`);

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  // Echo final state — 4 policies, with the SELECT policy referencing is_user_private
  const { rows } = await pg.query(`
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname='public' AND tablename='library_entries'
    ORDER BY policyname;
  `);
  console.log("library_entries policies:");
  console.table(rows);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
