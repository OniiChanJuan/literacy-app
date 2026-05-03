/**
 * migrate-rls-owner-only-tables.ts (Session 2a — owner-only group)
 *
 * Adds 4-policy owner-only RLS to tables where each row belongs to a
 * specific user identified by a non-null user_id UUID column. Authed
 * users can only SELECT/INSERT/UPDATE/DELETE rows where
 * auth.uid() = user_id. anon role gets nothing.
 *
 * Tables (all use column user_id, confirmed via baseline diagnostic):
 *   user_settings
 *   dismissed_items
 *   implicit_signals
 *   imports
 *   notifications  (kept for future inbox feature; no consumer route yet)
 *   user_tag_suggestions
 *
 * Prisma's superuser pooler connection bypasses these policies, so the
 * existing API routes continue to work unchanged. The policies protect
 * any future code path that uses the Supabase JS client with the anon
 * key against these tables.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-rls-owner-only-tables.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   For each table in {user_settings, dismissed_items, implicit_signals,
 *                       imports, notifications, user_tag_suggestions}:
 *     DROP POLICY IF EXISTS "<table>_owner_select" ON public."<table>";
 *     DROP POLICY IF EXISTS "<table>_owner_insert" ON public."<table>";
 *     DROP POLICY IF EXISTS "<table>_owner_update" ON public."<table>";
 *     DROP POLICY IF EXISTS "<table>_owner_delete" ON public."<table>";
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

const TABLES = [
  "user_settings",
  "dismissed_items",
  "implicit_signals",
  "imports",
  "notifications",
  "user_tag_suggestions",
] as const;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Adding owner-only policies to per-user tables ===\n");

  await pg.query("BEGIN");
  try {
    for (const t of TABLES) {
      console.log(`  ${t}:`);

      // SELECT
      const selName = `${t}_owner_select`;
      console.log(`    DROP + CREATE "${selName}"`);
      await pg.query(`DROP POLICY IF EXISTS "${selName}" ON public."${t}";`);
      await pg.query(`
        CREATE POLICY "${selName}"
          ON public."${t}"
          FOR SELECT
          TO authenticated
          USING (auth.uid() = user_id);
      `);

      // INSERT
      const insName = `${t}_owner_insert`;
      console.log(`    DROP + CREATE "${insName}"`);
      await pg.query(`DROP POLICY IF EXISTS "${insName}" ON public."${t}";`);
      await pg.query(`
        CREATE POLICY "${insName}"
          ON public."${t}"
          FOR INSERT
          TO authenticated
          WITH CHECK (auth.uid() = user_id);
      `);

      // UPDATE — both USING (which row can be updated) and WITH CHECK
      // (the new row's user_id must still be the caller, preventing
      // a row owner from reassigning the row to someone else).
      const updName = `${t}_owner_update`;
      console.log(`    DROP + CREATE "${updName}"`);
      await pg.query(`DROP POLICY IF EXISTS "${updName}" ON public."${t}";`);
      await pg.query(`
        CREATE POLICY "${updName}"
          ON public."${t}"
          FOR UPDATE
          TO authenticated
          USING (auth.uid() = user_id)
          WITH CHECK (auth.uid() = user_id);
      `);

      // DELETE
      const delName = `${t}_owner_delete`;
      console.log(`    DROP + CREATE "${delName}"`);
      await pg.query(`DROP POLICY IF EXISTS "${delName}" ON public."${t}";`);
      await pg.query(`
        CREATE POLICY "${delName}"
          ON public."${t}"
          FOR DELETE
          TO authenticated
          USING (auth.uid() = user_id);
      `);
    }
    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  // Echo final state — should be 24 rows (4 per table × 6 tables)
  const { rows } = await pg.query(
    `
    SELECT tablename, policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY($1::text[])
    ORDER BY tablename, policyname;
    `,
    [TABLES]
  );
  console.log(`Total policies created: ${rows.length} (expected 24)`);
  console.table(rows);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
