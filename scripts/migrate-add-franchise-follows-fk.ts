/**
 * migrate-add-franchise-follows-fk.ts (Wave 1 Red 3)
 *
 * Adds the missing FK public.franchise_follows.franchise_id →
 * public.franchises(id) ON DELETE CASCADE. Prisma declares the
 * relation but the live DB never had the FK, meaning:
 *   - INSERTs with bogus franchise_id values would succeed silently
 *   - Deleting a franchise would leave orphan rows in franchise_follows
 *
 * Pre-check: zero orphan rows (any franchise_id with no parent in
 * public.franchises). If orphans exist, refuse to apply.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-add-franchise-follows-fk.ts
 *
 * Idempotent.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE public.franchise_follows
 *     DROP CONSTRAINT franchise_follows_franchise_id_fkey;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

const CONSTRAINT_NAME = "franchise_follows_franchise_id_fkey";

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== Add franchise_follows FK on franchise_id ===\n");

  const { rows: existing } = await pg.query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.franchise_follows'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (franchise_id)%'
  `);
  if (existing.length > 0) {
    console.log(`  ⏭  ${CONSTRAINT_NAME} already present — nothing to do.`);
    await pg.end();
    return;
  }

  const { rows: orphans } = await pg.query(`
    SELECT ff.franchise_id, COUNT(*)::int c
    FROM public.franchise_follows ff
    LEFT JOIN public.franchises f ON f.id = ff.franchise_id
    WHERE f.id IS NULL
    GROUP BY ff.franchise_id
  `);
  if (orphans.length > 0) {
    console.error(`  ✗ Pre-check FAILED: ${orphans.length} orphan franchise_id values.`);
    for (const o of orphans.slice(0, 10)) console.error(`     franchise_id=${o.franchise_id} (${o.c} rows)`);
    console.error("  Resolve orphans first (DELETE or fix franchise_id references).");
    await pg.end();
    process.exit(1);
  }
  console.log("  ✓ pre-check: 0 orphan rows");

  await pg.query("BEGIN");
  try {
    await pg.query(`
      ALTER TABLE public.franchise_follows
      ADD CONSTRAINT ${CONSTRAINT_NAME}
      FOREIGN KEY (franchise_id) REFERENCES public.franchises(id) ON DELETE CASCADE;
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
    WHERE conrelid = 'public.franchise_follows'::regclass AND contype = 'f'
    ORDER BY conname
  `);
  console.log("  Final FKs on franchise_follows:");
  for (const v of verify) console.log("    " + v.def);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
