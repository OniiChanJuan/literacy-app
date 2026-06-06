/**
 * migrate-create-connection-events-credits.ts (Stage 2b of quality_score enrichment)
 *
 * Adds the two tables needed for strict-attribution downstream signals.
 *
 *   connection_events    — append-only log of (user, connection)
 *                          impressions and cover_click events.
 *                          Read at credit time to confirm the user
 *                          actually saw the connection within the
 *                          attribution window (14d for library,
 *                          30d for ratings).
 *
 *   connection_credits   — one row per (user, connection, item,
 *                          signal_class), holding the highest tier
 *                          of positive credit applied so far plus
 *                          the cumulative delta written to
 *                          quality_score for audit/reversal.
 *
 * RLS:
 *   connection_events  — public read (anon can SELECT but rows hold
 *                        nothing sensitive), owner-only writes.
 *   connection_credits — public read same reasoning, owner-only writes.
 *
 * Prisma's superuser pooler bypasses these RLS policies; the app
 * writes through Prisma exclusively. Policies harden the
 * anon/authenticated-key PostgREST surface for the future.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-create-connection-events-credits.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP TABLE IF EXISTS public.connection_credits;
 *   DROP TABLE IF EXISTS public.connection_events;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Creating connection_events + connection_credits ===\n");

  await pg.query("BEGIN");
  try {
    // ── connection_events ────────────────────────────────────────────
    await pg.query(`
      CREATE TABLE IF NOT EXISTS public.connection_events (
        id            bigserial   PRIMARY KEY,
        user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        connection_id integer     NOT NULL REFERENCES public.cross_connections(id) ON DELETE CASCADE,
        event_type    text        NOT NULL CHECK (event_type IN ('impression', 'cover_click')),
        item_id       integer     REFERENCES public.items(id) ON DELETE CASCADE,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pg.query(`
      CREATE INDEX IF NOT EXISTS connection_events_user_conn_type_time_idx
        ON public.connection_events (user_id, connection_id, event_type, created_at DESC);
    `);
    await pg.query(`
      CREATE INDEX IF NOT EXISTS connection_events_conn_type_time_idx
        ON public.connection_events (connection_id, event_type, created_at DESC);
    `);
    await pg.query(`
      CREATE INDEX IF NOT EXISTS connection_events_created_at_idx
        ON public.connection_events (created_at);
    `);
    console.log("  ✓ connection_events table + 3 indexes");

    await pg.query(`ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;`);
    await pg.query(`DROP POLICY IF EXISTS connection_events_public_read ON public.connection_events;`);
    await pg.query(`
      CREATE POLICY connection_events_public_read
        ON public.connection_events
        FOR SELECT TO anon, authenticated
        USING (true);
    `);
    await pg.query(`DROP POLICY IF EXISTS connection_events_owner_insert ON public.connection_events;`);
    await pg.query(`
      CREATE POLICY connection_events_owner_insert
        ON public.connection_events
        FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = user_id);
    `);
    await pg.query(`DROP POLICY IF EXISTS connection_events_owner_update ON public.connection_events;`);
    await pg.query(`
      CREATE POLICY connection_events_owner_update
        ON public.connection_events
        FOR UPDATE TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    `);
    await pg.query(`DROP POLICY IF EXISTS connection_events_owner_delete ON public.connection_events;`);
    await pg.query(`
      CREATE POLICY connection_events_owner_delete
        ON public.connection_events
        FOR DELETE TO authenticated
        USING (auth.uid() = user_id);
    `);
    console.log("  ✓ connection_events RLS policies");

    // ── connection_credits ───────────────────────────────────────────
    await pg.query(`
      CREATE TABLE IF NOT EXISTS public.connection_credits (
        user_id       uuid             NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        connection_id integer          NOT NULL REFERENCES public.cross_connections(id) ON DELETE CASCADE,
        item_id       integer          NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
        signal_class  text             NOT NULL CHECK (signal_class IN ('downstream')),
        tier          integer          NOT NULL CHECK (tier BETWEEN -1 AND 5),
        delta_applied double precision NOT NULL,
        updated_at    timestamptz      NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, connection_id, item_id, signal_class)
      );
    `);
    await pg.query(`
      CREATE INDEX IF NOT EXISTS connection_credits_conn_idx
        ON public.connection_credits (connection_id);
    `);
    console.log("  ✓ connection_credits table + index");

    await pg.query(`ALTER TABLE public.connection_credits ENABLE ROW LEVEL SECURITY;`);
    await pg.query(`DROP POLICY IF EXISTS connection_credits_public_read ON public.connection_credits;`);
    await pg.query(`
      CREATE POLICY connection_credits_public_read
        ON public.connection_credits
        FOR SELECT TO anon, authenticated
        USING (true);
    `);
    await pg.query(`DROP POLICY IF EXISTS connection_credits_owner_insert ON public.connection_credits;`);
    await pg.query(`
      CREATE POLICY connection_credits_owner_insert
        ON public.connection_credits
        FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = user_id);
    `);
    await pg.query(`DROP POLICY IF EXISTS connection_credits_owner_update ON public.connection_credits;`);
    await pg.query(`
      CREATE POLICY connection_credits_owner_update
        ON public.connection_credits
        FOR UPDATE TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    `);
    await pg.query(`DROP POLICY IF EXISTS connection_credits_owner_delete ON public.connection_credits;`);
    await pg.query(`
      CREATE POLICY connection_credits_owner_delete
        ON public.connection_credits
        FOR DELETE TO authenticated
        USING (auth.uid() = user_id);
    `);
    console.log("  ✓ connection_credits RLS policies");

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  // Echo final state
  for (const t of ["connection_events", "connection_credits"]) {
    const { rows: cols } = await pg.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position;`,
      [t],
    );
    console.log(`${t}:`);
    console.table(cols);
  }

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
