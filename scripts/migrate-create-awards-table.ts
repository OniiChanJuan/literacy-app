/**
 * migrate-create-awards-table.ts (provenance/awards workstream, step 1)
 *
 * Creates public.awards — the relational awards/provenance table
 * (Awards(item_id, award_key, category, year, result)). Source of truth
 * for pedigree data; items.awards JSON remains a denormalized display
 * cache of award keys for the badge UI.
 *
 * RLS hardening folded in per the security-window conventions:
 *   - RLS ENABLED on creation (never exists unhardened)
 *   - public-read SELECT for anon + authenticated (catalog data,
 *     parallels items/external_scores in migrate-rls-catalog-tables.ts)
 *   - NO insert/update/delete policies — writes happen only via Prisma
 *     (postgres superuser, bypasses RLS); anon/authenticated have no
 *     write path via PostgREST (deny by default).
 *
 * Index names match Prisma's naming convention so a future `db push`
 * sees no drift.
 *
 * Run: npx tsx scripts/migrate-create-awards-table.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP TABLE IF EXISTS public.awards;
 * ────────────────────────────────────────────────────────────────────
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Creating public.awards ===\n");

  await pg.query("BEGIN");
  try {
    await pg.query(`
      CREATE TABLE IF NOT EXISTS public.awards (
        id         serial PRIMARY KEY,
        item_id    integer     NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
        award_key  text        NOT NULL,
        category   text        NOT NULL DEFAULT '',
        year       integer     NOT NULL,
        result     text        NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    console.log("  ✓ table created");

    await pg.query(`CREATE UNIQUE INDEX IF NOT EXISTS awards_item_id_award_key_category_year_key ON public.awards(item_id, award_key, category, year);`);
    await pg.query(`CREATE INDEX IF NOT EXISTS awards_award_key_year_idx ON public.awards(award_key, year);`);
    await pg.query(`CREATE INDEX IF NOT EXISTS awards_item_id_idx ON public.awards(item_id);`);
    console.log("  ✓ unique + browse indexes");

    await pg.query(`ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;`);
    console.log("  ✓ RLS enabled");

    await pg.query(`DROP POLICY IF EXISTS awards_public_read ON public.awards;`);
    await pg.query(`
      CREATE POLICY awards_public_read
        ON public.awards
        FOR SELECT
        TO anon, authenticated
        USING (true);
    `);
    console.log("  ✓ public_read policy (no write policies — deny by default)");

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  const { rows: cols } = await pg.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='awards'
    ORDER BY ordinal_position;
  `);
  console.log("Columns:");
  console.table(cols);

  const { rows: pols } = await pg.query(`
    SELECT policyname, cmd, roles FROM pg_policies
    WHERE schemaname='public' AND tablename='awards'
    ORDER BY policyname;
  `);
  console.log("\nPolicies:");
  console.table(pols);

  const { rows: rls } = await pg.query(`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname='awards' AND relnamespace='public'::regnamespace;
  `);
  console.log("\nRLS enabled:", rls[0]?.relrowsecurity);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
