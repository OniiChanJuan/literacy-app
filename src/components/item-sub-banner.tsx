"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import type { Item, RecTag as RecTagType } from "@/lib/data";
import { useRatings } from "@/lib/ratings-context";
import { useLibrary, isOngoing, type LibraryStatus } from "@/lib/library-context";
import Stars from "./stars";

interface ScoreData {
  source: string;
  score: number;
  maxScore: number;
  scoreType: string;
  label: string;
}

interface AggregateData {
  avg: string;
  count: number;
  dist: [number, number, number, number, number];
  recPct: number;
}

const SOURCE_META: Record<string, { displayName: string; suffix: string }> = {
  imdb: { displayName: "IMDb", suffix: "/10" },
  rt_critics: { displayName: "RT Critics", suffix: "%" },
  rt_audience: { displayName: "RT Audience", suffix: "%" },
  rt: { displayName: "Rotten Tomatoes", suffix: "%" },
  meta: { displayName: "Metacritic", suffix: "" },
  metacritic: { displayName: "Metacritic", suffix: "" },
  mal: { displayName: "MAL", suffix: "/10" },
  anilist: { displayName: "AniList", suffix: "/100" },
  ign: { displayName: "IGN", suffix: "/10" },
  goodreads: { displayName: "Goodreads", suffix: "/5" },
  pitchfork: { displayName: "Pitchfork", suffix: "/10" },
  steam: { displayName: "Steam", suffix: "%" },
  letterboxd: { displayName: "Letterboxd", suffix: "/5" },
  storygraph: { displayName: "StoryGraph", suffix: "/5" },
  rym: { displayName: "RYM", suffix: "/5" },
  aoty: { displayName: "AOTY", suffix: "/100" },
  opencritic: { displayName: "OpenCritic", suffix: "/100" },
};

const HIDDEN_SOURCES = new Set(["igdb_user", "spotify_popularity"]);

function sColor(score: number, maxScore: number): string {
  const pct = score / maxScore;
  if (pct >= 0.75) return "#2EC4B6";
  if (pct >= 0.5) return "#F9A620";
  return "#E84855";
}

const REC_OPTIONS: { key: RecTagType; label: string; icon: string; color: string }[] = [
  { key: "recommend", label: "Recommend", icon: "👍", color: "#2EC4B6" },
  { key: "mixed", label: "Mixed", icon: "🤷", color: "#F9A620" },
  { key: "skip", label: "Skip", icon: "👎", color: "#E84855" },
];

const STATUSES: { key: LibraryStatus; label: string; icon: string; color: string }[] = [
  { key: "completed", label: "Completed", icon: "✓", color: "#2EC4B6" },
  { key: "want_to", label: "Want to", icon: "＋", color: "#9B5DE5" },
];

const ALL_STATUSES: { key: LibraryStatus; label: string; icon: string; color: string }[] = [
  { key: "completed", label: "Completed", icon: "✓", color: "#2EC4B6" },
  { key: "in_progress", label: "In Progress", icon: "▶", color: "#3185FC" },
  { key: "want_to", label: "Want to", icon: "＋", color: "#9B5DE5" },
  { key: "dropped", label: "Dropped", icon: "✕", color: "#E84855" },
];

interface SubBannerProps {
  item: Item;
  typeColor: string;
  heroColor?: string;
}

