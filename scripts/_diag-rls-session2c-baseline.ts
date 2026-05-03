/**
 * Session 2c baseline. Confirms the discovery report still holds and
 * that the view does not yet exist.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-rls-session2c-baseline.ts
 */
import "dotenv/config";
import { Client } from "pg";

const EXPECTED_USER_COLS = [
  "id", "email", "name", "image", "bio", "avatar", "auth_provider",
  "member_number", "is_private", "terms_accepted_at", "taste_profile",
  "created_at", "updated_at", "username",
];

(async () => {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  let drift = false;
  const flag = (m: string) => { drift = true; console.log(`  ⚠️  ${m}`); };

  console.log("\n=== users RLS state ===\n");
  const { rows: rls } = await pg.query(`SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='users';`);
  console.log(`  rowsecurity: ${rls[0]?.rowsecurity}`);
  if (rls[0]?.rowsecurity !== true) flag("users.rowsecurity is not true");
  const { rows: pols } = await pg.query(`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='users';`);
  console.log(`  policy count: ${pols.length}`);
  if (pols.length !== 0) flag(`expected 0 policies on users, found ${pols.length}: ${pols.map((p: any) => p.policyname).join(", ")}`);

  console.log("\n=== users column inventory ===\n");
  const { rows: cols } = await pg.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
    ORDER BY column_name;
  `);
  const got = cols.map((c: any) => c.column_name).sort();
  const want = [...EXPECTED_USER_COLS].sort();
  console.log(`  found ${got.length} columns: ${got.join(", ")}`);
  const missing = want.filter((c) => !got.includes(c));
  const extra = got.filter((c) => !want.includes(c));
  if (missing.length) flag(`MISSING columns vs discovery: ${missing.join(", ")}`);
  if (extra.length) flag(`EXTRA columns vs discovery: ${extra.join(", ")}`);

  console.log("\n=== public_user_profiles view existence (should not exist) ===\n");
  const { rows: views } = await pg.query(`SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname='public_user_profiles';`);
  if (views.length === 0) console.log(`  ✅ view does not yet exist`);
  else flag(`view public_user_profiles already exists`);

  console.log("\n=== row counts ===\n");
  const u = await pg.query(`SELECT COUNT(*)::int n FROM public.users;`);
  console.log(`  public.users: ${u.rows[0].n}`);

  console.log(`\n${drift ? "❌ DRIFT — stop and report." : "✅ Baseline matches discovery — safe to proceed."}\n`);
  await pg.end();
})().catch((e) => { console.error(e); process.exit(1); });
