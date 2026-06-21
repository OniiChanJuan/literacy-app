/**
 * One-time data fix — google_books external_scores scale (0–5 → 0–10).
 *
 * Live bug: `ext.google_books` is stored on the canonical 0–10 scale
 * (averageRating × 2), but the `external_scores` table copy was written on the
 * raw 0–5 scale with max_score=5. The desktop detail pill reads the table and
 * renders the 0–5 value with a "/10" suffix → books showed ~half their real
 * value on the live site.
 *
 * Verified before writing (scripts/_probe-gbooks-scale.ts):
 *   - all 1,998 google_books rows are uniformly 0–5 with max_score=5,
 *   - ext.google_books == table.score × 2 for every row (0 mismatches),
 *   so re-syncing each row from the canonical ext value is exact and safe.
 *
 * Mechanism: for each google_books row with max_score=5, set
 *   score = ext.google_books (== old score × 2), max_score = 10.
 * Idempotent (skips rows already at max_score=10). Reversible: score ÷ 2,
 * max_score → 5. A backup of the pre-change rows is written to
 * scripts/_gbooks-scale-backup.json.
 *
 * Run:  npx tsx scripts/fix-gbooks-score-scale.ts            (apply)
 *       npx tsx scripts/fix-gbooks-score-scale.ts --dry-run  (report only)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { writeFileSync } from 'fs';

const DRY = process.argv.includes('--dry-run');
const connUrl = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows: Array<{ id: number; item_id: number; score: number; max_score: number; ext_v: number | null }> =
    await prisma.$queryRawUnsafe(`
      SELECT e.id, e.item_id, e.score, e.max_score, (i.ext->>'google_books')::float AS ext_v
      FROM external_scores e JOIN items i ON i.id = e.item_id
      WHERE e.source = 'google_books'
    `);

  const broken = rows.filter((r) => r.max_score === 5);
  const already = rows.filter((r) => r.max_score === 10);
  console.log(`google_books rows: ${rows.length}  | to fix (max=5): ${broken.length}  | already 0–10: ${already.length}`);

  // Safety: every broken row must have ext == score*2 (confirmed in probe).
  const unsafe = broken.filter((r) => r.ext_v == null || Math.abs(r.ext_v - r.score * 2) > 0.05);
  if (unsafe.length > 0) {
    console.error(`ABORT: ${unsafe.length} rows where ext != score*2 — not safe to re-sync. Sample:`);
    unsafe.slice(0, 10).forEach((r) => console.error(`  item ${r.item_id}: tbl=${r.score} ext=${r.ext_v}`));
    await prisma.$disconnect();
    process.exit(1);
  }

  if (broken.length === 0) {
    console.log('Nothing to fix (idempotent — already applied).');
    await prisma.$disconnect();
    return;
  }

  // Backup the pre-change rows for reversibility.
  writeFileSync(
    'scripts/_gbooks-scale-backup.json',
    JSON.stringify(broken.map((r) => ({ id: r.id, item_id: r.item_id, score: r.score, max_score: r.max_score })), null, 2)
  );
  console.log(`Backed up ${broken.length} rows → scripts/_gbooks-scale-backup.json`);

  if (DRY) {
    console.log('\n--dry-run: no writes. Sample of intended changes:');
    broken.slice(0, 8).forEach((r) =>
      console.log(`  item ${r.item_id}: ${r.score}/5  →  ${r.ext_v}/10`));
    await prisma.$disconnect();
    return;
  }

  // Apply in chunks. score := ext (canonical 0–10), max_score := 10.
  let done = 0;
  for (const r of broken) {
    await prisma.$executeRawUnsafe(
      `UPDATE external_scores SET score = $1, max_score = 10, updated_at = now() WHERE id = $2`,
      r.ext_v, r.id
    );
    done++;
    if (done % 250 === 0) console.log(`  ...${done}/${broken.length}`);
  }
  console.log(`Updated ${done} rows.`);

  // Verify
  const [after]: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS n, MIN(max_score) AS minmax, MAX(max_score) AS maxmax,
           ROUND(MIN(score)::numeric,2) AS mn, ROUND(MAX(score)::numeric,2) AS mx
    FROM external_scores WHERE source='google_books'`);
  console.log(`After: rows=${after.n} max_score ${after.minmax}..${after.maxmax} score ${after.mn}..${after.mx}`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
