"use client";

import { useState, useEffect } from "react";
import { TYPES, TYPE_ORDER, type Item, type UpcomingItem } from "@/lib/data";
import Card from "@/components/card";
import UpcomingCard from "@/components/upcoming-card";
import ScrollRow from "@/components/scroll-row";

interface CatalogRow {
  key: string;
  label: string;
  sub: string;
  icon: string;
  iconBg: string;
  items: Item[];
}

export default function ForYouPage() {
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [curatedRows, setCuratedRows] = useState<CatalogRow[]>([]);
  const [typeRows, setTypeRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch upcoming
  useEffect(() => {
    fetch("/api/upcoming")
      .then((r) => r.json())
      .then((data) => { setUpcoming(Array.isArray(data) ? data : []); setLoadingUpcoming(false); })
      .catch(() => setLoadingUpcoming(false));
  }, []);

  // Fetch catalog from DB
  useEffect(() => {
    async function loadCatalog() {
      try {
        // Fetch a big batch and sort client-side for curated rows
        const res = await fetch("/api/catalog?limit=200&sort=recent");
        const allItems: Item[] = await res.json();
        if (!Array.isArray(allItems)) return;

        // Critically acclaimed: items with high external scores
        const withScores = allItems.filter((i) => {
          const ext = i.ext as Record<string, number>;
          const vals = Object.values(ext);
          return vals.length > 0 && vals.some((v) => v >= 8);
        });
        const criticallyAcclaimed = withScores
          .sort((a, b) => {
            const aMax = Math.max(...Object.values(a.ext as Record<string, number>));
            const bMax = Math.max(...Object.values(b.ext as Record<string, number>));
            return bMax - aMax;
          })
          .slice(0, 20);

        // Popular right now: recent releases (last 3 years)
        const currentYear = new Date().getFullYear();
        const popular = allItems
          .filter((i) => i.year >= currentYear - 3)
          .slice(0, 20);

        // Hidden gems: have scores but lower popularity (use items not in top lists)
        const topTitles = new Set([
          ...criticallyAcclaimed.map((i) => i.title),
          ...popular.map((i) => i.title),
        ]);
        const hiddenGems = allItems
          .filter((i) => {
            const ext = i.ext as Record<string, number>;
            const vals = Object.values(ext);
            return vals.length > 0 && vals.some((v) => v >= 7) && !topTitles.has(i.title);
          })
          .slice(0, 20);

        const curated: CatalogRow[] = [];
        if (criticallyAcclaimed.length > 0) {
          curated.push({
            key: "acclaimed",
            label: "Critically Acclaimed",
            sub: "Highest rated across all media",
            icon: "⭐",
            iconBg: "#D4AF3722",
            items: criticallyAcclaimed,
          });
        }
        if (popular.length > 0) {
          curated.push({
            key: "popular",
            label: "Popular Right Now",
            sub: "Recent releases making waves",
            icon: "🔥",
            iconBg: "#E8485522",
            items: popular,
          });
        }
        if (hiddenGems.length > 0) {
          curated.push({
            key: "gems",
            label: "Hidden Gems",
            sub: "Highly rated but under the radar",
            icon: "💎",
            iconBg: "#3185FC22",
            items: hiddenGems,
          });
        }

        setCuratedRows(curated);

        // Now fetch per-type rows from DB
        const typePromises = TYPE_ORDER.map(async (type) => {
          const res = await fetch(`/api/catalog?type=${type}&limit=30&sort=recent`);
          const items: Item[] = await res.json();
          if (!Array.isArray(items) || items.length === 0) return null;
          const meta = TYPES[type];
          return {
            key: type,
            label: meta.label,
            sub: `${items.length}+ titles`,
            icon: meta.icon,
            iconBg: meta.color + "22",
            items,
          } as CatalogRow;
        });

        const typeResults = await Promise.all(typePromises);
        setTypeRows(typeResults.filter(Boolean) as CatalogRow[]);
        setLoading(false);
      } catch (e) {
        console.error("Failed to load catalog:", e);
        setLoading(false);
      }
    }
    loadCatalog();
  }, []);

  return (
    <div>
      {/* Welcome banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(232,72,85,0.08), rgba(49,133,252,0.08), rgba(46,196,182,0.08))",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 18,
        padding: "30px 24px",
        marginBottom: 40,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📚 🎬 🎮 🎵</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800, marginBottom: 6, color: "#fff" }}>
          Rate anything. Discover everything.
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
          Rate below and Literacy will find connections across media you&apos;d never expect.
        </div>
      </div>

      {/* Curated rows */}
      {curatedRows.map((row) => (
        <ScrollRow
          key={row.key}
          label={row.label}
          sub={row.sub}
          icon={row.icon}
          iconBg={row.iconBg}
        >
          {row.items.map((item) => (
            <Card key={item.id} item={item} />
          ))}
        </ScrollRow>
      ))}

      {/* Coming Soon row */}
      <ScrollRow
        label="Coming Soon"
        sub={loadingUpcoming ? "Loading..." : `${upcoming.length} upcoming releases`}
        icon="🔥"
        iconBg="#E8485522"
      >
        {loadingUpcoming ? (
          <div style={{ padding: "40px 20px", color: "var(--text-faint)", fontSize: 13 }}>
            Loading upcoming releases...
          </div>
        ) : upcoming.length > 0 ? (
          upcoming.map((item) => (
            <UpcomingCard key={`upcoming-${item.id}`} item={item} />
          ))
        ) : (
          <div style={{ padding: "40px 20px", color: "var(--text-faint)", fontSize: 13 }}>
            No upcoming releases found
          </div>
        )}
      </ScrollRow>

      {/* Section label */}
      <div style={{
        fontSize: 10,
        color: "rgba(255,255,255,0.2)",
        textTransform: "uppercase",
        letterSpacing: 2,
        fontWeight: 600,
        marginBottom: 28,
      }}>
        Browse by media
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
          Loading catalog...
        </div>
      )}

      {/* Per-type rows from DB */}
      {typeRows.map((row) => (
        <ScrollRow
          key={row.key}
          label={row.label}
          sub={row.sub}
          icon={row.icon}
          iconBg={row.iconBg}
        >
          {row.items.map((item) => (
            <Card key={item.id} item={item} />
          ))}
        </ScrollRow>
      ))}
    </div>
  );
}
