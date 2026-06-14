"use client";

import { useState, useEffect } from "react";

/**
 * The DB-backed franchise an item belongs to, as surfaced by
 * GET /api/franchises?itemId=<n>. Single source of truth for the item-detail
 * franchise strip (mobile) and FranchiseBadge (desktop) — both link to the
 * numeric /franchise/[id] route, which the franchise page already resolves.
 *
 * Replaces the legacy static src/lib/franchises.ts lookup, which only covered
 * 6 hardcoded franchises and produced dead /franchise/[slug] links (the page
 * API is numeric-id only).
 */
export interface ItemFranchise {
  id: number;
  name: string;
  icon: string;
  color: string;
  totalItems: number;
}

export function useItemFranchise(itemId: number | undefined): ItemFranchise | null {
  const [franchise, setFranchise] = useState<ItemFranchise | null>(null);

  useEffect(() => {
    if (typeof itemId !== "number" || !itemId) {
      setFranchise(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/franchises?itemId=${itemId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        // The endpoint returns null when the item is in no franchise.
        setFranchise(
          d && typeof d.id === "number"
            ? { id: d.id, name: d.name, icon: d.icon || "🔗", color: d.color || "#C45BAA", totalItems: d.totalItems ?? 0 }
            : null
        );
      })
      .catch(() => { if (!cancelled) setFranchise(null); });
    return () => { cancelled = true; };
  }, [itemId]);

  return franchise;
}
