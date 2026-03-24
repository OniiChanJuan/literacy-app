"use client";

import { use } from "react";
import { ALL_ITEMS, TYPES, TYPE_ORDER } from "@/lib/data";
import { AWARDS } from "@/lib/awards";
import Card from "@/components/card";
import BackButton from "@/components/back-button";

export default function AwardBrowsePage({ params }: { params: Promise<{ award: string }> }) {
  const { award: awardKey } = use(params);
  const award = AWARDS[awardKey];

  if (!award) {
    return (
      <div className="content-width" style={{ textAlign: "center", paddingTop: 80, paddingBottom: 20 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🏆</div>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 800 }}>
          Award not found
        </div>
      </div>
    );
  }

  const winners = ALL_ITEMS.filter((item) => item.awards.includes(awardKey));

  // Group by media type
  const grouped: Record<string, typeof winners> = {};
  for (const item of winners) {
    if (!grouped[item.type]) grouped[item.type] = [];
    grouped[item.type].push(item);
  }

  return (
    <div className="content-width">
      <BackButton />

      {/* Hero */}
      <div style={{
        textAlign: "center",
        padding: "40px 20px",
        marginBottom: 32,
        background: `${award.color}10`,
        borderRadius: 20,
        border: `1px solid ${award.color}20`,
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>{award.icon}</div>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 32,
          fontWeight: 900,
          color: award.color,
          marginBottom: 8,
        }}>
          {award.label}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {winners.length} {winners.length === 1 ? "winner" : "winners"} on Literacy
        </p>
      </div>

      {/* Winners grouped by type */}
      {TYPE_ORDER.map((type) => {
        const items = grouped[type];
        if (!items || items.length === 0) return null;
        const t = TYPES[type];

        return (
          <div key={type} style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 800, color: "#fff" }}>
                {t.label}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {items.map((item) => <Card key={item.id} item={item} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
