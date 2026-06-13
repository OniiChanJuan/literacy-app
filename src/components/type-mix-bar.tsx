"use client";

import { TYPES, TYPE_ORDER, type MediaType } from "@/lib/data";

/**
 * TypeMixBar — a thin horizontal "fingerprint" of a user's review/rating
 * distribution across media types. Each segment's width is that type's share
 * of the total, colored with the platform's locked type-color language
 * (TYPES[type].color), NOT bespoke tints — so it reads consistently with
 * cards, badges, and the rest of the app.
 *
 * Shared on purpose: the People Following row uses it now; Public Profile
 * will reuse it later. Keep it prop-driven and surface-agnostic — do not
 * couple it to either page.
 *
 * Renders nothing when there's no data (hide-don't-placeholder).
 */
export default function TypeMixBar({
  counts,
  height = 3,
}: {
  counts: Record<string, number> | undefined | null;
  height?: number;
}) {
  if (!counts) return null;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  // Stable left-to-right order by the canonical media-type order.
  const segments = TYPE_ORDER
    .filter((t) => (counts[t] ?? 0) > 0)
    .map((t) => ({
      type: t,
      pct: ((counts[t] ?? 0) / total) * 100,
      color: TYPES[t as MediaType]?.color ?? "#888",
    }));

  return (
    <div
      style={{
        display: "flex",
        height,
        borderRadius: 2,
        overflow: "hidden",
        background: "rgba(255,255,255,0.06)",
      }}
    >
      {segments.map((s) => (
        <div key={s.type} style={{ width: `${s.pct}%`, height: "100%", background: s.color }} />
      ))}
    </div>
  );
}
