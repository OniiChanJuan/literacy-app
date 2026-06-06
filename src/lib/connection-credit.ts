/**
 * Downstream-signal credit engine for cross_connections.quality_score.
 *
 * Public entrypoints used by the rest of the app:
 *
 *   creditDownstream({ userId, itemId, signal })
 *     - Called after a user adds an item to library / changes status to
 *       completed / rates an item / removes a library entry.
 *     - Looks up which (if any) connections recommended `itemId` AND
 *       had a recent impression for this user (within the attribution
 *       window). For each, computes the tier delta vs. the existing
 *       credit ledger, applies the diff to quality_score (clamped),
 *       and updates the ledger.
 *     - Idempotent within a tier: re-firing the same tier is a no-op.
 *     - Fire-and-forget from the caller — failures are swallowed.
 *
 * The single source of truth for the tier ladder + per-tier deltas
 * lives in src/lib/connection-score.ts.
 */
import { prisma } from "./prisma";
import {
  SCORE_DELTAS,
  ATTRIBUTION_WINDOWS,
  EARLY_DATA_THRESHOLD,
  dampener,
} from "./connection-score";

export type DownstreamSignal =
  | { kind: "cover_click" }                       // tier 1
  | { kind: "library_add" }                       // tier 2
  | { kind: "library_completed" }                 // tier 3
  | { kind: "rating"; score: number; recommendTag: string | null }
  | { kind: "library_deleted" };                  // reversal

function signalToTier(signal: DownstreamSignal): { tier: number; isReversal?: boolean; isNegativeRating?: boolean } {
  switch (signal.kind) {
    case "cover_click": return { tier: 1 };
    case "library_add": return { tier: 2 };
    case "library_completed": return { tier: 3 };
    case "rating": {
      if (signal.score <= 2 || signal.recommendTag === "skip") {
        // Negative rating — special case. We do NOT advance the tier
        // ladder; we apply a single fixed negative delta once per
        // (user, connection, item).
        return { tier: -1, isNegativeRating: true };
      }
      if (signal.score === 5 || signal.recommendTag === "recommend") return { tier: 5 };
      if (signal.score >= 4) return { tier: 4 };
      // score 3 with no recommend tag: no credit, no penalty.
      return { tier: 0 };
    }
    case "library_deleted": return { tier: 0, isReversal: true };
  }
}

/** Computes the cumulative delta a credit row at `tier` should hold. */
function deltaForTier(tier: number): number {
  if (tier <= 0) return 0;
  return SCORE_DELTAS.downstreamTierCredits[tier as 1 | 2 | 3 | 4 | 5] ?? 0;
}

/**
 * Find connections that include `itemId` as a recommended item AND have
 * an impression (or cover_click) for `userId` in the attribution window.
 * Returns connection IDs.
 *
 * Uses raw SQL because recommended_items is a JSONB column and Prisma
 * doesn't have first-class JSON path filtering. Indexed on
 * connection_events for efficiency.
 */
async function findAttributedConnections(
  userId: string,
  itemId: number,
  windowDays: number,
): Promise<number[]> {
  type Row = { connection_id: number };
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    SELECT DISTINCT e.connection_id
    FROM public.connection_events e
    JOIN public.cross_connections c ON c.id = e.connection_id
    WHERE e.user_id = $1::uuid
      AND e.created_at >= now() - ($2::int || ' days')::interval
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(c.recommended_items) AS r
        WHERE (r->>'item_id')::int = $3::int
      )
    `,
    userId,
    windowDays,
    itemId,
  );
  return rows.map((r) => Number(r.connection_id));
}

/**
 * Count connection-level events on a connection to decide whether the
 * early-data dampener still applies.
 */
async function countConnectionSignals(connectionId: number): Promise<number> {
  type Row = { c: number };
  // Count distinct (user, signal-source) pairs that have moved this
  // connection's score so far: vote + dismiss + credit rows.
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    SELECT (
      (SELECT COUNT(*) FROM public.cross_connection_votes WHERE connection_id = $1)::int +
      (SELECT COUNT(*) FROM public.connection_dismissals WHERE connection_id = $1)::int +
      (SELECT COUNT(*) FROM public.connection_credits WHERE connection_id = $1)::int
    ) AS c
    `,
    connectionId,
  );
  return Number(rows[0]?.c ?? 0);
}

