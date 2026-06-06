/**
 * migrate-create-connection-dismissals.ts (Stage 2a of quality_score enrichment)
 *
 * Creates the public.connection_dismissals table and its RLS policies.
 * One row per (user_id, connection_id) — idempotency for the −0.15
 * dismiss-this-connection signal so a user can't tank a score by
 * spam-clicking.
 *
 * Policy shape matches Sessions 2a/2b owner-only writes plus public-read
 * (anon can SELECT but rows are tiny and not sensitive; the user's own
 * dismissals need to be readable to hide their dismissed connections
 * from /api/cross-connections GET, which uses Prisma so RLS is bypassed
 * anyway — but public-read keeps the table consistent with
 * cross_connection_votes from Session 1).
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-create-connection-dismissals.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP TABLE IF EXISTS public.connection_dismissals;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Creating connection_dismissals ===\n");

  await pg.query("BEGIN");
  try {
    await pg.query(`
      CREATE TABLE IF NOT EXISTS public.connection_dismissals (
        user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        connection_id integer     NOT NULL REFERENCES public.cross_connections(id) ON DELETE CASCADE,
        created_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, connection_id)
      );
    `);
    console.log("  ✓ table created");

    await pg.query(`CREATE INDEX IF NOT EXISTS connection_dismissals_connection_idx ON public.connection_dismissals(connection_id);`);
    console.log("  ✓ index on connection_id");

    await pg.query(`ALTER TABLE public.connection_dismissals ENABLE ROW LEVEL SECURITY;`);
    console.log("  ✓ RLS enabled");

    // Public read (parallels cross_connection_votes) — the user's own
    // list needs to be reachable; rows hold no sensitive info.
    await pg.query(`DROP POLICY IF EXISTS connection_dismissals_public_read ON public.connection_dismissals;`);
    await pg.query(`
      CREATE POLICY connection_dismissals_public_read
        ON public.connection_dismissals
        FOR SELECT
        TO anon, authenticated
        USING (true);
    `);
    console.log("  ✓ public_read policy");

    // Owner-only insert/update/delete on user_id.
    await pg.query(`DROP POLICY IF EXISTS connection_dismissals_owner_insert ON public.connection_dismissals;`);
    await pg.query(`
      CREATE POLICY connection_dismissals_owner_insert
        ON public.connection_dismissals
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id);
    `);
    console.log("  ✓ owner_insert policy");

    await pg.query(`DROP POLICY IF EXISTS connection_dismissals_owner_update ON public.connection_dismissals;`);
    await pg.query(`
      CREATE POLICY connection_dismissals_owner_update
        ON public.connection_dismissals
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    `);
    console.log("  ✓ owner_update policy");

    await pg.query(`DROP POLICY IF EXISTS connection_dismissals_owner_delete ON public.connection_dismissals;`);
    await pg.query(`
      CREATE POLICY connection_dismissals_owner_delete
        ON public.connection_dismissals
        FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id);
    `);
    console.log("  ✓ owner_delete policy");

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
    WHERE table_schema='public' AND table_name='connection_dismissals'
    ORDER BY ordinal_position;
  `);
  console.log("Columns:");
  console.table(cols);

  const { rows: pols } = await pg.query(`
    SELECT policyname, cmd, roles FROM pg_policies
    WHERE schemaname='public' AND tablename='connection_dismissals'
    ORDER BY policyname;
  `);
  console.log("\nPolicies:");
  console.table(pols);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
