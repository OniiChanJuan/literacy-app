/**
 * normalize-google-books-scale.ts — one-shot ext.google_books rescale to the
 * canonical 0-10 scale (Google's 0-5 stars × 2).
 *
 * v2 — deterministic from source data, NOT a value heuristic. The v1 heuristic
 * ("≤5 → ×2") was not idempotent: a true 0-5 value ≤2.5 doubles into the
 * detection zone and gets doubled again on re-run (87 rows were corrupted this
 * way during verification; this version repairs them).
 *
 * Strategy, per row holding ext.google_books:
 *   1. Item has an external_scores row (source='google_books', stored 0-5,
 *      self-described via maxScore) → authoritative: ext = min(score×2, 10).
 *   2. No scores row, itemDimensions IS NULL → written by the orphan
 *      re-enrichment, which always writes 0-10 → leave untouched.
 *   3. No scores row, dims present → refetch the volume from Google Books by
 *      googleBooksId and set ext = min(averageRating×2, 10). Falls back to
 *      "≤5 → ×2, else leave" only if the item has no volume id or the fetch
 *      fails (logged as UNVERIFIED).
 *
 * Paths 1-3 are all deterministic functions of source data, so the script is
 * genuinely idempotent: re-running converges to the same values.
 *
 * Usage:
 *   npx tsx scripts/normalize-google-books-scale.ts --dry-run
 *   npx tsx scripts/normalize-google-books-scale.ts
 *
 * Path 3 spends ~1 Google Books request per no-scores-row item (~100 total).
 * DELETE this script after a verified run.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function setVal(id: number, newVal: number, oldVal: number): Promise<boolean> {
  if (Math.abs(newVal - oldVal) <= 0.05) return false; // already correct
  if (!DRY_RUN) {
    await prisma.$executeRaw`
      UPDATE items SET ext = jsonb_set(ext, '{google_books}', to_jsonb(${newVal}::float))
      WHERE id = ${id}`;
  }
  return true;
}

async function main() {
  console.log(`📏 ext.google_books normalization v2${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const rows = await prisma.$queryRaw<Array<{
    id: number; val: number; dimsNull: boolean; esScore: number | null; gbid: string | null;
  }>>`
    SELECT i.id, (i.ext->>'google_books')::float AS val,
           (i.item_dimensions IS NULL) AS "dimsNull",
           es.score AS "esScore", i.google_books_id AS gbid
    FROM items i
    LEFT JOIN external_scores es ON es.item_id = i.id AND es.source = 'google_books'
    WHERE i.ext ? 'google_books' ORDER BY i.id`;

  let fromScoresRow = 0, alreadyCorrect = 0, reenrichSkipped = 0,
      refetched = 0, refetchMiss = 0, unverified = 0;

  for (const r of rows) {
    // Path 1 — authoritative external_scores row (0-5 self-described)
    if (r.esScore !== null) {
      const target = Math.min(Math.round(r.esScore * 2 * 10) / 10, 10);
      if (await setVal(r.id, target, r.val)) fromScoresRow++; else alreadyCorrect++;
      continue;
    }
    // Path 2 — re-enrichment rows already write canonical 0-10
    if (r.dimsNull) { reenrichSkipped++; continue; }
    // Path 3 — refetch from Google by volume id
    if (r.gbid) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(r.gbid)}?key=${process.env.GOOGLE_BOOKS_API_KEY}`
        );
        await sleep(300);
        if (res.ok) {
          const data = await res.json();
          const avg = data?.volumeInfo?.averageRating;
          if (typeof avg === "number" && avg > 0) {
            const target = Math.min(Math.round(avg * 2 * 10) / 10, 10);
            if (await setVal(r.id, target, r.val)) refetched++; else alreadyCorrect++;
            continue;
          }
        }
        refetchMiss++;
      } catch { refetchMiss++; }
    }
    // Last resort — heuristic, logged
    if (r.val <= 5.0) {
      await setVal(r.id, Math.min(Math.round(r.val * 2 * 10) / 10, 10), r.val);
      unverified++;
      console.log(`  UNVERIFIED ×2: id=${r.id} ${r.val} -> ${Math.min(r.val * 2, 10)}`);
    } else {
      unverified++;
      console.log(`  UNVERIFIED left as-is (no source, >5): id=${r.id} val=${r.val}`);
    }
  }

  console.log(`\nrows with ext.google_books:    ${rows.length}`);
  console.log(`  fixed from external_scores:  ${fromScoresRow}${DRY_RUN ? " (would be)" : ""}`);
  console.log(`  already correct:             ${alreadyCorrect}`);
  console.log(`  skipped (re-enrich, dims NULL): ${reenrichSkipped}`);
  console.log(`  fixed via Google refetch:    ${refetched}${DRY_RUN ? " (would be)" : ""}`);
  console.log(`  refetch returned no rating:  ${refetchMiss}`);
  console.log(`  unverified (heuristic/left): ${unverified}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
