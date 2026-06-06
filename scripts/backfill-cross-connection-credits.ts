/**
 * One-time backfill of connection_credits from existing history.
 *
 * Strict attribution requires an impression event before the
 * downstream signal. We have zero impression history pre-Stage 2b,
 * so this script walks every (user, item) library/rating row and,
 * for every connection that recommended `item` AND whose source the
 * user rated ≥4 (the loose-attribution proxy for "the user would
 * have been shown this connection in personalized mode"), applies
 * the SAME tier delta the live engine would have applied, but at
 * 50% — confidence is lower than impression-anchored signals.
 *
 * Idempotent: skips any (user, connection, item) row that already
 * exists in connection_credits.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/backfill-cross-connection-credits.ts
 *
 * Options:
 *   --dry-run   compute everything, print summary, don't write
 */
import "dotenv/config";
import { Client } from "pg";
import { SCORE_DELTAS } from "../src/lib/connection-score";

const BACKFILL_FACTOR = 0.5; // 50% of live delta
const DRY_RUN = process.argv.includes("--dry-run");

function tierFromRating(score: number, recTag: string | null): number {
  if (score <= 2 || recTag === "skip") return -1;
  if (score === 5 || recTag === "recommend") return 5;
  if (score >= 4) return 4;
  return 0;
}

function deltaForTier(tier: number): number {
  if (tier <= 0) return 0;
  return SCORE_DELTAS.downstreamTierCredits[tier as 1 | 2 | 3 | 4 | 5] ?? 0;
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const pg = new Client({ connectionString: url });
  await pg.connect();

  console.log(`\n=== Cross-connection credits backfill (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===\n`);

  // Step 1 — enumerate (user, connection, item) candidates.
  // A candidate row is created when:
  //   - the user rated the connection's source_item_id with score >= 4
  //   - the user has a library_entry or a rating for an item that
  //     appears in the connection's recommended_items JSON.
  type Cand = {
    user_id: string;
    connection_id: number;
    item_id: number;
    has_library: boolean;
    library_status: string | null;
    has_rating: boolean;
    rating_score: number | null;
    recommend_tag: string | null;
  };

  const { rows: candidates } = await pg.query<Cand>(`
    WITH source_likes AS (
      SELECT r.user_id, cc.id AS connection_id
      FROM public.ratings r
      JOIN public.cross_connections cc ON cc.source_item_id = r.item_id
      WHERE r.score >= 4
    ),
    rec_items AS (
      SELECT cc.id AS connection_id, (jsonb_array_elements(cc.recommended_items)->>'item_id')::int AS item_id
      FROM public.cross_connections cc
    ),
    pairs AS (
      SELECT DISTINCT sl.user_id, sl.connection_id, ri.item_id
      FROM source_likes sl
      JOIN rec_items ri USING (connection_id)
    )
    SELECT
      p.user_id, p.connection_id, p.item_id,
      EXISTS (
        SELECT 1 FROM public.library_entries le
        WHERE le.user_id = p.user_id AND le.item_id = p.item_id
      ) AS has_library,
      (SELECT le.status FROM public.library_entries le
       WHERE le.user_id = p.user_id AND le.item_id = p.item_id) AS library_status,
      EXISTS (
        SELECT 1 FROM public.ratings r2
        WHERE r2.user_id = p.user_id AND r2.item_id = p.item_id
      ) AS has_rating,
      (SELECT r2.score FROM public.ratings r2
       WHERE r2.user_id = p.user_id AND r2.item_id = p.item_id) AS rating_score,
      (SELECT r2.recommend_tag FROM public.ratings r2
       WHERE r2.user_id = p.user_id AND r2.item_id = p.item_id) AS recommend_tag
    FROM pairs p
    WHERE EXISTS (
      SELECT 1 FROM public.library_entries le
      WHERE le.user_id = p.user_id AND le.item_id = p.item_id
    ) OR EXISTS (
      SELECT 1 FROM public.ratings r2
      WHERE r2.user_id = p.user_id AND r2.item_id = p.item_id
    );
  `);

  console.log(`  found ${candidates.length} (user, connection, item) candidate triples\n`);

  let toCredit = 0;
  let skippedExisting = 0;
  let skippedNoTier = 0;
  let netDelta = 0;
  const perConnection = new Map<number, number>();

  // Step 2 — for each candidate, compute the tier + delta.
  for (const c of candidates) {
    // Skip if a credit row already exists.
    const { rows: existing } = await pg.query<{ tier: number }>(
      `SELECT tier FROM public.connection_credits
       WHERE user_id=$1 AND connection_id=$2 AND item_id=$3 AND signal_class='downstream'`,
      [c.user_id, c.connection_id, c.item_id],
    );
    if (existing.length > 0) { skippedExisting++; continue; }

    // Determine the tier: highest of (library_status, rating) and whether negative.
    let tier = 0;
    if (c.has_library) {
      tier = Math.max(tier, c.library_status === "completed" || c.library_status === "caught_up" ? 3 : 2);
    }
    if (c.has_rating) {
      const rTier = tierFromRating(c.rating_score ?? 0, c.recommend_tag ?? null);
      if (rTier > tier || rTier === -1) tier = rTier;
    }
    if (tier === 0) { skippedNoTier++; continue; }

    const rawDelta = tier === -1 ? SCORE_DELTAS.ratingNegative : deltaForTier(tier);
    const delta = rawDelta * BACKFILL_FACTOR;
    if (delta === 0) { skippedNoTier++; continue; }

    toCredit++;
    netDelta += delta;
    perConnection.set(c.connection_id, (perConnection.get(c.connection_id) ?? 0) + delta);

    if (!DRY_RUN) {
      // Apply
      await pg.query(
        `INSERT INTO public.connection_credits (user_id, connection_id, item_id, signal_class, tier, delta_applied, updated_at)
         VALUES ($1, $2, $3, 'downstream', $4, $5, now())
         ON CONFLICT DO NOTHING`,
        [c.user_id, c.connection_id, c.item_id, tier, delta],
      );
      await pg.query(
        `UPDATE public.cross_connections
         SET quality_score = LEAST(2.0, GREATEST(0.0, quality_score + $1))
         WHERE id = $2`,
        [delta, c.connection_id],
      );
    }
  }

  console.log(`\nSummary:`);
  console.log(`  candidates:       ${candidates.length}`);
  console.log(`  would credit:     ${toCredit}`);
  console.log(`  skipped (existing credit): ${skippedExisting}`);
  console.log(`  skipped (no qualifying tier): ${skippedNoTier}`);
  console.log(`  net delta sum:    ${netDelta.toFixed(3)}`);
  if (perConnection.size > 0) {
    console.log(`  per-connection deltas:`);
    for (const [cid, d] of [...perConnection.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`    connection ${cid}: ${d > 0 ? "+" : ""}${d.toFixed(3)}`);
    }
  }
  console.log(`\n${DRY_RUN ? "(dry run — no writes performed)" : "✓ backfill complete"}\n`);

  await pg.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
