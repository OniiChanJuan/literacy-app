/**
 * Backfill ext.mal scores for anime items that have malId but no MAL score.
 *
 * These are items imported from TMDB that were later cross-referenced with MAL.
 * They have malId set but never got ext.mal populated.
 *
 * Fetches from Jikan API (MAL unofficial API) — rate limited to 3 req/sec.
 *
 * Run: npx tsx scripts/backfill-mal-scores.ts
 * Run with limit: npx tsx scripts/backfill-mal-scores.ts --limit=100
 * Safe to re-run — skips items that already have ext.mal.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

const JIKAN_BASE = "https://api.jikan.moe/v4";
const DELAY_MS = 350; // ~3 req/sec, safe for Jikan

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : 9999;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchMalScore(malId: number, type: "anime" | "manga"): Promise<number | null> {
  const url = `${JIKAN_BASE}/${type}/${malId}`;
  try {
    const res = await fetch(url);
    if (res.status === 429) {
      console.warn(`  Rate limited, waiting 2s...`);
      await sleep(2000);
      return fetchMalScore(malId, type);
    }
    if (!res.ok) return null;
    const data = await res.json();
    const score = data?.data?.score;
    return typeof score === "number" ? score : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== Backfill: ext.mal scores for items with malId but no MAL score ===\n");

  // Find items with malId but no ext.mal
  const candidates = await prisma.$queryRaw<{ id: number; title: string; type: string; mal_id: number; ext: any }[]>`
    SELECT id, title, type, mal_id, ext
    FROM items
    WHERE mal_id IS NOT NULL
      AND type IN ('tv', 'movie', 'manga')
      AND (ext->>'mal' IS NULL OR ext->>'mal' = '')
      AND parent_item_id IS NULL
    ORDER BY vote_count DESC NULLS LAST
    LIMIT ${LIMIT}
  `;

  console.log(`Found ${candidates.length} items with malId but no ext.mal score`);
  if (LIMIT < 9999) console.log(`(Limited to first ${LIMIT})`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const item of candidates) {
    await sleep(DELAY_MS);

    // Determine Jikan endpoint type
    const jikanType = item.type === "manga" ? "manga" : "anime";
    const score = await fetchMalScore(item.mal_id, jikanType);

    if (score === null) {
      notFound++;
      if (notFound <= 10) console.log(`  ✗ [${item.id}] ${item.title} — no score returned`);
      continue;
    }

    // Update ext JSON to add mal score
    const currentExt = (item.ext as Record<string, any>) || {};
    const newExt = { ...currentExt, mal: score };

    try {
      await prisma.item.update({
        where: { id: item.id },
        data: { ext: newExt },
      });
      updated++;
      if (updated <= 20 || updated % 50 === 0) {
        console.log(`  ✓ [${item.id}] ${item.title} → ext.mal = ${score}`);
      }
    } catch {
      errors++;
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`  Updated: ${updated} items now have ext.mal score`);
  console.log(`  Not found (no score from Jikan): ${notFound}`);
  console.log(`  Errors: ${errors}`);
  console.log(`\nRe-run with --limit=N to process in batches.`);
  console.log(`Jikan rate limit: 60 req/min. Full run of ~1600 items ≈ 10 minutes.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
