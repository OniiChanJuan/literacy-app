/**
 * migrate-tighten-items-genre-vibes-not-null.ts (Wave 1 Yellow 9)
 *
 * Sets public.items.genre and public.items.vibes to NOT NULL with
 * DEFAULT '{}'::text[] (already declared as non-null in Prisma).
 * Backfills any existing NULLs to '{}' first.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tighten-items-genre-vibes-not-null.ts
 *
 * Idempotent — tightens each column independently if it isn't
 * already NOT NULL.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE public.items
 *     ALTER COLUMN genre DROP NOT NULL,
 *     ALTER COLUMN vibes DROP NOT NULL;
 *   (Defaults can stay — having a default doesn't break anything.)
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

const TARGETS = ["genre", "vibes"];

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== Tighten items.genre/vibes to NOT NULL with default '{}' ===\n");

  // Per-column nullable state
  const { rows: state } = await pg.query(
    `SELECT column_name, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='items' AND column_name = ANY($1::text[])`,
    [TARGETS],
  );
  const stateMap = new Map<string, any>(state.map((r: any) => [r.column_name, r]));
  const needsTighten = TARGETS.filter((c) => stateMap.get(c)?.is_nullable === "YES");
  if (needsTighten.length === 0) {
    console.log("  ⏭  both columns already NOT NULL — nothing to do.");
    await pg.end();
    return;
  }

  // Backfill nulls
  const { rows: counts } = await pg.query(
    `SELECT
       COUNT(*) FILTER (WHERE genre IS NULL)::int AS g,
       COUNT(*) FILTER (WHERE vibes IS NULL)::int AS v
     FROM public.items`,
  );
  console.log(`  null counts: genre=${counts[0].g} vibes=${counts[0].v}`);

  await pg.query("BEGIN");
  try {
    if (counts[0].g > 0) {
      const up = await pg.query(`UPDATE public.items SET genre = '{}'::text[] WHERE genre IS NULL`);
      console.log(`  ✓ backfilled ${up.rowCount} rows for genre`);
    }
    if (counts[0].v > 0) {
      const up = await pg.query(`UPDATE public.items SET vibes = '{}'::text[] WHERE vibes IS NULL`);
      console.log(`  ✓ backfilled ${up.rowCount} rows for vibes`);
    }
    const clauses = needsTighten
      .map((c) => `ALTER COLUMN "${c}" SET NOT NULL, ALTER COLUMN "${c}" SET DEFAULT '{}'::text[]`)
      .join(", ");
    await pg.query(`ALTER TABLE public.items ${clauses};`);
    await pg.query("COMMIT");
    console.log(`  ✓ tightened: ${needsTighten.join(", ")}`);
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("  ✗ Failed, rolled back:", e);
    throw e;
  }

  const { rows: verify } = await pg.query(
    `SELECT column_name, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='items' AND column_name = ANY($1::text[])
     ORDER BY column_name`,
    [TARGETS],
  );
  console.log("  Final state:");
  for (const v of verify) console.log(`    ${v.column_name}: nullable=${v.is_nullable} default=${v.column_default}`);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
