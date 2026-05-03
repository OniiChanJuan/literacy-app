/**
 * migrate-rls-cross-connections.ts (Session 1, Group A)
 *
 * Enables RLS on cross_connections and cross_connection_votes, both of
 * which were created without RLS by scripts/migrate-cross-connections.ts
 * and were therefore reachable via the Supabase anon key on PostgREST.
 *
 *   cross_connections        — public read; writes happen via Prisma
 *                              (superuser, bypasses RLS) so no INSERT/
 *                              UPDATE/DELETE policy is added.
 *
 *   cross_connection_votes   — owner-only across SELECT/INSERT/UPDATE/
 *                              DELETE. anon role gets nothing — voting
 *                              requires being signed in. Prisma still
 *                              bypasses everything via the postgres
 *                              superuser, so the existing vote endpoint
 *                              continues to work unchanged.
 *
 * Run:   npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-rls-cross-connections.ts
 *
 * Idempotent — uses IF NOT EXISTS / DROP IF EXISTS guards.
 *
 * ─── Rollback (paste into psql or another script) ───────────────────
 *   DROP POLICY IF EXISTS "cc_public_read"       ON public.cross_connections;
 *   DROP POLICY IF EXISTS "ccv_owner_select"     ON public.cross_connection_votes;
 *   DROP POLICY IF EXISTS "ccv_owner_insert"     ON public.cross_connection_votes;
 *   DROP POLICY IF EXISTS "ccv_owner_update"     ON public.cross_connection_votes;
 *   DROP POLICY IF EXISTS "ccv_owner_delete"     ON public.cross_connection_votes;
 *   ALTER TABLE public.cross_connections      DISABLE ROW LEVEL SECURITY;
 *   ALTER TABLE public.cross_connection_votes DISABLE ROW LEVEL SECURITY;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) { console.error("DIRECT_URL / DATABASE_URL missing"); process.exit(1); }
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Enabling RLS on cross_connections + cross_connection_votes ===\n");

  await pg.query("BEGIN");
  try {
    // ── cross_connections: enable + public read policy ─────────────
    console.log("  cross_connections: ALTER TABLE … ENABLE ROW LEVEL SECURITY");
    await pg.query(`ALTER TABLE public.cross_connections ENABLE ROW LEVEL SECURITY;`);

    console.log("  cross_connections: DROP + CREATE POLICY cc_public_read");
    await pg.query(`DROP POLICY IF EXISTS "cc_public_read" ON public.cross_connections;`);
    await pg.query(`
      CREATE POLICY "cc_public_read"
        ON public.cross_connections
        FOR SELECT
        TO anon, authenticated
        USING (true);
    `);

    // ── cross_connection_votes: enable + 4 owner-only policies ─────
    console.log("  cross_connection_votes: ALTER TABLE … ENABLE ROW LEVEL SECURITY");
    await pg.query(`ALTER TABLE public.cross_connection_votes ENABLE ROW LEVEL SECURITY;`);

    console.log("  cross_connection_votes: DROP + CREATE 4 owner-only policies");
    await pg.query(`DROP POLICY IF EXISTS "ccv_owner_select" ON public.cross_connection_votes;`);
    await pg.query(`
      CREATE POLICY "ccv_owner_select"
        ON public.cross_connection_votes
        FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id);
    `);

    await pg.query(`DROP POLICY IF EXISTS "ccv_owner_insert" ON public.cross_connection_votes;`);
    await pg.query(`
      CREATE POLICY "ccv_owner_insert"
        ON public.cross_connection_votes
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id);
    `);

    await pg.query(`DROP POLICY IF EXISTS "ccv_owner_update" ON public.cross_connection_votes;`);
    await pg.query(`
      CREATE POLICY "ccv_owner_update"
        ON public.cross_connection_votes
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    `);

    await pg.query(`DROP POLICY IF EXISTS "ccv_owner_delete" ON public.cross_connection_votes;`);
    await pg.query(`
      CREATE POLICY "ccv_owner_delete"
        ON public.cross_connection_votes
        FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id);
    `);

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  // Quick post-state echo
  const { rows: tables } = await pg.query(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname='public'
      AND tablename IN ('cross_connections', 'cross_connection_votes')
    ORDER BY tablename;
  `);
  console.table(tables);

  const { rows: policies } = await pg.query(`
    SELECT tablename, policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('cross_connections', 'cross_connection_votes')
    ORDER BY tablename, policyname;
  `);
  console.table(policies);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
