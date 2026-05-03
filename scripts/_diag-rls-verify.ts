/**
 * Post-migration verification — runs the four queries from Session 1's
 * Step 3 spec and reports the results.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-rls-verify.ts
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) { console.error("missing DB URL"); process.exit(1); }
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== 1. RLS state on the two cross-connection tables ===\n");
  const { rows: r1 } = await pg.query(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname='public' AND tablename IN ('cross_connections', 'cross_connection_votes')
    ORDER BY tablename;
  `);
  console.table(r1);

  console.log("\n=== 2. Policies on the two cross-connection tables ===\n");
  const { rows: r2 } = await pg.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('cross_connections', 'cross_connection_votes')
    ORDER BY tablename, policyname;
  `);
  console.table(r2);

  console.log("\n=== 3. handle_new_user hardening state ===\n");
  const { rows: r3 } = await pg.query(`
    SELECT
      proname,
      prosecdef AS is_security_definer,
      proconfig AS config_settings
    FROM pg_proc
    WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace;
  `);
  console.table(r3);

  console.log("\n=== 4. handle_new_user EXECUTE grants (anon/authenticated should be ABSENT) ===\n");
  const { rows: r4 } = await pg.query(`
    SELECT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'handle_new_user'
    ORDER BY grantee;
  `);
  console.table(r4);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
