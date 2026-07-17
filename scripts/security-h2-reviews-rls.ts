/**
 * H2 (DB layer) — align the reviews SELECT policy with the locked privacy
 * model: a review is visible to a non-owner only when the author is NOT
 * private AND shows activity publicly. This mirrors the ratings/library
 * policies, which already gate on is_user_private().
 *
 *   BEFORE: (user_id = auth.uid()) OR should_show_activity_publicly(user_id)
 *   AFTER:  (user_id = auth.uid())
 *           OR ((NOT is_user_private(user_id)) AND should_show_activity_publicly(user_id))
 *
 * Modes: (default) apply | --check | --rollback
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/security-h2-reviews-rls.ts --check
 */
import "dotenv/config";
import { Client } from "pg";

const NAME = "reviews_visible_to_owner_or_public";
const AFTER = `((user_id = auth.uid()) OR ((NOT is_user_private(user_id)) AND should_show_activity_publicly(user_id)))`;
const BEFORE = `((user_id = auth.uid()) OR should_show_activity_publicly(user_id))`;

async function show(pg: Client, label: string) {
  const { rows } = await pg.query(
    `SELECT policyname, cmd, roles::text, qual AS using_expr
       FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname=$1`, [NAME]);
  console.log(`\n=== ${label} ===`);
  console.table(rows);
}

async function main() {
  const mode = process.argv.includes("--rollback") ? "rollback"
    : process.argv.includes("--check") ? "check" : "apply";
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) { console.error("DIRECT_URL / DATABASE_URL missing"); process.exit(1); }
  const pg = new Client({ connectionString: url });
  await pg.connect();

  await show(pg, `BEFORE (${mode})`);
  if (mode !== "check") {
    const expr = mode === "rollback" ? BEFORE : AFTER;
    await pg.query("BEGIN");
    try {
      await pg.query(`DROP POLICY IF EXISTS ${NAME} ON public.reviews`);
      await pg.query(
        `CREATE POLICY ${NAME} ON public.reviews
         FOR SELECT TO anon, authenticated USING (${expr})`);
      await pg.query("COMMIT");
      console.log(`\n${mode === "rollback" ? "ROLLED BACK" : "APPLIED"}.`);
    } catch (e) { await pg.query("ROLLBACK"); throw e; }
    await show(pg, `AFTER (${mode})`);
  }
  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
