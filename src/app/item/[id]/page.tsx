import { notFound } from "next/navigation";
import { ITEMS, TYPES, VIBES } from "@/lib/data";
import BackButton from "@/components/back-button";
import RatingPanel from "@/components/rating-panel";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = ITEMS.find((i) => i.id === parseInt(id));
  if (!item) notFound();

  const t = TYPES[item.type];

  return (
    <div>
      <BackButton />

      {/* Hero banner */}
      <div style={{
        background: item.cover,
        borderRadius: 20,
        padding: "48px 36px 36px",
        marginBottom: 36,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Fade overlay for readability */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(11,11,16,0.85) 0%, rgba(11,11,16,0.2) 60%, transparent 100%)",
          borderRadius: 20,
        }} />

        <div style={{ position: "relative" }}>
          {/* Type badge */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: t.color,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 12px",
            borderRadius: 8,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 16,
          }}>
            {t.icon} {t.label.replace(/s$/, "")}
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 42,
            fontWeight: 900,
            lineHeight: 1.1,
            color: "#fff",
            marginBottom: 12,
            maxWidth: 700,
          }}>
            {item.title}
          </h1>

          {/* Year + genres */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
              {item.year}
            </span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
            {item.genre.map((g) => (
              <span key={g} style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.6)",
                background: "rgba(255,255,255,0.1)",
                padding: "3px 10px",
                borderRadius: 6,
              }}>
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" }}>

        {/* Left column */}
        <div>
          {/* Description */}
          <section style={{ marginBottom: 32 }}>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 16,
              fontWeight: 700,
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: 12,
            }}>
              About
            </h2>
            <p style={{
              fontSize: 15,
              color: "rgba(255,255,255,0.75)",
              lineHeight: 1.75,
            }}>
              {item.desc}
            </p>
          </section>

          {/* Vibe tags */}
          {item.vibes.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 16,
                fontWeight: 700,
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: 12,
              }}>
                Vibes
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {item.vibes.map((v) => {
                  const vibe = VIBES[v];
                  if (!vibe) return null;
                  return (
                    <span key={v} style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      color: "#fff",
                      background: vibe.color + "33",
                      border: `1px solid ${vibe.color}55`,
                      padding: "6px 14px",
                      borderRadius: 20,
                    }}>
                      <span>{vibe.icon}</span>
                      {vibe.label}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* People */}
          {item.people.length > 0 && (
            <section>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 16,
                fontWeight: 700,
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: 12,
              }}>
                People
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {item.people.map((p, i) => (
                  <div key={i} style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 12,
                  }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.4)",
                      flexShrink: 0,
                    }}>
                      {p.name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{p.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right column — rating panel */}
        <RatingPanel itemId={item.id} />
      </div>
    </div>
  );
}
