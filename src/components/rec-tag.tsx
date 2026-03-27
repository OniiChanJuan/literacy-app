"use client";

import type { RecTag as RecTagType } from "@/lib/data";

const OPTIONS: { key: RecTagType; label: string; icon: string; color: string }[] = [
  { key: "recommend", label: "Recommend", icon: "👍", color: "#2EC4B6" },
  { key: "mixed",     label: "Mixed",     icon: "🤷", color: "#F9A620" },
  { key: "skip",      label: "Skip",      icon: "👎", color: "#E84855" },
];

interface RecTagProps {
  value: RecTagType | null;
  onChange: (tag: RecTagType | null) => void;
}

export default function RecTag({ value, onChange }: RecTagProps) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {OPTIONS.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            aria-label={o.label}
            onClick={(e) => {
              e.stopPropagation();
              onChange(active ? null : o.key);
            }}
            style={{
              background: active ? o.color : "rgba(255,255,255,0.05)",
              color: active ? "#fff" : "rgba(255,255,255,0.4)",
              border: active ? "none" : "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              transition: "all 0.2s",
            }}
          >
            <span>{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
