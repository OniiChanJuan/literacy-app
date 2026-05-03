/**
 * migrate-rls-catalog-tables.ts (Session 2a — catalog group)
 *
 * Adds public-read SELECT policies to the catalog tables. Writes
 * happen via Prisma (postgres superuser, bypasses RLS) so no
 * INSERT/UPDATE/DELETE policy is added — anon and authenticated
 * roles have no write capability via PostgREST.
 *
 * Tables: items, external_scores, franchises, franchise_items, tags
 *
 *   tags is included even though the audit initially flagged it as
 *   possibly orphaned: user_tag_suggestions.tag_slug has a FK into
 *   tags(slug) and the table holds 387 rows of canonical tag
 *   definitions. Confirmed via Session 2a baseline diagnostic.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-rls-catalog-tables.ts
 *
 * Idempotent. Each policy is dropped if it exists before being created.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP POLICY IF EXISTS "items_public_read"           ON public.items;
 *   DROP POLICY IF EXISTS "external_scores_public_read" ON public.external_scores;
 *   DROP POLICY IF EXISTS "franchises_public_read"      ON public.franchises;
 *   DROP POLICY IF EXISTS "franchise_items_public_read" ON public.franchise_items;
 *   DROP POLICY IF EXISTS "tags_public_read"            ON public.tags;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

const TABLES = [
  "items",
  "external_scores",
  "franchises",
  "franchise_items",
  "tags",
] as const;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Adding public-read policies to catalog tables ===\n");

  await pg.query("BEGIN");
  try {
    for (const t of TABLES) {
      const policy = `${t}_public_read`;
      console.log(`  ${t}: DROP + CREATE POLICY "${policy}"`);
      await pg.query(`DROP POLICY IF EXISTS "${policy}" ON public."${t}";`);
      await pg.query(`
        CREATE POLICY "${policy}"
          ON public."${t}"
          FOR SELECT
          TO anon, authenticated
          USING (true);
      `);
    }
    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  // Echo final state
  const { rows } = await pg.query(
    `
    SELECT tablename, policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY($1::text[])
    ORDER BY tablename, policyname;
    `,
    [TABLES]
  );
  console.table(rows);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
