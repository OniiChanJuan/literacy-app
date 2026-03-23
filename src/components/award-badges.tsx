"use client";

import Link from "next/link";
import { AWARDS } from "@/lib/awards";

export default function AwardBadges({ awards }: { awards: string[] }) {
  if (awards.length === 0) return null;

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
        Awards
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {awards.map((key) => {
          const award = AWARDS[key];
          if (!award) return null;

          return (
            <Link
              key={key}
              href={`/awards/${key}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                background: award.color + "15",
                border: `1px solid ${award.color}30`,
                borderRadius: 12,
                textDecoration: "none",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 4px 16px ${award.color}33`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <span style={{ fontSize: 16 }}>{award.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: award.color }}>
                {award.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
