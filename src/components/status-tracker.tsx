"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Item, TYPES } from "@/lib/data";
import { useLibrary, isOngoing, progressUnit, type LibraryStatus } from "@/lib/library-context";

const STATUSES: { key: LibraryStatus; label: string; icon: string; color: string }[] = [
  { key: "completed",   label: "Completed",  icon: "✓", color: "#2EC4B6" },
  { key: "in_progress", label: "In Progress", icon: "▶", color: "#3185FC" },
  { key: "want_to",     label: "Want To",     icon: "＋", color: "#9B5DE5" },
  { key: "dropped",     label: "Dropped",     icon: "✕", color: "#E84855" },
];

export default function StatusTracker({ item }: { item: Item }) {
  const { data: session } = useSession();

  if (!session?.user) {
    return (
      <div style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 24,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>📝</div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 12 }}>
          Sign in to track this
        </div>
        <Link href="/login" style={{
          display: "inline-block",
          padding: "8px 20px",
          borderRadius: 10,
          background: "#E84855",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
        }}>
          Sign In
        </Link>
      </div>
    );
  }
  const { entries, setStatus, setProgress } = useLibrary();
  const entry = entries[item.id];
  const currentStatus = entry?.status ?? null;
  const ongoing = isOngoing(item.type);
  const unit = progressUnit(item.type);

  return (
    <div style={{
      background: "var(--surface-1)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      padding: 24,
    }}>
      <div style={{
        fontFamily: "var(--font-serif)",
        fontSize: 14,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "1px",
        marginBottom: 16,
      }}>
        Track
      </div>

      {/* Status buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {STATUSES.map((s) => {
          const active = currentStatus === s.key;
          const label = s.key === "completed" && ongoing ? "Caught Up" : s.label;

          return (
            <button
              key={s.key}
              aria-label={label}
              onClick={() => setStatus(item.id, active ? null : s.key)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px 8px",
                borderRadius: 10,
                border: active ? `1.5px solid ${s.color}` : "1px solid var(--border)",
                background: active ? s.color + "22" : "var(--surface-2, rgba(255,255,255,0.04))",
                color: active ? s.color : "var(--text-muted)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 13 }}>{s.icon}</span>
              {label}
            </button>
          );
        })}
      </div>

      {/* Progress input for In Progress items */}
      {currentStatus === "in_progress" && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            Progress ({unit})
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              min={0}
              max={item.totalEp || undefined}
              value={entry?.progress ?? 0}
              onChange={(e) => setProgress(item.id, parseInt(e.target.value) || 0)}
              style={{
                width: 70,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface-2, rgba(255,255,255,0.04))",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                textAlign: "center",
                outline: "none",
              }}
            />
            {item.totalEp > 0 && (
              <>
                <span style={{ color: "var(--text-faint)", fontSize: 13 }}>of</span>
                <span style={{ color: "var(--text-muted)", fontSize: 14, fontWeight: 600 }}>
                  {item.totalEp}
                </span>
              </>
            )}
          </div>

          {/* Progress bar */}
          {item.totalEp > 0 && (
            <div style={{
              marginTop: 10,
              height: 6,
              borderRadius: 3,
              background: "rgba(255,255,255,0.06)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                borderRadius: 3,
                background: "#3185FC",
                width: `${Math.min(100, ((entry?.progress ?? 0) / item.totalEp) * 100)}%`,
                transition: "width 0.2s",
              }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