/**
 * Apply a delta to a connection's quality_score, clamped to [0, 2].
 * Returns the new score.
 */
async function applyDelta(connectionId: number, delta: number): Promise<void> {
  if (delta === 0) return;
  await prisma.$executeRawUnsafe(
    `UPDATE public.cross_connections
     SET quality_score = LEAST(2.0, GREATEST(0.0, quality_score + $1))
     WHERE id = $2`,
    delta,
    connectionId,
  );
}

/**
 * Has this user already had this item in library BEFORE the connection
 * impression fired? If yes, no positive credit (the connection didn't
 * cause the add — it was already there).
 *
 * We approximate this by checking whether `library_entries.started_at`
 * for (user, item) is earlier than the user's most recent impression
 * of `connectionId`. If started_at is null, we use created_at (we
 * don't have a created_at on library_entries today, so fall back to
 * "the row exists" + missing started_at → conservatively no credit).
 *
 * Returns true if the user had this item PRIOR to seeing the
 * connection.
 */
async function userHadItemBeforeImpression(
  userId: string,
  connectionId: number,
  itemId: number,
): Promise<boolean> {
  type Row = { had_before: boolean };
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `
    WITH first_imp AS (
      SELECT MIN(created_at) AS t
      FROM public.connection_events
      WHERE user_id = $1::uuid AND connection_id = $2::int AND event_type = 'impression'
    )
    SELECT
      EXISTS (
        SELECT 1 FROM public.library_entries le
        WHERE le.user_id = $1::uuid
          AND le.item_id = $3::int
          AND le.started_at IS NOT NULL
          AND le.started_at < COALESCE((SELECT t FROM first_imp), now())
      ) AS had_before
    `,
    userId,
    connectionId,
    itemId,
  );
  return !!rows[0]?.had_before;
}

/**
 * Core entry point — apply downstream signal across all attributed
 * connections for this (user, item).
 *
 * Wrap in `Promise.resolve().then(...)` at the call site to make this
 * fire-and-forget; failures are swallowed inside this function.
 */
