import type { ExternalSource } from "@/lib/data";

const SOURCES: Record<ExternalSource, { label: string; icon: string; color: string; maxScore: number; suffix: string }> = {
  imdb:      { label: "IMDb",           icon: "⭐", color: "#f5c518", maxScore: 10,  suffix: "/10" },
  rt:        { label: "Rotten Tomatoes", icon: "🍅", color: "#fa320a", maxScore: 100, suffix: "%" },
  meta:      { label: "Metacritic",     icon: "M",  color: "#ffcc34", maxScore: 100, suffix: "" },
  mal:       { label: "MyAnimeList",    icon: "M",  color: "#2e51a2", maxScore: 10,  suffix: "/10" },
  ign:       { label: "IGN",            icon: "I",  color: "#bf1313", maxScore: 10,  suffix: "/10" },
  goodreads: { label: "Goodreads",      icon: "📖", color: "#553b08", maxScore: 5,   suffix: "/5" },
  pitchfork: { label: "Pitchfork",      icon: "🎵", color: "#df2020", maxScore: 10,  suffix: "/10" },
};

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.75) return "var(--score-good)";
  if (pct >= 0.5) return "var(--score-mid)";
  return "var(--score-poor)";
}

export default function ExternalScores({ ext }: { ext: Partial<Record<ExternalSource, number>> }) {
  const entries = Object.entries(ext) as [ExternalSource, number][];
  if (entries.length === 0) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 16,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "1px",
        marginBottom: 12,
      }}>
        External Scores
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {entries.map(([source, score]) => {
          const meta = SOURCES[source];
          if (!meta) return null;
          const color = scoreColor(score, meta.maxScore);

          return (
            <div key={source} style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              minWidth: 130,
            }}>
              {/* Icon */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: meta.color + "22",
                border: `1px solid ${meta.color}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: meta.icon.length > 1 ? 14 : 13,
                fontWeight: 900,
                color: meta.color,
                flexShrink: 0,
              }}>
                {meta.icon}
              </div>

              {/* Score + label */}
              <div>
                <div style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color,
                  lineHeight: 1,
                }}>
                  {score}{meta.suffix}
                </div>
                <div style={{
                  fontSize: 9,
                  color: "var(--text-faint)",
                  marginTop: 3,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}>
                  {meta.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
