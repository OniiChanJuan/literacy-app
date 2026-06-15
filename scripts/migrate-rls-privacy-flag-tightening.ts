/**
 * migrate-rls-privacy-flag-tightening.ts (Session 2d — privacy-flag RLS)
 *
 * Tightens three SELECT policies from Session 2b's USING (true) to
 * consult the show_*_publicly helpers from Session 2d. This mirrors
 * what src/lib/privacy.ts already enforces in application code,
 * giving us belt-and-suspenders coverage: routes that go through
 * Prisma (bypasses RLS) still honor the flags via privacy.ts; any
 * future read path that goes through PostgREST honors them via RLS.
 *
 * Policy changes:
 *
 *   ratings_public_read  →  ratings_visible_to_owner_or_public
 *     USING (
 *       user_id = auth.uid()
 *       OR (NOT public.is_user_private(user_id)
 *           AND public.should_show_ratings_publicly(user_id))
 *     )
 *     - Owner always sees own rows.
 *     - Others see rows only when owner is non-private AND has
 *       showRatingsPublicly=true.
 *
 *   library_entries_visible_to_owner_or_public  (extend in place)
 *     USING (
 *       user_id = auth.uid()
 *       OR (NOT public.is_user_private(user_id)
 *           AND public.should_show_library_publicly(user_id))
 *     )
 *
 *   reviews_public_read  →  reviews_visible_to_owner_or_public
 *     USING (
 *       user_id = auth.uid()
 *       OR public.should_show_activity_publicly(user_id)
 *     )
 *     - Per Phase 1 product decision: reviews are NOT hidden by
 *       is_private. They are hidden ONLY by showActivityPublicly.
 *       The text of a review is content the user authored for the
 *       item's page; the "private profile" toggle controls who can
 *       see your library, not whether your reviews leave your account.
 *
 *   follows  — LEFT AS PUBLIC.
 *     Session 2b explicitly chose Twitter-style public follow graph,
 *     consistent with Literacy's "taste-focused, NOT facebook-like"
 *     positioning (Goodreads / Letterboxd are both public follows).
 *     Hiding follower lists for is_private users would be an
 *     Instagram-style model that we explicitly rejected. If product
 *     ever revisits this, a future Session 2e migration can add
 *     visible_to_owner_or_public(follower_id, followed_id) gating —
 *     no schema change needed, just a policy swap.
 *
 * INSERT / UPDATE / DELETE policies on ratings / reviews / library_entries
 * are untouched — owner-only writes were already correct in Session 2b.
 *
 * DEPENDENCIES:
 *   - public.is_user_private(uuid)             (Session 2b)
 *   - public.should_show_ratings_publicly(uuid) (Session 2d helpers)
 *   - public.should_show_library_publicly(uuid)
 *   - public.should_show_activity_publicly(uuid)
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-rls-privacy-flag-tightening.ts
 *
 * Idempotent. DROP IF EXISTS + CREATE for each policy. Drops the
 * old *_public_read policy names so the table doesn't end up with
 * both old and new SELECT policies (multiple permissive policies
 * UNION together, so leaving the old one would silently re-open
 * the row).
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   DROP POLICY IF EXISTS "ratings_visible_to_owner_or_public"          ON public.ratings;
 *   DROP POLICY IF EXISTS "reviews_visible_to_owner_or_public"          ON public.reviews;
 *   DROP POLICY IF EXISTS "library_entries_visible_to_owner_or_public"  ON public.library_entries;
 *   -- restore Session 2b open-read fallbacks:
 *   CREATE POLICY "ratings_public_read" ON public.ratings
 *     FOR SELECT TO anon, authenticated USING (true);
 *   CREATE POLICY "reviews_public_read" ON public.reviews
 *     FOR SELECT TO anon, authenticated USING (true);
 *   CREATE POLICY "library_entries_visible_to_owner_or_public" ON public.library_entries
 *     FOR SELECT TO anon, authenticated
 *     USING (user_id = auth.uid() OR NOT public.is_user_private(user_id));
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  // Dependency sanity-check: all four helpers must exist.
  const requiredFns = [
    "is_user_private",
    "should_show_ratings_publicly",
    "should_show_library_publicly",
    "should_show_activity_publicly",
  ];
  const { rows: present } = await pg.query(
    `SELECT proname FROM pg_proc
     WHERE pronamespace='public'::regnamespace AND proname = ANY($1::text[]);`,
    [requiredFns]
  );
  const presentSet = new Set(present.map((r: any) => r.proname));
  const missing = requiredFns.filter((f) => !presentSet.has(f));
  if (missing.length > 0) {
    console.error(`✗ Missing helper function(s): ${missing.join(", ")}`);
    console.error(`  Run scripts/migrate-add-is-user-private-helper.ts (Session 2b)`);
    console.error(`  and scripts/migrate-add-show-publicly-helpers.ts (Session 2d) first.`);
    process.exit(1);
  }

  console.log("=== Tightening SELECT policies for privacy flags ===\n");

  await pg.query("BEGIN");
  try {
    // ── ratings ────────────────────────────────────────────────────
    await pg.query(`DROP POLICY IF EXISTS "ratings_public_read"               ON public.ratings;`);
    await pg.query(`DROP POLICY IF EXISTS "ratings_visible_to_owner_or_public" ON public.ratings;`);
    await pg.query(`
      CREATE POLICY "ratings_visible_to_owner_or_public"
        ON public.ratings
        FOR SELECT
        TO anon, authenticated
        USING (
          user_id = auth.uid()
          OR (
            NOT public.is_user_private(user_id)
            AND public.should_show_ratings_publicly(user_id)
          )
        );
    `);
    console.log("  ✓ ratings_visible_to_owner_or_public");

    // ── library_entries ────────────────────────────────────────────
    // Session 2b's existing policy already had owner-or-not-private;
    // we replace it with the same shape plus the show_library_publicly
    // gate.
    await pg.query(`DROP POLICY IF EXISTS "library_entries_visible_to_owner_or_public" ON public.library_entries;`);
    await pg.query(`
      CREATE POLICY "library_entries_visible_to_owner_or_public"
        ON public.library_entries
        FOR SELECT
        TO anon, authenticated
        USING (
          user_id = auth.uid()
          OR (
            NOT public.is_user_private(user_id)
            AND public.should_show_library_publicly(user_id)
          )
        );
    `);
    console.log("  ✓ library_entries_visible_to_owner_or_public");

    // ── reviews ────────────────────────────────────────────────────
    // NOT gated by is_user_private — only by showActivityPublicly.
    await pg.query(`DROP POLICY IF EXISTS "reviews_public_read"               ON public.reviews;`);
    await pg.query(`DROP POLICY IF EXISTS "reviews_visible_to_owner_or_public" ON public.reviews;`);
    await pg.query(`
      CREATE POLICY "reviews_visible_to_owner_or_public"
        ON public.reviews
        FOR SELECT
        TO anon, authenticated
        USING (
          user_id = auth.uid()
          OR public.should_show_activity_publicly(user_id)
        );
    `);
    console.log("  ✓ reviews_visible_to_owner_or_public");

    // follows: explicitly left as ratings_public_read style — see header.

    await pg.query("COMMIT");
    console.log("\n✓ Migration committed.\n");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("\n✗ Migration failed, rolled back:", e);
    throw e;
  }

  const { rows } = await pg.query(`
    SELECT tablename, policyname, cmd, roles, qual
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename = ANY($1::text[])
      AND cmd = 'SELECT'
    ORDER BY tablename, policyname;
  `, [["ratings", "reviews", "library_entries", "follows"]]);
  console.log("SELECT policies on affected tables:");
  console.table(rows);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
