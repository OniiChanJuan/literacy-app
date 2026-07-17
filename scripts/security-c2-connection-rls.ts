/**
 * C2 — RLS + grant hardening for the four connection_* tables the Supabase
 * Advisor flagged as RLS-disabled. IDEMPOTENT + reversible.
 *
 *   connection_clusters, connection_recs, connection_pending_titles
 *     → corpus/editorial (no user_id): RLS ON + public-read SELECT policy,
 *       REVOKE write grants from anon/authenticated. (App writes via Prisma
 *       superuser, which bypasses both RLS and these grants.)
 *
 *   connection_rec_votes
 *     → USER data (has user_id): RLS ON + owner-scoped policies mirroring
 *       cross_connection_votes. NOT public-read (would leak who voted).
 *
 * Modes:
 *   (default)   apply the hardening
 *   --check     print current state only, change nothing
 *   --rollback  revert to the pre-C2 state (RLS OFF, drop these policies,
 *               re-grant writes) — escape hatch if anything regresses
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/security-c2-connection-rls.ts --check
 */
import "dotenv/config";
import { Client } from "pg";

const CORPUS = ["connection_clusters", "connection_recs", "connection_pending_titles"];
const VOTES = "connection_rec_votes";
const ALL = [...CORPUS, VOTES];

async function printState(pg: Client, label: string) {
  console.log(`\n=== ${label} ===`);
  const { rows: rls } = await pg.query(
    `SELECT c.relname, c.relrowsecurity AS rls
       FROM pg_class c
      WHERE c.relnamespace='public'::regnamespace AND c.relname = ANY($1)
      ORDER BY c.relname`, [ALL]);
  console.table(rls);
  const { rows: pols } = await pg.query(
    `SELECT tablename, policyname, cmd, roles::text
       FROM pg_policies WHERE schemaname='public' AND tablename = ANY($1)
      ORDER BY tablename, policyname`, [ALL]);
  console.table(pols);
  const { rows: grants } = await pg.query(
    `SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
       FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name = ANY($1) AND grantee IN ('anon','authenticated')
      GROUP BY table_name, grantee ORDER BY table_name, grantee`, [ALL]);
  console.table(grants);
}

async function main() {
  const mode = process.argv.includes("--rollback") ? "rollback"
    : process.argv.includes("--check") ? "check" : "apply";
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) { console.error("DIRECT_URL / DATABASE_URL missing"); process.exit(1); }
  const pg = new Client({ connectionString: url });
  await pg.connect();

  await printState(pg, `BEFORE (${mode})`);
  if (mode === "check") { await pg.end(); return; }

  if (mode === "apply") {
    await pg.query("BEGIN");
    try {
      // --- corpus tables: RLS on, public read, no writes for anon/authenticated
      for (const t of CORPUS) {
        await pg.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
        await pg.query(`DROP POLICY IF EXISTS ${t}_public_read ON public.${t}`);
        await pg.query(`CREATE POLICY ${t}_public_read ON public.${t}
                        FOR SELECT TO anon, authenticated USING (true)`);
        await pg.query(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
                        ON public.${t} FROM anon, authenticated`);
      }
      // --- vote table: RLS on, owner-scoped (mirror cross_connection_votes)
      await pg.query(`ALTER TABLE public.${VOTES} ENABLE ROW LEVEL SECURITY`);
      for (const p of ["owner_select", "owner_insert", "owner_update", "owner_delete"]) {
        await pg.query(`DROP POLICY IF EXISTS ${VOTES}_${p} ON public.${VOTES}`);
      }
      await pg.query(`CREATE POLICY ${VOTES}_owner_select ON public.${VOTES}
                      FOR SELECT TO authenticated USING (auth.uid() = user_id)`);
      await pg.query(`CREATE POLICY ${VOTES}_owner_insert ON public.${VOTES}
                      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)`);
      await pg.query(`CREATE POLICY ${VOTES}_owner_update ON public.${VOTES}
                      FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`);
      await pg.query(`CREATE POLICY ${VOTES}_owner_delete ON public.${VOTES}
                      FOR DELETE TO authenticated USING (auth.uid() = user_id)`);
      // anon can never satisfy auth.uid(); also revoke writes as belt-and-suspenders
      await pg.query(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
                      ON public.${VOTES} FROM anon`);
      // authenticated keeps INSERT/UPDATE/DELETE/SELECT (owner-scoped by the
      // RLS policies above) — but TRUNCATE/REFERENCES/TRIGGER are NOT subject
      // to RLS, so revoke those outright.
      await pg.query(`REVOKE TRUNCATE, REFERENCES, TRIGGER
                      ON public.${VOTES} FROM authenticated`);
      await pg.query("COMMIT");
      console.log("\nAPPLIED.");
    } catch (e) { await pg.query("ROLLBACK"); throw e; }
  }

  if (mode === "rollback") {
    await pg.query("BEGIN");
    try {
      for (const t of CORPUS) {
        await pg.query(`DROP POLICY IF EXISTS ${t}_public_read ON public.${t}`);
        await pg.query(`ALTER TABLE public.${t} DISABLE ROW LEVEL SECURITY`);
        await pg.query(`GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
                        ON public.${t} TO anon, authenticated`);
      }
      for (const p of ["owner_select", "owner_insert", "owner_update", "owner_delete"]) {
        await pg.query(`DROP POLICY IF EXISTS ${VOTES}_${p} ON public.${VOTES}`);
      }
      await pg.query(`ALTER TABLE public.${VOTES} DISABLE ROW LEVEL SECURITY`);
      await pg.query(`GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
                      ON public.${VOTES} TO anon`);
      await pg.query(`GRANT TRUNCATE, REFERENCES, TRIGGER
                      ON public.${VOTES} TO authenticated`);
      await pg.query("COMMIT");
      console.log("\nROLLED BACK.");
    } catch (e) { await pg.query("ROLLBACK"); throw e; }
  }

  await printState(pg, `AFTER (${mode})`);
  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
