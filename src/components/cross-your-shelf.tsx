"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TYPES } from "@/lib/data";
import { getItemUrl } from "@/lib/slugs";

interface ItemThumb {
  id: number;
  title: string;
  type: string;
  cover: string | null;
  slug: string | null;
}
interface Connection {
  id: number;
  mode: "because_you_loved" | "discovery";
  sourceItem: ItemThumb;
  recommendedItems: ItemThumb[];
  reason: string;
  themeTags: string[];
  qualityScore: number;
  userVote: -1 | 0 | 1;
}

export default function CrossYourShelf({ refreshKey }: { refreshKey?: number }) {
  const [mode, setMode] = useState<Connection["mode"] | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cross-connections")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { mode: Connection["mode"]; connections: Connection[] }) => {
        if (cancelled) return;
        setMode(data.mode);
        setConnections(data.connections ?? []);
      })
      .catch(() => { if (!cancelled) { setMode("discovery"); setConnections([]); }});
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (!connections) return <Skeleton />;
  if (connections.length === 0) return null;

  const title = mode === "because_you_loved" ? "Cross your shelf" : "Discover connections across media";
  const subtitle = mode === "because_you_loved"
    ? "Connections across your taste that only CrossShelf can see"
    : "Editorial picks to help you see between media";

  // Ultrawide (≥1920): up to 6 visible. Laptop-standard (1024-1919): 3.
  // Tablet (640-1023): 2. Mobile (<640): 2.
  return (
    <section style={{ marginBottom: "clamp(24px, 3vw, 40px)" }}>
      <Header title={title} subtitle={subtitle} />
      <div
        className="cross-shelf-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
        }}
      >
        {connections.map((c) => (
          <ConnectionCard key={c.id} connection={c} />
        ))}
      </div>
      <style>{`
        /* Ultrawide — more picks visible */
        @media (min-width: 1920px) {
          .cross-shelf-grid {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
        /* Tablet / large mobile */
        @media (max-width: 1023px) {
          .cross-shelf-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          /* Trim to 2 on tablet to avoid lopsided row */
          .cross-shelf-grid > *:nth-child(n+3) {
            display: none !important;
          }
        }
        /* Mobile */
        @media (max-width: 639px) {
          .cross-shelf-grid {
            grid-template-columns: 1fr !important;
          }
          /* Mobile shows 2 connections, not more */
          .cross-shelf-grid > *:nth-child(n+3) {
            display: none !important;
          }
        }
      `}</style>
    </section>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontFamily: "var(--font-serif)",
        fontSize: 20,
        fontWeight: 500,
        color: "#fff",
        lineHeight: 1.1,
      }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: "rgba(232,230,225,0.25)", marginTop: 4 }}>
        {subtitle}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <section style={{ marginBottom: "clamp(24px, 3vw, 40px)" }}>
      <Header title="Cross your shelf" subtitle="Loading connections…" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.04)",
              borderRadius: 10,
              height: 220,
            }}
          />
        ))}
      </div>
    </section>
  );
}

// ── Connection card ────────────────────────────────────────────────────────

