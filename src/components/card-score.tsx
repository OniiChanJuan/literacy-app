"use client";

/**
 * CardScore — the compact CrossShelf Score unit shown on cards (catalog, For
 * You, search, library, recommendation rows). The shared, single rendering of
 * the locked card treatment (design/mockups/crossshelf-score-mockup-v2.html):
 * a small teal "CrossShelf" wordmark + the 0–10 number + a teal fill bar, or a
 * dash for comics / items with no usable external data.
 *
 * Cards are EXTERNAL-ONLY by design: list payloads carry `ext` + `voteCount`
 * but no community aggregate (community is empty site-wide), so the score is
 * computed with `community = null`. Same math as everywhere else — no card-only
 * fabrication (the old `*0.55` / `*10.5` constants and the unlabeled "%" are
 * gone).
 */

import type { Item } from "@/lib/data";
import { computeCrossShelfScore } from "@/lib/crossshelf-score";

const TEAL = "#2EC4B6";
const FAINT = "rgba(232,230,225,0.34)";

export default function CardScore({
  item,
  numSize = 13,
  trailing,
}: {
  item: Item;
  /** Font size of the 0–10 number (cards vary: 12–14px). */
  numSize?: number;
  /** Optional right-aligned slot in the number row (e.g. a status pill). */
  trailing?: React.ReactNode;
}) {
  const score = computeCrossShelfScore(
    { ext: item.ext, type: item.type, voteCount: item.voteCount ?? 0 },
    null, // external-only on cards
  );
  const isDash = score.score10 == null;
  const pct = isDash ? 0 : Math.min(100, Math.max(0, score.score10! * 10));

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: 0.5,
          textTransform: "uppercase", color: TEAL, lineHeight: 1, flexShrink: 0,
        }}>
          CrossShelf
        </span>
        {isDash ? (
          <span style={{ fontSize: numSize, color: FAINT, fontFamily: "var(--font-serif)", lineHeight: 1 }}>—</span>
        ) : (
          <>
            <span style={{ fontSize: numSize, fontWeight: 700, color: TEAL, fontFamily: "var(--font-serif)", lineHeight: 1 }}>
              {score.score10!.toFixed(1)}
            </span>
            <span style={{ fontSize: 7, color: FAINT, lineHeight: 1 }}>/10</span>
          </>
        )}
        {trailing && <span style={{ marginLeft: "auto", flexShrink: 0 }}>{trailing}</span>}
      </div>
      <div style={{
        height: 3, marginTop: 3, background: "rgba(255,255,255,0.05)",
        borderRadius: 2, overflow: "hidden",
      }}>
        {!isDash && <div style={{ width: `${pct}%`, height: "100%", background: TEAL, borderRadius: 2 }} />}
      </div>
    </div>
  );
}
