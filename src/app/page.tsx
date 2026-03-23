"use client";

import { ITEMS, TYPES, TYPE_ORDER } from "@/lib/data";
import Card from "@/components/card";
import ScrollRow from "@/components/scroll-row";

export default function ForYouPage() {
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

      {/* One scroll row per media type */}
      {TYPE_ORDER.map((type) => {
        const items = ITEMS.filter((i) => i.type === type);
        if (!items.length) return null;
        const meta = TYPES[type];

        return (
          <ScrollRow
            key={type}
            label={meta.label}
            sub={`${items.length} titles`}
            icon={meta.icon}
            iconBg={meta.color + "22"}
          >
            {items.map((item) => (
              <Card key={item.id} item={item} />
            ))}
          </ScrollRow>
        );
      })}
    </div>
  );
}
