/**
 * migrate-rls-public-read-owner-write.ts (Session 2b — community-content)
 *
 * Adds public-read + owner-write policies to 6 community-content tables:
 *   ratings, reviews, review_helpful_votes,
 *   franchise_ratings, franchise_follows, follows
 *
 * Pattern per table (4 policies):
 *   <table>_public_read   SELECT to anon+authenticated, USING (true)
 *   <table>_owner_insert  INSERT to authenticated, WITH CHECK (auth.uid() = <owner>)
 *   <table>_owner_update  UPDATE to authenticated, USING (auth.uid() = <owner>) WITH CHECK (auth.uid() = <owner>)
 *   <table>_owner_delete  DELETE to authenticated, USING (auth.uid() = <owner>)
 *
 * Owner column is `user_id` for all tables EXCEPT `follows`, where the
 * owner is `follower_id` (the actor doing the following). `followed_id`
 * is the target and is not an owner field — anyone can be followed.
 *
 * Why public read on every table:
 *   - ratings/reviews: already exposed publicly via /api/items/[id]/aggregate
 *     and /api/reviews — item pages must work for signed-out visitors.
 *   - review_helpful_votes: aggregates live on reviews.helpful_count /
 *     vote_score; per-vote rows are essentially boring metadata. Public
 *     read keeps PostgREST useful if we ever wire it up; nothing
 *     sensitive leaks.
 *   - follows: confirmed product decision — Twitter-style public follow
 *     graph.
 *   - franchise_ratings / franchise_follows: parallel to follows for
 *     franchise objects. No privacy expectation today.
 *
 * Prisma's superuser pooler bypasses these policies, so the existing
 * app behavior is unchanged. The policies harden the
 * anon/authenticated-key PostgREST surface.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-rls-public-read-owner-write.ts
 *
 * Idempotent. Each policy DROP IF EXISTS + CREATE.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   For each table in {ratings, reviews, review_helpful_votes,
 *                       franchise_ratings, franchise_follows, follows}:
 *     DROP POLICY IF EXISTS "<table>_public_read"  ON public."<table>";
 *     DROP POLICY IF EXISTS "<table>_owner_insert" ON public."<table>";
 *     DROP POLICY IF EXISTS "<table>_owner_update" ON public."<table>";
 *     DROP POLICY IF EXISTS "<table>_owner_delete" ON public."<table>";
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

// [tableName, ownerColumnName]
const TABLES: Array<[string, string]> = [
  ["ratings", "user_id"],
  ["reviews", "user_id"],
  ["review_helpful_votes", "user_id"],
  ["franchise_ratings", "user_id"],
  ["franchise_follows", "user_id"],
  ["follows", "follower_id"],
];

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log("=== Adding public-read + owner-write policies to 6 tables ===\n");

  await pg.query("BEGIN");
  try {
    for (const [t, owner] of TABLES) {
      console.log(`  ${t} (owner column: ${owner}):`);

      // SELECT — public read
      const sel = `${t}_public_read`;
      await pg.query(`DROP POLICY IF EXISTS "${sel}" ON public."${t}";`);
      await pg.query(`
        CREATE POLICY "${sel}"
          ON public."${t}"
          FOR SELECT
          TO anon, authenticated
          USING (true);
      `);
      console.log(`    ✓ ${sel}`);

      // INSERT — owner only
      const ins = `${t}_owner_insert`;
      await pg.query(`DROP POLICY IF EXISTS "${ins}" ON public."${t}";`);
      await pg.query(`
        CREATE POLICY "${ins}"
          ON public."${t}"
          FOR INSERT
          TO authenticated
          WITH CHECK (auth.uid() = ${owner});
      `);
      console.log(`    ✓ ${ins}`);

      // UPDATE — owner only, both USING and WITH CHECK so a row can't
      // be reassigned to a different owner.
      const upd = `${t}_owner_update`;
      await pg.query(`DROP POLICY IF EXISTS "${upd}" ON public."${t}";`);
      await pg.query(`
        CREATE POLICY "${upd}"
          ON public."${t}"
          FOR UPDATE
          TO authenticated
          USING (auth.uid() = ${owner})
          WITH CHECK (auth.uid() = ${owner});
      `);
      console.log(`    ✓ ${upd}`);

      // DELETE — owner only
      const del = `${t}_owner_delete`;
      await pg.query(`DROP POLICY IF EXISTS "${del}" ON public."${t}";`);
      await pg.query(`
        CREATE POLICY "${del}"
          ON public."${t}"
          FOR DELETE
          TO authenticated
          USING (auth.uid() = ${owner});
      `);
      console.log(`    ✓ ${del}`);
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
    `SELECT tablename, policyname, cmd, roles
     FROM pg_policies
     WHERE schemaname='public' AND tablename = ANY($1::text[])
     ORDER BY tablename, policyname;`,
    [TABLES.map(([t]) => t)]
  );
  console.log(`Total policies created: ${rows.length} (expected 24)`);
  console.table(rows);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
