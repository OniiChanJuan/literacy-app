"use client";

export default function PeoplePage() {
  return (
    <div>
      {/* Two column layout: Find Reviewers + Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>

        {/* Left: Search */}
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
            Find Reviewers
          </h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>
            Search for people or browse reviewers with similar taste
          </p>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search by username..."
              readOnly
              style={{
                width: "100%",
                padding: "13px 18px 13px 42px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                color: "#fff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <span style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.3 }}>⌕</span>
          </div>

          {/* Placeholder user cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: 0.25 }}>
            {["nova_sky", "idle_hands", "pagecrawler"].map((name) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                }}
              >
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>— ratings · — reviews</div>
                </div>
                <button style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "5px 12px",
                  cursor: "pointer",
                }}>
                  Follow
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Activity feed */}
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
            Activity
          </h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>
            Recent reviews from people you follow
          </p>
          <div style={{
            padding: "32px 20px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 12,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", lineHeight: 1.7 }}>
              Follow people to see their<br />reviews and ratings here.
            </div>
          </div>
        </div>
      </div>

      {/* Reviewers with similar taste */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24 }}>
        <div style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.25)",
          textTransform: "uppercase",
          letterSpacing: 2,
          fontWeight: 600,
          marginBottom: 6,
        }}>
          Reviewers with similar taste
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 14 }}>
          Based on overlapping ratings and genres
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, opacity: 0.25 }}>
          {["reelthoughts", "ctrl_alt_defeat", "vinyl_ghost", "deep_focus"].map((name) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12,
              }}
            >
              <div style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
                flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>— shared ratings</div>
              </div>
              <button style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "rgba(255,255,255,0.5)",
                fontSize: 11,
                fontWeight: 600,
                padding: "5px 12px",
                cursor: "pointer",
              }}>
                Follow
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