export async function creditDownstream(args: {
  userId: string;
  itemId: number;
  signal: DownstreamSignal;
}): Promise<void> {
  try {
    const { userId, itemId, signal } = args;
    const sigInfo = signalToTier(signal);

    // Choose attribution window. Rating signals get the wider 30d.
    const windowDays =
      signal.kind === "rating" ? ATTRIBUTION_WINDOWS.ratingDays : ATTRIBUTION_WINDOWS.libraryDays;

    const connectionIds = await findAttributedConnections(userId, itemId, windowDays);
    if (connectionIds.length === 0) return;

    for (const connectionId of connectionIds) {
      // Pre-existing item guard (positive credits only). If the user
      // already had this item in library before any impression of this
      // connection fired, no positive credit. Reversals + negatives still apply.
      if (!sigInfo.isReversal && !sigInfo.isNegativeRating && sigInfo.tier > 0) {
        const hadBefore = await userHadItemBeforeImpression(userId, connectionId, itemId);
        if (hadBefore) continue;
      }

      // Look up existing credit row
      const existing = await prisma.connectionCredit.findUnique({
        where: {
          userId_connectionId_itemId_signalClass: {
            userId,
            connectionId,
            itemId,
            signalClass: "downstream",
          },
        },
      });

      // Early-data dampener (50% delta until threshold met)
      const sigCount = await countConnectionSignals(connectionId);
      const damp = dampener(sigCount);

      if (sigInfo.isNegativeRating) {
        // One-shot negative rating credit. If we've already applied a
        // negative credit for this triple, skip. Otherwise apply the
        // full negative delta and store a sentinel tier -1.
        if (existing && existing.tier === -1) continue;
        // If a positive credit existed, first revert it.
        let delta = SCORE_DELTAS.ratingNegative * damp;
        if (existing && existing.deltaApplied > 0) {
          delta -= existing.deltaApplied; // revert prior positive credit
        }
        await applyDelta(connectionId, delta);
        const newDeltaTotal = (existing?.deltaApplied ?? 0) + delta;
        await prisma.connectionCredit.upsert({
          where: {
            userId_connectionId_itemId_signalClass: {
              userId, connectionId, itemId, signalClass: "downstream",
            },
          },
          create: {
            userId, connectionId, itemId, signalClass: "downstream",
            tier: -1, deltaApplied: newDeltaTotal,
          },
          update: { tier: -1, deltaApplied: newDeltaTotal },
        });
        continue;
      }

      if (sigInfo.isReversal) {
        // Library row deleted. If we'd credited this triple positively,
        // revert the credit AND apply the small extra penalty.
        if (!existing || existing.tier <= 0) continue;
        const revert = -existing.deltaApplied;
        const penalty = SCORE_DELTAS.libraryDeletePenalty * damp;
        await applyDelta(connectionId, revert + penalty);
        await prisma.connectionCredit.update({
          where: {
            userId_connectionId_itemId_signalClass: {
              userId, connectionId, itemId, signalClass: "downstream",
            },
          },
          data: { tier: 0, deltaApplied: existing.deltaApplied + revert + penalty },
        });
        continue;
      }

      // Positive tier ladder. Apply the diff between current and new tier.
      // For rating signals we allow tier to go DOWN (e.g. user lowered
      // a 5★ rating to 3★ → revert the rating-tier credit). For
      // non-rating signals (library_add, library_completed, cover_click)
      // we never voluntarily move down the ladder.
      const newTier = sigInfo.tier;
      const oldTier = existing && existing.tier > 0 ? existing.tier : 0;
      const isRating = signal.kind === "rating";
      if (newTier === oldTier) continue;
      if (newTier < oldTier && !isRating) continue;
      const targetCumulative = deltaForTier(newTier) * damp;
      const currentCumulative = existing?.deltaApplied ?? 0;
      const diff = targetCumulative - currentCumulative;
      if (Math.abs(diff) < 1e-9) continue;
      await applyDelta(connectionId, diff);
      await prisma.connectionCredit.upsert({
        where: {
          userId_connectionId_itemId_signalClass: {
            userId, connectionId, itemId, signalClass: "downstream",
          },
        },
        create: {
          userId, connectionId, itemId, signalClass: "downstream",
          tier: newTier, deltaApplied: targetCumulative,
        },
        update: { tier: newTier, deltaApplied: targetCumulative },
      });
    }
  } catch (err) {
    // Fire-and-forget — never break the caller.
    console.error("creditDownstream error:", err);
  }
}

/**
 * Record an impression event. Called by /api/cross-connections/impressions
 * with a batch of connection IDs that just rendered for the user.
 *
 * We do NOT dedupe — multiple impressions per (user, connection) day
 * are fine; the credit-time query looks for ANY impression in the
 * attribution window.
 */
export async function recordImpressions(userId: string, connectionIds: number[]): Promise<void> {
  if (connectionIds.length === 0) return;
  await prisma.connectionEvent.createMany({
    data: connectionIds.map((connectionId) => ({
      userId,
      connectionId,
      eventType: "impression",
      itemId: null,
    })),
  });
}

/**
 * Record a cover-click event and fire the tier-1 credit.
 */
export async function recordCoverClick(userId: string, connectionId: number, itemId: number): Promise<void> {
  await prisma.connectionEvent.create({
    data: { userId, connectionId, eventType: "cover_click", itemId },
  });
  // Also fire tier-1 credit. Cover_click bypasses the impression
  // attribution check (the click IS the attribution).
  // But we still go through the credit engine for the tier-ladder
  // accounting and pre-existing-item guard.
  await creditDownstream({ userId, itemId, signal: { kind: "cover_click" } });
}

export { EARLY_DATA_THRESHOLD };
