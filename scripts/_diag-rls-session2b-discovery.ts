/**
 * Session 2b read-only discovery. Confirms schema/state assumptions
 * before drafting community-content RLS policies.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-rls-session2b-discovery.ts
 */
import "dotenv/config";
import { Client } from "pg";

const COMMUNITY_TABLES = [
  "ratings",
  "reviews",
  "review_helpful_votes",
  "follows",
  "franchise_follows",
  "franchise_ratings",
  "library_entries",
];

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("\n=== is_private distribution ===");
  const { rows: priv } = await pg.query(
    `SELECT is_private, COUNT(*)::int FROM public.users GROUP BY is_private;`
  );
  console.table(priv);

  console.log("\n=== row counts on community tables ===");
  for (const t of COMMUNITY_TABLES) {
    const r = await pg.query(`SELECT COUNT(*)::int AS c FROM public."${t}";`);
    console.log(`  ${t}: ${r.rows[0].c}`);
  }

  console.log("\n=== columns on community tables (any soft-delete/moderation cols?) ===");
  const { rows: cols } = await pg.query(
    `
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position;
    `,
    [COMMUNITY_TABLES]
  );
  console.table(cols);

  console.log("\n=== RLS state on community tables ===");
  const { rows: rls } = await pg.query(
    `SELECT tablename, rowsecurity FROM pg_tables
     WHERE schemaname='public' AND tablename = ANY($1::text[]);`,
    [COMMUNITY_TABLES]
  );
  console.table(rls);

  console.log("\n=== existing policies on community tables ===");
  const { rows: pols } = await pg.query(
    `SELECT tablename, policyname, cmd, roles FROM pg_policies
     WHERE schemaname='public' AND tablename = ANY($1::text[])
     ORDER BY tablename, policyname;`,
    [COMMUNITY_TABLES]
  );
  if (pols.length === 0) console.log("(none)");
  else console.table(pols);

  console.log("\n=== SECURITY DEFINER functions in public schema ===");
  const { rows: defs } = await pg.query(
    `SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef = true;`
  );
  if (defs.length === 0) console.log("(none)");
  else console.table(defs);

  console.log("\n=== views in public schema ===");
  const { rows: views } = await pg.query(
    `SELECT viewname FROM pg_views WHERE schemaname='public';`
  );
  if (views.length === 0) console.log("(none)");
  else console.table(views);

  console.log("\n=== review_helpful_votes voteType distribution ===");
  const { rows: vt } = await pg.query(
    `SELECT vote_type, COUNT(*)::int FROM public.review_helpful_votes GROUP BY vote_type;`
  );
  if (vt.length === 0) console.log("(empty table)");
  else console.table(vt);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