function ConnectionCard({ connection }: { connection: Connection }) {
  const [vote, setVote] = useState<-1 | 0 | 1>(connection.userVote);
  const [submitting, setSubmitting] = useState(false);

  const submitVote = useCallback(async (next: -1 | 1) => {
    if (submitting) return;
    // Toggle: clicking the active direction clears the vote.
    const final: -1 | 0 | 1 = vote === next ? 0 : next;
    const prev = vote;
    setVote(final);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cross-connections/${connection.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: final }),
      });
      if (!res.ok) setVote(prev);
    } catch {
      setVote(prev);
    } finally {
      setSubmitting(false);
    }
  }, [connection.id, vote, submitting]);

  const items = [connection.sourceItem, ...connection.recommendedItems].filter(Boolean);

  return (
    <div
      style={{
        position: "relative",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 10,
        padding: 18,
        transition: "border-color 200ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(46,196,182,0.15)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}
    >
      {/* "Because you loved X" */}
      <div style={{ fontSize: 12, color: "rgba(232,230,225,0.45)", marginBottom: 12, lineHeight: 1.3 }}>
        {connection.mode === "because_you_loved" ? "Because you loved " : "If you love "}
        <Link
          href={getItemUrl(connection.sourceItem as any)}
          style={{ color: "#2EC4B6", fontWeight: 700, textDecoration: "none" }}
        >
          {connection.sourceItem.title}
        </Link>
      </div>

      {/* Items chain: source → rec1 → rec2 (horizontal ≥640px, vertical on mobile) */}
      <div
        className="cross-shelf-chain"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "nowrap",
          overflow: "hidden",
        }}
      >
        {items.map((it, idx) => (
          <Fragment key={`chain-${idx}-${it.id}`}>
            {idx > 0 && (
              <span
                aria-hidden
                className="cross-shelf-arrow"
                style={{ color: "rgba(232,230,225,0.1)", fontSize: 16, lineHeight: 1 }}
              >
                →
              </span>
            )}
            <ItemThumbnail item={it} />
          </Fragment>
        ))}
      </div>
      <style>{`
        @media (max-width: 639px) {
          .cross-shelf-chain {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
          }
          .cross-shelf-arrow {
            transform: rotate(90deg);
            line-height: 1 !important;
          }
        }
      `}</style>

      {/* Reason */}
      <div style={{
        fontSize: 11,
        color: "rgba(232,230,225,0.35)",
        fontStyle: "italic",
        marginTop: 12,
        lineHeight: 1.5,
      }}>
        {connection.reason}
      </div>

      {/* Quality feedback: thumbs up / down */}
      <div style={{
        position: "absolute",
        right: 10,
        bottom: 8,
        display: "flex",
        gap: 6,
      }}>
        <VoteBtn
          active={vote === 1}
          activeColor="#2EC4B6"
          label="Helpful"
          onClick={() => submitVote(1)}
        >
          <ThumbUp />
        </VoteBtn>
        <VoteBtn
          active={vote === -1}
          activeColor="#E84855"
          label="Not helpful"
          onClick={() => submitVote(-1)}
        >
          <ThumbDown />
        </VoteBtn>
      </div>
    </div>
  );
}

// ── Item thumbnail ─────────────────────────────────────────────────────────

function ItemThumbnail({ item }: { item: ItemThumb }) {
  const t = (TYPES as Record<string, { label: string; icon: string; color: string }>)[item.type] || { color: "#888", icon: "?", label: item.type };
  const href = getItemUrl(item as any);
  return (
    <Link
      href={href}
      style={{
        position: "relative",
        width: 52,
        height: 72,
        flexShrink: 0,
        borderRadius: 5,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "block",
        textDecoration: "none",
        transition: "transform 150ms",
        background: `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.04)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
      title={item.title}
    >
      {item.cover?.startsWith("http") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.cover}
          alt={item.title}
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
      {/* Media type badge */}
      <span
        style={{
          position: "absolute",
          bottom: -5,
          left: "50%",
          transform: "translateX(-50%)",
          background: t.color,
          color: "#fff",
          fontSize: 7,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 4,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          whiteSpace: "nowrap",
        }}
      >
        {t.label.replace(/s$/, "")}
      </span>
    </Link>
  );
}

// ── Vote button + icons ────────────────────────────────────────────────────

function VoteBtn({
  active, activeColor, label, onClick, children,
}: {
  active: boolean;
  activeColor: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        // 44×44 minimum touch target on mobile. Wider hit-zone than the
        // 10px icon, but the icon itself doesn't look larger.
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        cursor: "pointer",
        color: active ? activeColor : "rgba(232,230,225,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 150ms",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "rgba(232,230,225,0.4)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "rgba(232,230,225,0.15)";
      }}
    >
      {children}
    </button>
  );
}

function ThumbUp() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.3l.9-4.5.1-.3c0-.4-.2-.8-.4-1.1L14.2 1 7.6 7.6c-.4.4-.6.9-.6 1.4V19c0 1.1.9 2 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7c.1-.3.2-.5.2-.8v-2z" />
    </svg>
  );
}
function ThumbDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" />
    </svg>
  );
}
