/**
 * migrate-tighten-cross-connections-not-null.ts (Wave 1 Yellow 5)
 *
 * Adds NOT NULL to public.cross_connections.theme_tags, created_by,
 * quality_score, and created_at to match Prisma's declarations.
 * Latent correctness: Prisma reads these as non-null, so any null row
 * would deserialize wrong or throw.
 *
 * Pre-check: zero nulls in any of the 4 columns. If any nulls exist,
 * report which columns and refuse to apply this migration (the others
 * in Wave 1 still proceed independently).
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/migrate-tighten-cross-connections-not-null.ts
 *
 * Idempotent — skips columns that are already NOT NULL.
 *
 * ─── Rollback ────────────────────────────────────────────────────────
 *   ALTER TABLE public.cross_connections
 *     ALTER COLUMN theme_tags     DROP NOT NULL,
 *     ALTER COLUMN created_by     DROP NOT NULL,
 *     ALTER COLUMN quality_score  DROP NOT NULL,
 *     ALTER COLUMN created_at     DROP NOT NULL;
 * ────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { Client } from "pg";

const COLUMNS = ["theme_tags", "created_by", "quality_score", "created_at"];

async function main() {
  const pg = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  await pg.connect();

  console.log("=== Tighten cross_connections NOT NULLs ===\n");

  // Per-column current nullable state
  const { rows: cols } = await pg.query(
    `SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='cross_connections' AND column_name = ANY($1::text[])`,
    [COLUMNS],
  );
  const needsTighten = cols.filter((c: any) => c.is_nullable === "YES").map((c: any) => c.column_name);
  if (needsTighten.length === 0) {
    console.log("  ⏭  all 4 columns already NOT NULL — nothing to do.");
    await pg.end();
    return;
  }
  console.log(`  ${needsTighten.length} columns need tightening: ${needsTighten.join(", ")}`);

  // Pre-check: null counts per column-to-tighten
  const nullCountsExpr = needsTighten
    .map((c) => `COUNT(*) FILTER (WHERE "${c}" IS NULL)::int AS "${c}"`)
    .join(", ");
  const { rows: nullRows } = await pg.query(
    `SELECT ${nullCountsExpr} FROM public.cross_connections`,
  );
  const nulls = nullRows[0] as Record<string, number>;
  const blocking = Object.entries(nulls).filter(([_, n]) => n > 0);
  if (blocking.length > 0) {
    console.error(`  ✗ Pre-check FAILED: nulls present in ${blocking.map(([c, n]) => `${c}(${n})`).join(", ")}`);
    console.error("  Migration skipped — resolve nulls manually before retrying.");
    await pg.end();
    process.exit(1);
  }
  console.log("  ✓ pre-check: 0 nulls in all 4 columns");

  await pg.query("BEGIN");
  try {
    const setClauses = needsTighten.map((c) => `ALTER COLUMN "${c}" SET NOT NULL`).join(", ");
    await pg.query(`ALTER TABLE public.cross_connections ${setClauses};`);
    await pg.query("COMMIT");
    console.log(`  ✓ tightened: ${needsTighten.join(", ")}`);
  } catch (e) {
    await pg.query("ROLLBACK");
    console.error("  ✗ Failed, rolled back:", e);
    throw e;
  }

  const { rows: verify } = await pg.query(
    `SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='cross_connections' AND column_name = ANY($1::text[])
     ORDER BY column_name`,
    [COLUMNS],
  );
  console.log("  Final state:");
  for (const v of verify) console.log(`    ${v.column_name}: nullable=${v.is_nullable}`);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
