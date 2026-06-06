/**
 * migrate-fix-platform-clicks-user-id-type.ts (Wave 3 cont'd)
 *
 * platform_clicks.user_id was `text` in the DB but Prisma declared
 * it as uuid. Legacy CUID values from the pre-Supabase NextAuth era
 * (e.g. "cmn4a5rzd000004jj03jhq8rn") prevented a clean ALTER TYPE.
 * platform_clicks is pure outbound-click telemetry: no user-facing
 * feature reads it today, the legacy CUID rows are unjoinable to
 * the current Supabase auth.users.id space anyway, and the few
 * clean UUID rows are from dev testing only.
 *
 * Decision: TRUNCATE the table and convert the column to uuid.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-fix-platform-clicks-user-id-type.ts
 *
 * Idempotent — exits cleanly if user_id is already uuid.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE public.platform_clicks
 *     ALTER COLUMN user_id TYPE text USING user_id::text;
 *   -- Note: rollback does NOT restore the truncated telemetry rows.
 * ────────────────────────────────────────────────────────────────────
 *
 * TODO (pre-launch analytics, separate session):
 *   Add columns to public.platform_clicks to support future
 *   click-attribution analytics:
 *     - source                  text NOT NULL DEFAULT 'unknown'
 *       (origin: item_page | cross_shelf_card | search | profile | etc.)
 *     - session_id              uuid (group clicks within a session)
 *     - referrer_connection_id  int  REFERENCES cross_connections(id)
 *       (nullable; set when the click came from a cross-shelf card —
 *        lets us correlate outbound traffic back to recommendation
 *        engine performance and platform partnership conversions)
 *   These three together unlock the click-attribution story for
 *   platform partnerships and recommendation-engine ROI analytics
 *   before public launch. Not blocking, but file this when analytics
 *   work begins.
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== platform_clicks.user_id text → uuid ===\n");

  const { rows: type } = await pg.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='platform_clicks' AND column_name='user_id'`,
  );
  if (type[0]?.data_type === "uuid") {
    console.log("  ⏭  user_id already uuid — nothing to do.");
    await pg.end();
    return;
  }

  // Snapshot row count for the record
  const { rows: snapshot } = await pg.query(`SELECT COUNT(*)::int n FROM public.platform_clicks;`);
  console.log(`  📊 row count before truncate: ${snapshot[0].n}`);

  await pg.query("BEGIN");
  try {
    await pg.query(`TRUNCATE TABLE public.platform_clicks;`);
    console.log("  ✓ truncated");
    await pg.query(`
      ALTER TABLE public.platform_clicks
      ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;
    `);
    console.log("  ✓ ALTER TYPE → uuid");
    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("✗ Failed, rolled back:", e);
    throw e;
  }

  const { rows: verify } = await pg.query(
    `SELECT data_type, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='platform_clicks' AND column_name='user_id'`,
  );
  console.log(`  Final: user_id ${verify[0].data_type} nullable=${verify[0].is_nullable}`);
  const { rows: post } = await pg.query(`SELECT COUNT(*)::int n FROM public.platform_clicks;`);
  console.log(`  Row count after: ${post[0].n}`);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
