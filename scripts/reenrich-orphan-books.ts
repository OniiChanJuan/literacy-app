/**
 * reenrich-orphan-books.ts — CLI driver for orphan-book re-enrichment.
 *
 * Thin wrapper over src/lib/reenrich-orphans.ts (the reusable bounded-batch
 * core, which a future /api/cron/reenrich-orphans route will share). This CLI
 * adds: .env.local loading, a resumable progress file, the multi-day quota
 * backoff loop (1min → 10min → stop for the day), and progress logging.
 *
 * Usage:
 *   npx tsx scripts/reenrich-orphan-books.ts                       # full walk (resumes)
 *   npx tsx scripts/reenrich-orphan-books.ts --max=100             # cap this run
 *   npx tsx scripts/reenrich-orphan-books.ts --max=100 --include-ids=25507  # seed Babel into the test
 *   npx tsx scripts/reenrich-orphan-books.ts --dry-run             # report, write nothing
 *   npx tsx scripts/reenrich-orphan-books.ts --reset               # ignore/clear progress file
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import * as fs from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { reenrichOrphanBatch, type ReenrichSummary } from "../src/lib/reenrich-orphans";

const argv = process.argv.slice(2);
const arg = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const MAX = parseInt(arg("max") ?? "0") || 0;
const DRY_RUN = argv.includes("--dry-run");
const RESET = argv.includes("--reset");
const RESUME = !argv.includes("--no-resume"); // default on
const INCLUDE_IDS = (arg("include-ids") ?? "").split(",").map((s) => parseInt(s.trim())).filter((n) => Number.isInteger(n) && n > 0);

const PROGRESS_FILE = ".reenrich-progress.json";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Progress { lastProcessedId: number; totals: Totals; updatedAt: string }
interface Totals { processed: number; enriched: number; withGenre: number; notFound: number; skippedNoIsbn: number }
const zero = (): Totals => ({ processed: 0, enriched: 0, withGenre: 0, notFound: 0, skippedNoIsbn: 0 });

function loadProgress(): Progress | null {
  if (RESET || !RESUME) { try { fs.unlinkSync(PROGRESS_FILE); } catch { /* none */ } return null; }
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")) as Progress; } catch { return null; }
}
function saveProgress(p: Progress) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2)); }

const connUrl = process.env.DATABASE_URL;
if (!connUrl) { console.error("DATABASE_URL not set (expected in .env.local). Aborting."); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connUrl }) } as any);

async function main() {
  console.log(`📖 Orphan book re-enrichment${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`   max=${MAX || "unlimited"} resume=${RESUME} reset=${RESET} include-ids=[${INCLUDE_IDS.join(",")}]\n`);

  const prior = loadProgress();
  const totals: Totals = prior?.totals ?? zero();
  let startAfterId = prior?.lastProcessedId ?? 0;
  if (prior) console.log(`   Resuming from id>${startAfterId} (prior: ${totals.enriched} enriched, ${totals.notFound} not-found)\n`);

  let remaining = MAX > 0 ? MAX : Infinity;
  let forceIdsForBatch = INCLUDE_IDS;
  let consecutiveQuota = 0;

  const onProgress = (s: ReenrichSummary) => {
    if (s.processed > 0 && s.processed % 50 === 0) {
      console.log(`  [reenrich] processed=${totals.processed + s.processed} enriched=${totals.enriched + s.enriched} not-found=${totals.notFound + s.notFound} no-isbn=${totals.skippedNoIsbn + s.skippedNoIsbn} quota-stopped=${s.quotaHit ? 1 : 0}`);
    }
    if (s.processed > 0 && s.processed % 500 === 0) {
      console.log(`  … running tally: ${totals.enriched + s.enriched} enriched / ${totals.withGenre + s.withGenre} with-genre this run`);
    }
  };

  while (remaining > 0) {
    const batchMax = remaining === Infinity ? 0 : remaining;
    const s = await reenrichOrphanBatch(prisma, {
      maxItems: batchMax, startAfterId, forceIds: forceIdsForBatch, dryRun: DRY_RUN, onProgress,
    });
    forceIdsForBatch = []; // only the first batch is seeded

    totals.processed += s.processed; totals.enriched += s.enriched; totals.withGenre += s.withGenre;
    totals.notFound += s.notFound; totals.skippedNoIsbn += s.skippedNoIsbn;
    startAfterId = s.lastProcessedId;
    if (remaining !== Infinity) remaining -= s.processed;
    if (!DRY_RUN) saveProgress({ lastProcessedId: startAfterId, totals, updatedAt: new Date().toISOString() });

    if (s.quotaHit) {
      consecutiveQuota++;
      if (consecutiveQuota >= 3) { console.log(`\n⛔ Google Books quota hit 3× in a row — stopping for the day. Resume tomorrow (cursor id>${startAfterId}).`); break; }
      const waitMs = consecutiveQuota === 1 ? 60_000 : 600_000;
      console.log(`\n⏳ Quota hit (#${consecutiveQuota}) at id>${startAfterId} — backing off ${waitMs / 1000}s, then resuming...`);
      await sleep(waitMs);
      continue;
    }

    // Non-quota return ⇒ batch ran to completion (exhausted) or hit the cap.
    consecutiveQuota = 0;
    if (s.processed === 0) { console.log("\n✅ No more orphan books to process."); break; }
    if (batchMax === 0) { console.log("\n✅ Processed all remaining orphan targets."); break; }
    if (s.processed < batchMax) { console.log("\n✅ No more orphan books within range."); break; }
    console.log(`\n✅ Reached --max=${MAX}.`); break;
  }

  console.log("\n══════════════════════════════════════════");
  console.log(`📊 Re-enrichment run summary${DRY_RUN ? " (DRY RUN — nothing written)" : ""}`);
  console.log(`   processed:        ${totals.processed}`);
  console.log(`   enriched:         ${totals.enriched}  (of which ${totals.withGenre} got real genres)`);
  console.log(`   not found:        ${totals.notFound}`);
  console.log(`   skipped (no isbn):${totals.skippedNoIsbn}`);
  console.log(`   cursor (id>):     ${startAfterId}`);
  console.log(`\n   Enriched books had itemDimensions set NULL — run calculate-dimensions.ts later to re-vector them.`);
}

main().catch((e) => { console.error("Fatal:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
