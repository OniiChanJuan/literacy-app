/**
 * migrate-add-user-tag-suggestions-unique.ts (Wave 1 Red 2)
 *
 * Adds the missing composite UNIQUE on
 * public.user_tag_suggestions(user_id, item_id, tag_slug). The Prisma
 * schema declares @@unique([userId, itemId, tagSlug]) but the live DB
 * was missing the constraint, causing
 * prisma.userTagSuggestion.upsert(...) to throw 42P10 and silently
 * breaking POST /api/tags (tag suggestions never persisted).
 *
 * Pre-check: zero duplicates on the would-be unique key (with NULL
 * filtering since NULLs are not constrained by UNIQUE in Postgres).
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-add-user-tag-suggestions-unique.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE public.user_tag_suggestions
 *     DROP CONSTRAINT user_tag_suggestions_user_id_item_id_tag_slug_key;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

const CONSTRAINT_NAME = "user_tag_suggestions_user_id_item_id_tag_slug_key";

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== Add user_tag_suggestions UNIQUE ===\n");

  const { rows: existing } = await pg.query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_tag_suggestions'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%(user_id, item_id, tag_slug)%'
  `);
  if (existing.length > 0) {
    console.log(`  ⏭  ${CONSTRAINT_NAME} already present — nothing to do.`);
    await pg.end();
    return;
  }

  const { rows: dups } = await pg.query(`
    SELECT user_id, item_id, tag_slug, COUNT(*)::int c
    FROM public.user_tag_suggestions
    WHERE user_id IS NOT NULL AND item_id IS NOT NULL AND tag_slug IS NOT NULL
    GROUP BY user_id, item_id, tag_slug
    HAVING COUNT(*) > 1
  `);
  if (dups.length > 0) {
    console.error(`  ✗ Pre-check FAILED: ${dups.length} duplicate triples found.`);
    for (const d of dups.slice(0, 5)) console.error(`     ${JSON.stringify(d)}`);
    await pg.end();
    process.exit(1);
  }
  console.log("  ✓ pre-check: 0 duplicates");

  await pg.query("BEGIN");
  try {
    await pg.query(`
      ALTER TABLE public.user_tag_suggestions
      ADD CONSTRAINT ${CONSTRAINT_NAME} UNIQUE (user_id, item_id, tag_slug);
    `);
    await pg.query("COMMIT");
    console.log(`  ✓ ${CONSTRAINT_NAME} created`);
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("  ✗ Failed, rolled back:", e);
    throw e;
  }

  const { rows: verify } = await pg.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.user_tag_suggestions'::regclass AND contype = 'u'
  `);
  console.log("  Final UNIQUE constraints:");
  for (const v of verify) console.log("    " + v.def);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
