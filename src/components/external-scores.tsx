"use client";

import { useEffect, useState } from "react";
import type { ExternalSource } from "@/lib/data";
import { scorePassesThreshold } from "@/lib/score-thresholds";

interface ScoreData {
  source: string;
  score: number;
  maxScore: number;
  scoreType: string;
  label: string;
}

const SOURCE_META: Record<string, { displayName: string; icon: string; color: string; suffix: string }> = {
  imdb:               { displayName: "IMDb",        icon: "⭐", color: "#f5c518", suffix: "/10"  },
  tmdb:               { displayName: "TMDB",        icon: "T",  color: "#01b4e4", suffix: "/10"  },
  rt_critics:         { displayName: "RT Critics",  icon: "🍅", color: "#fa320a", suffix: "%"    },
  rt_audience:        { displayName: "RT Audience", icon: "🍿", color: "#fa320a", suffix: "%"    },
  metacritic:         { displayName: "Metacritic",  icon: "M",  color: "#ffcc34", suffix: ""     },
  mal:                { displayName: "MAL",         icon: "M",  color: "#2e51a2", suffix: "/10"  },
  anilist:            { displayName: "AniList",     icon: "A",  color: "#02a9ff", suffix: "/100" },
  igdb:               { displayName: "IGDB",        icon: "G",  color: "#9147ff", suffix: "/100" },
  igdb_critics:       { displayName: "IGDB Critics",icon: "G",  color: "#9147ff", suffix: "/100" },
  ign:                { displayName: "IGN",         icon: "I",  color: "#bf1313", suffix: "/10"  },
  google_books:       { displayName: "Google Books",icon: "📖", color: "#4285f4", suffix: "/5"   },
  pitchfork:          { displayName: "Pitchfork",   icon: "🎵", color: "#df2020", suffix: "/10"  },
  steam:              { displayName: "Steam",       icon: "S",  color: "#1b2838", suffix: "%"    },
  spotify_popularity: { displayName: "Spotify",     icon: "S",  color: "#1db954", suffix: "/100" },
  letterboxd:         { displayName: "Letterboxd",  icon: "L",  color: "#00e054", suffix: "/5"   },
  storygraph:         { displayName: "StoryGraph",  icon: "S",  color: "#5c3d2e", suffix: "/5"   },
  rym:                { displayName: "RYM",         icon: "R",  color: "#1a3a5c", suffix: "/5"   },
  aoty:               { displayName: "AOTY",        icon: "A",  color: "#2d2d2d", suffix: "/100" },
  opencritic:         { displayName: "OpenCritic",  icon: "O",  color: "#1c7c36", suffix: "/100" },
};

function scoreColor(score: number, maxScore: number): string {
  const pct = score / maxScore;
  if (pct >= 0.75) return "var(--score-good)";
  if (pct >= 0.5) return "var(--score-mid)";
  return "var(--score-poor)";
}

function steamLabelColor(score: number): string {
  if (score >= 95) return "#66d9c2";
  if (score >= 80) return "#2EC4B6";
  if (score >= 70) return "#8bc34a";
  if (score >= 40) return "#F9A620";
  if (score >= 20) return "#e07b39";
  return "#E84855";
}

// Sources to hide — internal/popularity metrics not meaningful as editorial scores
const HIDDEN_SOURCES = new Set(["igdb_user", "igdb_count", "igdb_critics_count", "google_books_count", "steam_label"]);

