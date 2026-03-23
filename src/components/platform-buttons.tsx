import type { MediaType } from "@/lib/data";

const PLATFORMS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  // Streaming
  netflix:     { label: "Netflix",       icon: "N",  color: "#fff",    bg: "#E50914" },
  prime:       { label: "Prime Video",   icon: "▶",  color: "#fff",    bg: "#00A8E1" },
  hbo:         { label: "Max",           icon: "M",  color: "#fff",    bg: "#5822b4" },
  hulu:        { label: "Hulu",          icon: "H",  color: "#fff",    bg: "#1CE783" },
  apple:       { label: "Apple TV+",     icon: "▶",  color: "#fff",    bg: "#555" },
  disney:      { label: "Disney+",       icon: "D",  color: "#fff",    bg: "#113CCF" },

  // Gaming
  steam:       { label: "Steam",         icon: "S",  color: "#fff",    bg: "#1b2838" },
  ps:          { label: "PlayStation",    icon: "P",  color: "#fff",    bg: "#003791" },
  xbox:        { label: "Xbox",          icon: "X",  color: "#fff",    bg: "#107C10" },
  switch:      { label: "Switch",        icon: "N",  color: "#fff",    bg: "#E60012" },

  // Books
  kindle:      { label: "Kindle",        icon: "K",  color: "#fff",    bg: "#FF9900" },
  audible:     { label: "Audible",       icon: "A",  color: "#fff",    bg: "#F8991C" },
  library:     { label: "Library",       icon: "📚", color: "#fff",    bg: "#4a6741" },

  // Manga/Comics
  mangaplus:   { label: "Manga Plus",    icon: "M",  color: "#fff",    bg: "#E84855" },
  viz:         { label: "VIZ",           icon: "V",  color: "#fff",    bg: "#1C1C1C" },
  comixology:  { label: "ComiXology",    icon: "C",  color: "#fff",    bg: "#2A2A2A" },

  // Music
  spotify:     { label: "Spotify",       icon: "S",  color: "#fff",    bg: "#1DB954" },
  apple_music: { label: "Apple Music",   icon: "♪",  color: "#fff",    bg: "#FA243C" },

  // Podcasts
  apple_pod:   { label: "Apple Podcasts", icon: "🎙", color: "#fff",   bg: "#872EC4" },

  // Upcoming
  theaters:    { label: "Theaters",      icon: "🎬", color: "#fff",    bg: "#E84855" },
};

const ACTION_LABELS: Record<MediaType, string> = {
  movie:   "Where to Watch",
  tv:      "Where to Watch",
  book:    "Where to Read",
  manga:   "Where to Read",
  comic:   "Where to Read",
  game:    "Where to Play",
  music:   "Where to Listen",
  podcast: "Where to Listen",
};

export default function PlatformButtons({ platforms, mediaType }: { platforms: string[]; mediaType: MediaType }) {
  if (platforms.length === 0) return null;

  const label = ACTION_LABELS[mediaType];

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
        {label}
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {platforms.map((key) => {
          const p = PLATFORMS[key];
          if (!p) return null;

          return (
            <div
              key={key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                background: p.bg,
                borderRadius: 12,
                cursor: "default",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 6px 20px ${p.bg}66`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <span style={{
                fontSize: p.icon.length > 1 ? 14 : 13,
                fontWeight: 900,
                color: p.color,
                width: 18,
                textAlign: "center",
              }}>
                {p.icon}
              </span>
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: p.color,
              }}>
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
