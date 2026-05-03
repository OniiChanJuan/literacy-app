/**
 * Baseline RLS + handle_new_user inspection. Read-only.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-rls-baseline.ts
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) { console.error("DIRECT_URL / DATABASE_URL missing"); process.exit(1); }
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("\n=== public schema RLS state ===\n");
  const { rows: tables } = await pg.query(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname='public'
    ORDER BY tablename;
  `);
  console.table(tables);

  const off = tables.filter((t: any) => !t.rowsecurity).map((t: any) => t.tablename);
  console.log(`\nrowsecurity = false on: ${off.length === 0 ? "(none)" : off.join(", ")}`);

  console.log("\n=== handle_new_user state ===\n");
  const { rows: fns } = await pg.query(`
    SELECT
      proname,
      prosecdef AS is_security_definer,
      proconfig AS config_settings
    FROM pg_proc
    WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace;
  `);
  console.table(fns);

  console.log("\n=== handle_new_user EXECUTE grants ===\n");
  const { rows: grants } = await pg.query(`
    SELECT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'handle_new_user'
    ORDER BY grantee;
  `);
  console.table(grants);

  console.log("\n=== on_auth_user_created trigger ===\n");
  const { rows: trigs } = await pg.query(`
    SELECT tgname, tgrelid::regclass AS on_table, tgenabled
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created';
  `);
  console.table(trigs);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