/** Shows all external scores from the DB for an item, with fallback to ext JSON */
export function ExternalScoresPanel({
  itemId,
  fallbackExt,
  voteCount = 0,
}: {
  itemId: number;
  fallbackExt?: any;
  voteCount?: number;
}) {
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/scores?itemId=${itemId}`)
      .then((r) => r.json())
      .then((data) => {
        const dbScores = Array.isArray(data)
          ? data.filter((s: ScoreData) =>
              !HIDDEN_SOURCES.has(s.source) &&
              scorePassesThreshold(s.source, fallbackExt || {}, voteCount)
            )
          : [];
        setScores(dbScores);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [itemId, voteCount]);

  // If no DB scores, fall back to ext JSON
  if (loaded && scores.length === 0 && fallbackExt) {
    const entries = Object.entries(fallbackExt) as [string, any][];
    const fallbackScores = entries
      .filter(([source, value]) =>
        !HIDDEN_SOURCES.has(source) &&
        typeof value === "number" &&
        SOURCE_META[source] !== undefined &&
        scorePassesThreshold(source, fallbackExt, voteCount)
      )
      .map(([source, value]) => {
        const maxScoreMap: Record<string, number> = {
          imdb: 10, tmdb: 10, metacritic: 100, mal: 10,
          google_books: 5, pitchfork: 10, ign: 10,
          steam: 100, igdb: 100, igdb_critics: 100,
          rt_critics: 100, spotify_popularity: 100,
        };
        const scoreTypeMap: Record<string, string> = {
          imdb: "community", tmdb: "community", mal: "community",
          metacritic: "critics", igdb_critics: "critics",
          rt_critics: "critics", pitchfork: "critics", ign: "critics",
        };
        return {
          source,
          score: value,
          maxScore: maxScoreMap[source] ?? 10,
          scoreType: scoreTypeMap[source] ?? "community",
          label: "",
        };
      });
    if (fallbackScores.length > 0) {
      return <ScoreCards scores={fallbackScores} />;
    }
    return <NoScoresMessage />;
  }

  if (!loaded) return null;
  if (scores.length === 0) return <NoScoresMessage />;
  return <ScoreCards scores={scores} />;
}

function NoScoresMessage() {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 14,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "1px",
        marginBottom: 10,
      }}>
        External Scores
      </h2>
      <div style={{
        padding: "12px 16px",
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        color: "rgba(255,255,255,0.35)",
        fontSize: 12,
        fontStyle: "italic",
      }}>
        No external scores available. Be the first to rate!
      </div>
    </section>
  );
}

function ScoreCards({ scores }: { scores: ScoreData[] }) {
  if (scores.length === 0) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 14,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "1px",
        marginBottom: 10,
      }}>
        External Scores
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {scores.map((s) => {
          const meta = SOURCE_META[s.source] || {
            displayName: s.source,
            icon: "?",
            color: "#888",
            suffix: "",
          };
          const color = scoreColor(s.score, s.maxScore);
          const displayScore = s.maxScore <= 10
            ? s.score.toFixed(1)
            : Math.round(s.score);

          return (
            <div key={s.source} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              minWidth: 110,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: meta.color + "22", border: `1px solid ${meta.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: meta.icon.length > 1 ? 12 : 11, fontWeight: 900,
                color: meta.color, flexShrink: 0,
              }}>
                {meta.icon}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>
                    {displayScore}
                  </span>
                  <span style={{ fontSize: 9, color: "var(--text-faint)" }}>
                    {meta.suffix}
                  </span>
                </div>
                <div style={{
                  fontSize: 8, color: "var(--text-faint)", marginTop: 2,
                  textTransform: "uppercase", letterSpacing: 0.5,
                }}>
                  {meta.displayName}
                  {s.scoreType === "critics" && " · Critics"}
                  {s.scoreType === "community" && " · Users"}
                </div>
                {s.label && (
                  <div style={{
                    fontSize: 8,
                    color: s.source === "steam" ? steamLabelColor(s.score) : "rgba(255,255,255,0.45)",
                    marginTop: 2,
                    fontWeight: s.source === "steam" ? 600 : 400,
                  }}>
                    {s.label}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Legacy component — shows scores from ext JSON (backward compatible) */
export default function ExternalScores({ ext }: { ext: Partial<Record<ExternalSource, number>> }) {
  const entries = Object.entries(ext) as [string, number][];
  if (entries.length === 0) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 14,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "1px",
        marginBottom: 10,
      }}>
        External Scores
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {entries.map(([source, score]) => {
          const meta = SOURCE_META[source] || {
            displayName: source,
            icon: "?",
            color: "#888",
            suffix: "",
          };
          const maxScore = source === "goodreads" || source === "letterboxd" ? 5 :
                           source === "rt" || source === "meta" || source === "metacritic" || source === "steam" ? 100 : 10;
          const color = scoreColor(score, maxScore);
          const displayScore = maxScore <= 10 ? score.toFixed(1) : Math.round(score);

          return (
            <div key={source} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              minWidth: 110,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: meta.color + "22", border: `1px solid ${meta.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: meta.icon.length > 1 ? 12 : 11, fontWeight: 900, color: meta.color, flexShrink: 0,
              }}>
                {meta.icon}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>
                  {displayScore}{meta.suffix}
                </div>
                <div style={{ fontSize: 8, color: "var(--text-faint)", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {meta.displayName}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