export default function ItemSubBanner({ item, typeColor, heroColor }: SubBannerProps) {
  const { data: session } = useSession();
  const { ratings, recTags, rate, setRecTag } = useRatings();
  const { entries, setStatus } = useLibrary();
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [agg, setAgg] = useState<AggregateData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false);

  const currentRating = ratings[item.id] || 0;
  const currentRec = recTags[item.id] ?? null;
  const entry = entries[item.id];
  const currentStatus = entry?.status ?? null;
  const ongoing = isOngoing(item.type);
  const rgb = hexToRgb(heroColor || typeColor);

  useEffect(() => {
    // Fetch external scores and community aggregate in parallel
    Promise.all([
      fetch(`/api/scores?itemId=${item.id}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/items/${item.id}/aggregate`).then((r) => r.json()).catch(() => null),
    ]).then(([scoreData, aggData]) => {
      const dbScores = Array.isArray(scoreData) ? scoreData.filter((s: ScoreData) => !HIDDEN_SOURCES.has(s.source)) : [];
      setScores(dbScores);
      setAgg(aggData?.count > 0 ? aggData : null);
      setLoaded(true);
    });
  }, [item.id]);

  // Fallback to ext JSON if no DB scores
  const displayScores: ScoreData[] = scores.length > 0 ? scores : (() => {
    if (!loaded) return [];
    const entries = Object.entries(item.ext || {}) as [string, number][];
    return entries
      .filter(([source]) => !HIDDEN_SOURCES.has(source))
      .map(([source, value]) => {
        const config: Record<string, { maxScore: number; scoreType: string }> = {
          imdb: { maxScore: 10, scoreType: "community" },
          rt: { maxScore: 100, scoreType: "critics" },
          meta: { maxScore: 100, scoreType: "critics" },
          metacritic: { maxScore: 100, scoreType: "critics" },
          mal: { maxScore: 10, scoreType: "community" },
          goodreads: { maxScore: 5, scoreType: "community" },
          pitchfork: { maxScore: 10, scoreType: "critics" },
          ign: { maxScore: 10, scoreType: "critics" },
          steam: { maxScore: 100, scoreType: "community" },
        };
        const c = config[source] || { maxScore: 10, scoreType: "community" };
        return { source, score: value, maxScore: c.maxScore, scoreType: c.scoreType, label: "" };
      });
  })();

  const statusButtons = showAllStatuses ? ALL_STATUSES : STATUSES;

  return (
    <div style={{
      padding: "10px 0",
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    }}>
      {/* Left — scores (external + community) */}
      <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
        {displayScores.map((s) => {
          const meta = SOURCE_META[s.source] || { displayName: s.source, suffix: "" };
          const color = sColor(s.score, s.maxScore);
          const displayScore = s.maxScore <= 10 ? s.score.toFixed(1) : Math.round(s.score);

          return (
            <div key={s.source} style={{
              background: `rgba(${rgb}, 0.06)`,
              border: `0.5px solid rgba(${rgb}, 0.12)`,
              borderRadius: 6,
              padding: "5px 12px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 500, color, lineHeight: 1.2 }}>
                {displayScore}
              </div>
              <div style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginTop: 1 }}>
                {meta.displayName}
              </div>
            </div>
          );
        })}

        {/* Literacy community score */}
        {agg && (
          <>
            <div style={{
              background: `rgba(${rgb}, 0.06)`,
              border: `0.5px solid rgba(${rgb}, 0.12)`,
              borderRadius: 6,
              padding: "5px 12px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: sColor(parseFloat(agg.avg), 5), lineHeight: 1.2 }}>
                {agg.avg}
              </div>
              <div style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginTop: 1 }}>
                Literacy
              </div>
            </div>

            {/* Recommend % */}
            <div style={{
              background: `rgba(${rgb}, 0.06)`,
              border: `0.5px solid rgba(${rgb}, 0.12)`,
              borderRadius: 6,
              padding: "5px 12px",
              textAlign: "center",
            }}>
              <div style={{
                fontSize: 16,
                fontWeight: 500,
                color: agg.recPct >= 70 ? "#2EC4B6" : agg.recPct >= 40 ? "#F9A620" : "#E84855",
                lineHeight: 1.2,
              }}>
                {agg.recPct}%
              </div>
              <div style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginTop: 1 }}>
                Recommend
              </div>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div style={{
        width: 0.5,
        height: 28,
        background: "rgba(255,255,255,0.06)",
        flexShrink: 0,
      }} />

      {/* Right — rating + track */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
        {session?.user ? (
          <>
            {/* Stars */}
            <Stars rating={currentRating} onRate={(s) => rate(item.id, s)} size={16} />

            {/* Rec tags — show after rating */}
            {currentRating > 0 && (
              <div style={{ display: "flex", gap: 4 }}>
                {REC_OPTIONS.map((o) => {
                  const active = currentRec === o.key;
                  return (
                    <button
                      key={o.key}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecTag(item.id, active ? null : o.key);
                      }}
                      style={{
                        background: active ? o.color : "rgba(255,255,255,0.04)",
                        color: active ? "#fff" : "rgba(255,255,255,0.3)",
                        border: active ? "none" : "0.5px solid rgba(255,255,255,0.08)",
                        borderRadius: 6,
                        padding: "3px 8px",
                        fontSize: 8,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <span style={{ fontSize: 9 }}>{o.icon}</span>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Track buttons */}
            <div style={{ display: "flex", gap: 4, position: "relative" }}>
              {statusButtons.map((s) => {
                const active = currentStatus === s.key;
                const label = s.key === "completed" && ongoing ? "Caught Up" : s.label;
                return (
                  <button
                    key={s.key}
                    onClick={() => setStatus(item.id, active ? null : s.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: active ? `0.5px solid rgba(${hexToRgb(s.color)}, 0.25)` : "0.5px solid rgba(255,255,255,0.08)",
                      background: active ? `rgba(${hexToRgb(s.color)}, 0.15)` : "rgba(255,255,255,0.04)",
                      color: active ? s.color : "rgba(255,255,255,0.3)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 8 }}>{s.icon}</span>
                    {label}
                  </button>
                );
              })}
              {!showAllStatuses && (
                <button
                  onClick={() => setShowAllStatuses(true)}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.2)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  ···
                </button>
              )}
            </div>
          </>
        ) : (
          <Link href="/login" style={{
            padding: "4px 12px",
            borderRadius: 6,
            background: "#E84855",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            textDecoration: "none",
          }}>
            Sign in to rate
          </Link>
        )}
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}
