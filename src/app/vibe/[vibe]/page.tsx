"use client";

import { use } from "react";
import { ALL_ITEMS, TYPES, VIBES, TYPE_ORDER, ALL_VIBES } from "@/lib/data";
import Card from "@/components/card";
import BackButton from "@/components/back-button";
import Link from "next/link";

export default function VibeBrowsePage({ params }: { params: Promise<{ vibe: string }> }) {
  const { vibe: vibeKey } = use(params);
  const vibe = VIBES[vibeKey];

  if (!vibe) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px" }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🌫</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 800 }}>
          Vibe not found
        </div>
      </div>
    );
  }

  const items = ALL_ITEMS.filter((item) => item.vibes.includes(vibeKey));

  // Group by media type
  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    if (!grouped[item.type]) grouped[item.type] = [];
    grouped[item.type].push(item);
  }

  // Related vibes (vibes that commonly co-occur)
  const vibeCooccurrence: Record<string, number> = {};
  for (const item of items) {
    for (const v of item.vibes) {
      if (v !== vibeKey) vibeCooccurrence[v] = (vibeCooccurrence[v] || 0) + 1;
    }
  }
  const relatedVibes = Object.entries(vibeCooccurrence)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([v]) => v);

  return (
    <div>
      <BackButton />

      {/* Hero */}
      <div style={{
        textAlign: "center",
        padding: "48px 20px",
        marginBottom: 28,
        background: `${vibe.color}12`,
        borderRadius: 20,
        border: `1px solid ${vibe.color}25`,
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>{vibe.icon}</div>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 36,
          fontWeight: 900,
          color: vibe.color,
          marginBottom: 8,
        }}>
          {vibe.label}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {items.length} {items.length === 1 ? "item" : "items"} with this vibe
        </p>
      </div>

      {/* Related vibes */}
      {relatedVibes.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 10,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: 2,
            fontWeight: 600,
            marginBottom: 10,
          }}>
            Related vibes
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {relatedVibes.map((v) => {
              const rv = VIBES[v];
              if (!rv) return null;
              return (
                <Link
                  key={v}
                  href={`/vibe/${v}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: rv.color,
                    background: rv.color + "18",
                    border: `1px solid ${rv.color}30`,
                    padding: "5px 12px",
                    borderRadius: 16,
                    textDecoration: "none",
                    transition: "transform 0.15s",
                  }}
                >
                  <span>{rv.icon}</span> {rv.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Items grouped by type */}
      {TYPE_ORDER.map((type) => {
        const typeItems = grouped[type];
        if (!typeItems || typeItems.length === 0) return null;
        const t = TYPES[type];

        return (
          <div key={type} style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 800, color: "#fff" }}>
                {t.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{typeItems.length}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {typeItems.map((item) => <Card key={item.id} item={item} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
