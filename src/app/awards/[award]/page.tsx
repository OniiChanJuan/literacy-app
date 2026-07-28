"use client";

import { use, useEffect, useState } from "react";
import { TYPES, TYPE_ORDER, type Item } from "@/lib/data";
import { AWARDS } from "@/lib/awards";
import Card from "@/components/card";
import BackButton from "@/components/back-button";

interface Win {
  category: string;
  year: number;
  result: string;
}

type Winner = Item & { wins: Win[] };

/** "2013 · 2014" (won years, newest first, capped to keep the caption short) */
function winYears(wins: Win[]): string {
  const years = [...new Set(wins.map((w) => w.year))].sort((a, b) => b - a);
  const shown = years.slice(0, 3).join(" · ");
  return years.length > 3 ? `${shown} +${years.length - 3}` : shown;
}

export default function AwardBrowsePage({ params }: { params: Promise<{ award: string }> }) {
  const { award: awardKey } = use(params);
  const award = AWARDS[awardKey];

  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!award) return;
    fetch(`/api/awards/${awardKey}`)
      .then((r) => (r.ok ? r.json() : { winners: [] }))
      .then((data) => {
        setWinners(Array.isArray(data.winners) ? data.winners : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [awardKey, award]);

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

  // Group by media type; newest win first within each group
  const grouped: Record<string, Winner[]> = {};
  for (const item of winners) {
    if (!grouped[item.type]) grouped[item.type] = [];
    grouped[item.type].push(item);
  }
  for (const type of Object.keys(grouped)) {
    grouped[type].sort((a, b) => (b.wins[0]?.year ?? 0) - (a.wins[0]?.year ?? 0));
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
          {loading
            ? "Loading winners…"
            : `${winners.length} ${winners.length === 1 ? "winner" : "winners"} on CrossShelf`}
        </p>
      </div>

      {/* Empty state */}
      {!loading && winners.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: 13 }}>
          No winners in the catalog yet — they're on the way.
        </div>
      )}

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
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Card item={item} />
                  <div
                    title={[...new Set(item.wins.map((w) => w.category).filter(Boolean))].join(", ")}
                    style={{
                      fontSize: 10,
                      color: award.color,
                      opacity: 0.85,
                      textAlign: "center",
                      maxWidth: "var(--card-w)",
                    }}
                  >
                    🏆 {winYears(item.wins)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
