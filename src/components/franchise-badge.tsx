import Link from "next/link";
import { getFranchiseForItem, type Franchise } from "@/lib/franchises";

export default function FranchiseBadge({ routeId }: { routeId: string }) {
  const franchise = getFranchiseForItem(routeId);
  if (!franchise) return null;

  return (
    <Link
      href={`/franchise/${franchise.slug}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        background: `${franchise.color}15`,
        border: `1px solid ${franchise.color}30`,
        borderRadius: 12,
        textDecoration: "none",
        marginBottom: 16,
        transition: "all 0.15s",
      }}
    >
      <span style={{ fontSize: 16 }}>{franchise.icon}</span>
      <span style={{ fontSize: 12, color: franchise.color, fontWeight: 600 }}>
        Part of the {franchise.name} universe
      </span>
      <span style={{ fontSize: 12, color: franchise.color }}>→</span>
    </Link>
  );
}
