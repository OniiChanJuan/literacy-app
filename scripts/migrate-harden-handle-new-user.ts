/**
 * migrate-harden-handle-new-user.ts (Session 1, Group B)
 *
 * Hardens the handle_new_user trigger function exposed via REST RPC:
 *
 *   1. Recreates the function with SET search_path = public, pg_temp
 *      so any future search_path manipulation can't redirect references
 *      to public.users / pg_advisory_xact_lock / etc.
 *
 *   2. Revokes EXECUTE from PUBLIC, anon, authenticated. The trigger
 *      executes with the function owner's privileges (SECURITY DEFINER)
 *      regardless of EXECUTE grants on the function itself, so signup
 *      remains unaffected. App code never invokes this function as RPC.
 *
 * Function body is preserved exactly as it was in
 * scripts/migrate-to-supabase-auth.ts. No behavior change to signup.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-harden-handle-new-user.ts
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC, anon, authenticated;
 *   -- And recreate without SET search_path if you need the previous form.
 *   -- Function definition kept in scripts/migrate-to-supabase-auth.ts for reference.
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) { console.error("DIRECT_URL / DATABASE_URL missing"); process.exit(1); }
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Hardening public.handle_new_user ===\n");

  await pg.query("BEGIN");
  try {
    console.log("  1. CREATE OR REPLACE FUNCTION with SET search_path");
    await pg.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $$
      DECLARE
        v_next_member int;
      BEGIN
        -- Serialize member_number allocation across concurrent signups.
        PERFORM pg_advisory_xact_lock(42424242);
        SELECT COALESCE(MAX(member_number), 0) + 1 INTO v_next_member FROM public.users;

        INSERT INTO public.users (id, email, name, member_number, created_at, updated_at, auth_provider)
        VALUES (
          NEW.id,
          NEW.email,
          COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1)
          ),
          v_next_member,
          NOW(),
          NOW(),
          COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
        )
        ON CONFLICT (id) DO NOTHING;
        RETURN NEW;
      END;
      $$;
    `);

    console.log("  2. REVOKE EXECUTE FROM PUBLIC, anon, authenticated");
    await pg.query(`
      REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
    `);

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  // Confirm trigger is still wired (CREATE OR REPLACE FUNCTION should NOT
  // drop a trigger that references the function — but verify explicitly).
  const { rows: trigs } = await pg.query(`
    SELECT tgname, tgrelid::regclass AS on_table, tgenabled
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created';
  `);
  console.log("Trigger state after migration:");
  console.table(trigs);

  if (trigs.length === 0) {
    console.error("\n⚠️  on_auth_user_created trigger missing! Recreating…");
    await pg.query(`
      CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    `);
    console.log("  Recreated.");
  } else if (trigs[0].tgenabled !== "O") {
    console.error(`\n⚠️  Trigger exists but tgenabled = ${trigs[0].tgenabled} (expected 'O' / origin / enabled)`);
  } else {
    console.log("Trigger intact.");
  }

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
