"use client";

import { useEffect, useState, useCallback } from "react";
import { Item, TYPES } from "@/lib/data";
import Card from "./card";
import ScrollRow from "./scroll-row";

interface RecommendationData {
  moreSameType: Item[];
  acrossMedia: Item[];
  fansAlsoLoved: Item[];
  hiddenGems: Item[];
}

function DismissableCard({ item, onDismiss }: { item: Item; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [fading, setFading] = useState(false);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setFading(true);
    // Track dismiss signal
    fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, signalType: "dismiss" }),
    }).catch(() => {});
    // Also save to dismissed_items for exclusion
    fetch("/api/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    }).catch(() => {});
    setTimeout(() => onDismiss(item.id), 300);
  };

  if (fading) {
    return (
      <div style={{
        opacity: 0,
        transform: "scale(0.9)",
        transition: "opacity 0.3s, transform 0.3s",
        flex: "0 0 150px", width: 150,
      }} />
    );
  }

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss recommendation"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            zIndex: 10,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            border: "0.5px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.6)",
            fontSize: 11,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
      <Card item={item} />
    </div>
  );
}

export default function Recommendations({ item }: { item: Item }) {
  const [data, setData] = useState<RecommendationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  const handleDismiss = useCallback((id: number) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/recommendations?itemId=${item.id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    // Track page view signal (fire-and-forget)
    fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, signalType: "page_view" }),
    }).catch(() => {});
  }, [item.id]);

  const t = TYPES[item.type];

  if (loading) {
    return (
      <section style={{ marginTop: 48 }}>
        <h2 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 24,
          fontWeight: 800,
          color: "#fff",
          marginBottom: 28,
        }}>
          Recommendations
        </h2>
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "20px 0" }}>
          Loading recommendations…
        </div>
      </section>
    );
  }

  if (!data) return null;

  const filterDismissed = (items: Item[]) => items.filter((i) => !dismissedIds.has(i.id));

  const moreSame = filterDismissed(data.moreSameType);
  const across = filterDismissed(data.acrossMedia);
  const fans = filterDismissed(data.fansAlsoLoved);
  const gems = filterDismissed(data.hiddenGems);
  const hasAny = moreSame.length > 0 || across.length > 0 || fans.length > 0 || gems.length > 0;

  if (!hasAny) return null;

  return (
    <section style={{ marginTop: 48 }}>
      <h2 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 24,
        fontWeight: 800,
        color: "#fff",
        marginBottom: 28,
      }}>
        Recommendations
      </h2>

      {moreSame.length > 0 && (
        <ScrollRow
          label={`More ${t.label}`}
          sub={`Similar ${t.label.toLowerCase()} you might enjoy`}
          icon={t.icon}
          iconBg={t.color + "33"}
        >
          {moreSame.map((i) => <DismissableCard key={i.id} item={i} onDismiss={handleDismiss} />)}
        </ScrollRow>
      )}

      {across.length > 0 && (
        <ScrollRow
          label="Across Media"
          sub="Same vibes, different medium"
          icon="🌐"
        >
          {across.map((i) => <DismissableCard key={i.id} item={i} onDismiss={handleDismiss} />)}
        </ScrollRow>
      )}

      {fans.length > 0 && (
        <ScrollRow
          label="Fans Also Loved"
          sub="Popular picks with a similar feel"
          icon="❤️"
        >
          {fans.map((i) => <DismissableCard key={i.id} item={i} onDismiss={handleDismiss} />)}
        </ScrollRow>
      )}

      {gems.length > 0 && (
        <ScrollRow
          label="Hidden Gems Like This"
          sub="Underrated finds you might love"
          icon="💎"
        >
          {gems.map((i) => <DismissableCard key={i.id} item={i} onDismiss={handleDismiss} />)}
        </ScrollRow>
      )}
    </section>
  );
}
