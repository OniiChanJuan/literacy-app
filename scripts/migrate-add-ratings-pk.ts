/**
 * migrate-add-ratings-pk.ts (Wave 1 Red 1)
 *
 * Adds the missing composite PRIMARY KEY on public.ratings(user_id,
 * item_id). The Prisma schema has always declared @@id([userId, itemId])
 * but the live DB was missing the constraint — making
 * prisma.rating.upsert(...) throw 42P10 and breaking the entire
 * star-rating + recommend-tag persistence path (and downstream review
 * posting, since reviews require a rating to exist server-side).
 *
 * Pre-check: zero rows in (user_id, item_id) duplicate groups. If any
 * duplicates exist, refuse to apply.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-add-ratings-pk.ts
 *
 * Idempotent — exits cleanly if the constraint already exists.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE public.ratings DROP CONSTRAINT ratings_pkey;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== Add ratings PK ===\n");

  // Idempotency check
  const { rows: existing } = await pg.query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ratings'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) LIKE '%(user_id, item_id)%'
  `);
  if (existing.length > 0) {
    console.log("  ⏭  ratings_pkey already present — nothing to do.");
    await pg.end();
    return;
  }

  // Pre-check
  const { rows: dups } = await pg.query(`
    SELECT user_id, item_id, COUNT(*)::int c
    FROM public.ratings
    GROUP BY user_id, item_id
    HAVING COUNT(*) > 1
  `);
  if (dups.length > 0) {
    console.error(`  ✗ Pre-check FAILED: ${dups.length} duplicate (user_id, item_id) pairs found.`);
    for (const d of dups.slice(0, 5)) console.error(`     ${JSON.stringify(d)}`);
    console.error("  Refusing to apply. Resolve duplicates manually first.");
    await pg.end();
    process.exit(1);
  }
  console.log("  ✓ pre-check: 0 duplicates");

  // Apply
  await pg.query("BEGIN");
  try {
    await pg.query(`ALTER TABLE public.ratings ADD CONSTRAINT ratings_pkey PRIMARY KEY (user_id, item_id);`);
    await pg.query("COMMIT");
    console.log("  ✓ ratings_pkey created");
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("  ✗ Failed, rolled back:", e);
    throw e;
  }

  // Verify
  const { rows: verify } = await pg.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.ratings'::regclass AND contype = 'p'
  `);
  console.log("  Final PK:", verify[0]?.def);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
