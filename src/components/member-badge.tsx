"use client";

/**
 * Tiered member number badge.
 * #1–10:   gold star + gold number  (Founding Members)
 * #11–100: silver star + silver number (Early Adopters)
 * #101+:   no star, muted number
 */

export type MemberTier = "founding" | "early" | "regular";

export function getMemberTier(n: number): MemberTier {
  if (n <= 10) return "founding";
  if (n <= 100) return "early";
  return "regular";
}

const TIER_STAR_COLOR: Record<MemberTier, string> = {
  founding: "#F9A620",
  early: "#C0C0C0",
  regular: "",
};

const TIER_NUMBER_COLOR: Record<MemberTier, string> = {
  founding: "#F9A620",
  early: "#C0C0C0",
  regular: "rgba(255,255,255,0.3)",
};

/**
 * Inline badge: ★ #1 or just #101
 * Used in header, review cards, People page user cards.
 */
export function MemberBadge({
  memberNumber,
  size = "sm",
  showLabel = false,
}: {
  memberNumber: number;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
}) {
  const tier = getMemberTier(memberNumber);
  const starColor = TIER_STAR_COLOR[tier];
  const numColor = TIER_NUMBER_COLOR[tier];

  const fontSize = size === "xs" ? 9 : size === "sm" ? 10 : 12;
  const starSize = size === "xs" ? 8 : size === "sm" ? 10 : 12;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontWeight: 500,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {tier !== "regular" && (
        <span style={{ color: starColor, fontSize: starSize, lineHeight: 1 }}>★</span>
      )}
      <span style={{ color: numColor, fontSize }}>
        {showLabel ? `Member #${memberNumber}` : `#${memberNumber}`}
      </span>
    </span>
  );
}

/**
 * Block badge for profile pages: "Member #1" with tier label below
 */
export function MemberBadgeBlock({ memberNumber }: { memberNumber: number }) {
  const tier = getMemberTier(memberNumber);
  const starColor = TIER_STAR_COLOR[tier];
  const numColor = TIER_NUMBER_COLOR[tier];

  const tierLabel =
    tier === "founding" ? "Founding Member" :
    tier === "early" ? "Early Adopter" : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {tier !== "regular" && (
        <span style={{ color: starColor, fontSize: 16, lineHeight: 1 }}>★</span>
      )}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: numColor }}>
          Member #{memberNumber}
        </div>
        {tierLabel && (
          <div style={{ fontSize: 10, color: numColor, opacity: 0.7, marginTop: 1 }}>
            {tierLabel}
          </div>
        )}
      </div>
    </div>
  );
}
