/**
 * Session 2a baseline. Confirms RLS state + policy count for the 15
 * tables in scope, and resolves the tags table dependency question.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/_diag-rls-session2a-baseline.ts
 */
import "dotenv/config";
import { Client } from "pg";

const IN_SCOPE = [
  // Catalog (public read)
  "items", "external_scores", "franchises", "franchise_items", "tags",
  // Owner-only
  "user_settings", "dismissed_items", "implicit_signals", "imports", "notifications", "user_tag_suggestions",
  // Service-role-only (already RLS-no-policies; documenting only)
  "reports", "dmca_notices", "platform_clicks", "suggested_connections",
];

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  // ── 1. RLS state + policy count for the 15 tables ──────────────────
  const { rows: state } = await pg.query(
    `
    SELECT
      t.tablename,
      t.rowsecurity,
      COALESCE(p.policy_count, 0)::int AS policy_count
    FROM pg_tables t
    LEFT JOIN (
      SELECT tablename, COUNT(*) AS policy_count
      FROM pg_policies
      WHERE schemaname='public'
      GROUP BY tablename
    ) p ON p.tablename = t.tablename
    WHERE t.schemaname='public' AND t.tablename = ANY($1::text[])
    ORDER BY array_position($1::text[], t.tablename);
    `,
    [IN_SCOPE]
  );
  console.log("\n=== Session 2a: RLS state + policy count for 15 in-scope tables ===\n");
  console.table(state);

  // ── 2. Tags table FK + code references ─────────────────────────────
  console.log("\n=== Tags table dependency check ===\n");

  // FKs FROM other tables INTO tags
  const { rows: fksIn } = await pg.query(`
    SELECT
      conrelid::regclass AS referencing_table,
      conname AS constraint_name,
      pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE confrelid = 'public.tags'::regclass
      AND contype = 'f';
  `);
  console.log("Foreign keys FROM other tables INTO public.tags:");
  console.table(fksIn);

  // FKs FROM tags INTO other tables (less critical, but informative)
  const { rows: fksOut } = await pg.query(`
    SELECT
      confrelid::regclass AS referenced_table,
      conname AS constraint_name,
      pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.tags'::regclass
      AND contype = 'f';
  `);
  console.log("\nForeign keys FROM public.tags INTO other tables:");
  console.table(fksOut);

  // Row count to know if there's data sitting in there
  const { rows: tagCount } = await pg.query(`SELECT COUNT(*)::int AS row_count FROM public.tags;`);
  console.log(`\nRow count in public.tags: ${tagCount[0].row_count}`);

  // ── 3. Resolve user-id column names per owner-only table ───────────
  console.log("\n=== User-id column on owner-only tables ===\n");
  const ownerTables = [
    "user_settings", "dismissed_items", "implicit_signals",
    "imports", "notifications", "user_tag_suggestions",
  ];
  const { rows: cols } = await pg.query(
    `
    SELECT
      table_name,
      column_name,
      data_type,
      is_nullable
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name = ANY($1::text[])
      AND column_name IN ('user_id', 'userid', 'owner_id', 'reporter_user_id', 'follower_id', 'followed_id')
    ORDER BY table_name, column_name;
    `,
    [ownerTables]
  );
  console.table(cols);

  // ── 4. Existing policies on any in-scope table (confirms audit) ────
  console.log("\n=== Existing policies on any of the 15 (should be empty) ===\n");
  const { rows: existing } = await pg.query(
    `
    SELECT tablename, policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY($1::text[])
    ORDER BY tablename, policyname;
    `,
    [IN_SCOPE]
  );
  if (existing.length === 0) {
    console.log("(none — matches audit)");
  } else {
    console.table(existing);
  }

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
