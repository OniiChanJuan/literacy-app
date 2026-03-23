"use client";

export default function LibraryPage() {
  const statuses = [
    { key: "completed",   label: "Completed",   icon: "✓", color: "#2EC4B6" },
    { key: "in_progress", label: "In Progress",  icon: "▶", color: "#3185FC" },
    { key: "want_to",     label: "Want To",      icon: "＋", color: "#9B5DE5" },
    { key: "dropped",     label: "Dropped",      icon: "✕", color: "#E84855" },
  ];

  return (
    <div>
      {/* Empty state */}
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>📝</div>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 20,
          fontWeight: 800,
          marginBottom: 6,
        }}>
          Nothing tracked yet
        </div>
        <div style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.4)",
          maxWidth: 340,
          margin: "0 auto",
          lineHeight: 1.6,
        }}>
          Open any item and add it to your library.
        </div>
      </div>

      {/* Status summary pills — shown when library has items */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", opacity: 0.35 }}>
        {statuses.map((s) => (
          <div
            key={s.key}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <span style={{ fontSize: 13, color: s.color }}>{s.icon}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: s.color }}>0</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Media type filter pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20, opacity: 0.35 }}>
        {[
          { label: "Movies",   icon: "🎬", color: "#E84855" },
          { label: "TV Shows", icon: "📺", color: "#C45BAA" },
          { label: "Books",    icon: "📖", color: "#3185FC" },
          { label: "Manga",    icon: "🗾", color: "#FF6B6B" },
          { label: "Comics",   icon: "💥", color: "#F9A620" },
          { label: "Games",    icon: "🎮", color: "#2EC4B6" },
          { label: "Music",    icon: "🎵", color: "#9B5DE5" },
          { label: "Podcasts", icon: "🎙️", color: "#00BBF9" },
        ].map((t) => (
          <button
            key={t.label}
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.5)",
              border: "none",
              borderRadius: 12,
              padding: "6px 12px",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <span style={{ fontSize: 10 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Status sections — shown when library has items */}
      {statuses.map((s) => (
        <div key={s.key} style={{ marginBottom: 32, opacity: 0.2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 14, color: s.color, fontWeight: 700 }}>{s.icon}</span>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 800 }}>{s.label}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>0</span>
          </div>
          <div style={{
            height: 260,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.1)" }}>cards will appear here</span>
          </div>
        </div>
      ))}
    </div>
  );
}
