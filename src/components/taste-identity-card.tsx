"use client";

import Link from "next/link";

interface Stats {
  ratingCount: number;
  typesCount: number;
  avgScore: number;
  typeBreakdown: Record<string, number>;
  displayName: string;
  memberNumber: number | null;
  joinedAt: string | null;
  userId: string;
}

interface TasteIdentityCardProps {
  stats: Stats | null;
  tasteTags: string[];
  /** When stats is null AND user is not authenticated, show the sign-up CTA. */
  authed: boolean;
}

const MEDIA_TYPE_META: Record<string, { label: string; bar: string }> = {
  movie:   { label: "Movies",   bar: "rgba(232,72,85,0.5)"  },
  tv:      { label: "TV",       bar: "rgba(74,144,226,0.5)" },
  anime:   { label: "Anime",    bar: "rgba(155,93,229,0.5)" },
  book:    { label: "Books",    bar: "rgba(218,165,32,0.5)" },
  game:    { label: "Games",    bar: "rgba(46,196,182,0.5)" },
  manga:   { label: "Manga",    bar: "rgba(255,107,107,0.5)" },
  music:   { label: "Music",    bar: "rgba(255,165,0,0.5)"  },
  podcast: { label: "Podcasts", bar: "rgba(124,179,66,0.5)" },
  comic:   { label: "Comics",   bar: "rgba(249,166,32,0.5)" },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatJoined(iso: string | null): string {
  if (!iso) return "Joined recently";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Joined recently";
  return `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const CARD_BG = "linear-gradient(135deg, rgba(232,72,85,0.04) 0%, rgba(46,196,182,0.03) 50%, rgba(155,93,229,0.02) 100%)";

export default function TasteIdentityCard({ stats, tasteTags, authed }: TasteIdentityCardProps) {
  // ── Logged-out CTA ─────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{
        background: CARD_BG,
        border: "1px solid rgba(232,72,85,0.08)",
        borderRadius: 16,
        padding: "28px 32px",
        margin: "28px 0 36px",
        textAlign: "center",
      }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 500, color: "#fff", marginBottom: 8 }}>
          Sign up to build your taste profile across every medium
        </div>
        <div style={{ fontSize: 13, color: "rgba(232,230,225,0.4)", marginBottom: 16 }}>
          Rate movies, TV, games, anime, books, manga, music, podcasts, and comics — we&apos;ll learn what you love.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Link href="/signup" style={{
            padding: "10px 22px",
            background: "#E84855",
            color: "#fff",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}>
            Create account
          </Link>
          <Link href="/login" style={{
            padding: "10px 22px",
            background: "rgba(255,255,255,0.04)",
            color: "#fff",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const initial = stats.displayName?.trim()?.[0]?.toUpperCase() || "?";

  // Chart: one bar per media type the user has rated, scaled so the
  // tallest bar is 50px and the others are proportional.
  const breakdownEntries = Object.entries(stats.typeBreakdown)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const maxCount = breakdownEntries.length > 0 ? Math.max(...breakdownEntries.map(([, n]) => n)) : 1;

  return (
    <div
      className="taste-identity-card"
      style={{
        background: CARD_BG,
        border: "1px solid rgba(232,72,85,0.08)",
        borderRadius: 16,
        padding: "24px 28px",
        margin: "28px 0 36px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* ── Top row: avatar + identity + stats ───────────────── */}
      <div
        className="taste-identity-top"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        {/* Avatar */}
        <div
          className="taste-identity-avatar"
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #E84855, #2EC4B6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <span className="taste-identity-avatar-text" style={{ fontSize: 24, fontWeight: 700, color: "#fff" }}>{initial}</span>
        </div>

        {/* Identity + tags */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="taste-identity-name" style={{ fontSize: 17, fontWeight: 500, color: "#fff", lineHeight: 1.2 }}>
            {stats.displayName}
          </div>
          <div className="taste-identity-subtitle" style={{ fontSize: 11, color: "rgba(232,230,225,0.3)", marginTop: 3 }}>
            {stats.memberNumber != null ? `Member #${stats.memberNumber} · ` : ""}
            {formatJoined(stats.joinedAt)}
            {" · "}
            <Link href={`/user/${stats.userId}`} style={{ color: "#2EC4B6", textDecoration: "none" }}>
              View profile →
            </Link>
          </div>

          {tasteTags.length > 0 && (
            <div className="taste-identity-tags-row" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {tasteTags.map((tag) => (
                <span
                  key={tag}
                  className="taste-identity-tag"
                  style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    borderRadius: 16,
                    border: "1px solid rgba(232,72,85,0.18)",
                    color: "rgba(232,72,85,0.75)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Stats block — inline with name/tags per spec */}
        <div
          className="taste-identity-stats"
          style={{
            display: "flex",
            gap: 22,
            flexShrink: 0,
            paddingLeft: 20,
            borderLeft: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Stat label="Rated" value={String(stats.ratingCount)} />
          <Stat label="Types" value={String(stats.typesCount)} />
          <Stat label="Avg" value={stats.avgScore > 0 ? stats.avgScore.toFixed(1) : "—"} />
        </div>
      </div>

      {/* ── Bottom row: full-width "Across media" bar chart ──── */}
      {breakdownEntries.length > 0 && (
        <div
          className="taste-identity-chart-row"
          style={{
            marginTop: 0,
            paddingTop: 4,
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 2,
              color: "rgba(232,230,225,0.2)",
              marginBottom: 8,
            }}
          >
            Across media
          </div>
          <div
            className="taste-identity-chart"
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-end",
              width: "100%",
            }}
            aria-label="Media type breakdown"
          >
            {breakdownEntries.map(([type, count]) => {
              const meta = MEDIA_TYPE_META[type] || { label: type.toUpperCase(), bar: "rgba(255,255,255,0.25)" };
              const barHeight = Math.max(Math.round((count / maxCount) * 50), 4);
              return (
                <div
                  key={type}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "rgba(232,230,225,0.5)",
                    lineHeight: 1,
                  }}>
                    {count}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      height: barHeight,
                      background: meta.bar,
                      borderRadius: 4,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      color: "rgba(232,230,225,0.3)",
                      lineHeight: 1,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        /* Hide the Across Media chart on laptop-and-smaller. It's a
           discovery-browsing feature, not essential. */
        @media (max-width: 1023px) {
          .taste-identity-chart-row {
            display: none !important;
          }
        }
        /* Tablet / large mobile (640-1023px): keep stats visible next to
           identity but let the block wrap if needed. */
        @media (max-width: 1023px) {
          .taste-identity-card {
            padding: 20px !important;
            gap: 14px !important;
          }
          .taste-identity-top {
            flex-wrap: wrap !important;
          }
        }
        /* Mobile (< 640px) compressed strip: avatar shrinks, stats and
           subtitle row hide, only identity + taste tags remain. */
        @media (max-width: 639px) {
          .taste-identity-card {
            padding: 14px 16px !important;
            margin: 16px 0 24px !important;
          }
          .taste-identity-avatar {
            width: 44px !important;
            height: 44px !important;
          }
          .taste-identity-avatar-text {
            font-size: 18px !important;
          }
          .taste-identity-subtitle {
            display: none !important;
          }
          .taste-identity-stats {
            display: none !important;
          }
          .taste-identity-name {
            font-size: 15px !important;
          }
          .taste-identity-tags-row {
            margin-top: 6px !important;
            max-height: 26px;
            overflow: hidden;
          }
          .taste-identity-tag {
            font-size: 10px !important;
            padding: 2px 8px !important;
          }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#2EC4B6", lineHeight: 1 }}>{value}</div>
      <div style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        color: "rgba(232,230,225,0.3)",
        marginTop: 6,
      }}>
        {label}
      </div>
    </div>
  );
}
