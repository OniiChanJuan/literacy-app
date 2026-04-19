"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TYPES } from "@/lib/data";
import { getItemUrl } from "@/lib/slugs";

// ── Types ──────────────────────────────────────────────────────────────────

type ActivityKind = "review" | "rating" | "library";

interface ActivityEntry {
  kind: ActivityKind;
  createdAt: string;
  user: { id: string; name: string; memberNumber: number | null; avatar: string | null };
  item: { id: number; title: string; type: string; cover: string | null; slug: string | null; genre: string[] };
  rating?: number;
  reviewSnippet?: string;
  libraryStatus?: string;
}

interface TrendingItem {
  id: number;
  title: string;
  type: string;
  cover: string | null;
  slug: string | null;
  ratingCount: number;
  window: "7d" | "all-time";
}

// ── Top-level section ──────────────────────────────────────────────────────

export default function WhatsHappening({ refreshKey }: { refreshKey?: number }) {
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [trending, setTrending] = useState<TrendingItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/activity-public?limit=8")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setActivity(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setActivity([]); });
    fetch("/api/trending")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setTrending(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setTrending([]); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // If both feeds are empty (brand-new platform with no users yet) don't
  // render the whole section rather than show a hollow skeleton.
  if (activity && trending && activity.length === 0 && trending.length === 0) {
    return null;
  }

  return (
    <section style={{ marginBottom: "clamp(24px, 3vw, 40px)" }}>
      <div
        className="whats-happening-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "5fr 2fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div>
          <Header title="What's happening" subtitle="Recent activity from people with similar taste" />
          <ActivityFeed entries={activity} />
        </div>
        <div className="whats-happening-sidebar">
          <TrendingSidebar items={trending} />
        </div>
      </div>
      <style>{`
        /* Laptop-and-smaller: hide the trending sidebar entirely, activity
           feed takes full width. Mobile doesn't need a denser discovery UI
           — the feed is enough. */
        @media (max-width: 1023px) {
          .whats-happening-grid {
            grid-template-columns: 1fr !important;
          }
          .whats-happening-sidebar {
            display: none !important;
          }
        }
        /* Mobile: cap activity feed at 3 items. */
        @media (max-width: 639px) {
          .activity-feed-list > *:nth-child(n+4) {
            display: none !important;
          }
        }
        /* Tablet / small laptop: cap activity feed at 4 items. */
        @media (min-width: 640px) and (max-width: 1439px) {
          .activity-feed-list > *:nth-child(n+5) {
            display: none !important;
          }
        }
        /* Desktop: 6 items. Ultrawide inherits all 8 fetched. */
        @media (min-width: 1440px) and (max-width: 1919px) {
          .activity-feed-list > *:nth-child(n+7) {
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

// ── Activity feed ──────────────────────────────────────────────────────────

function ActivityFeed({ entries }: { entries: ActivityEntry[] | null }) {
  if (!entries) return <ActivitySkeleton />;
  if (entries.length === 0) {
    return (
      <div style={{
        padding: "24px 18px",
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.03)",
        borderRadius: 8,
        color: "rgba(232,230,225,0.35)",
        fontSize: 13,
        textAlign: "center",
      }}>
        No activity yet — be the first to rate or review something.
      </div>
    );
  }

  return (
    <div className="activity-feed-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map((e, idx) => (
        <ActivityRow key={`${e.kind}-${e.user.id}-${e.item.id}-${idx}`} entry={e} />
      ))}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 78,
            background: "rgba(255,255,255,0.015)",
            border: "1px solid rgba(255,255,255,0.03)",
            borderRadius: 8,
          }}
        />
      ))}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const t = (TYPES as Record<string, { label: string; icon: string; color: string }>)[entry.item.type] || { color: "#888", label: entry.item.type, icon: "?" };
  const href = getItemUrl(entry.item as any);
  const verb = actionVerb(entry);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.03)",
        borderRadius: 8,
        alignItems: "center",
      }}
    >
      {/* Cover thumbnail */}
      <Link
        href={href}
        style={{
          position: "relative",
          width: 40,
          height: 56,
          flexShrink: 0,
          borderRadius: 4,
          overflow: "hidden",
          background: `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
          display: "block",
        }}
      >
        {entry.item.cover?.startsWith("http") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.item.cover}
            alt={entry.item.title}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </Link>

      {/* Middle: sentence + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.35, color: "rgba(232,230,225,0.8)" }}>
          <Link
            href={`/user/${entry.user.id}`}
            style={{ color: "#fff", fontWeight: 500, textDecoration: "none" }}
          >
            {entry.user.name}
          </Link>
          <span style={{ color: "rgba(232,230,225,0.45)" }}> {verb} </span>
          <Link
            href={href}
            style={{ color: "#2EC4B6", textDecoration: "none" }}
          >
            {entry.item.title}
          </Link>
        </div>
        <div style={{
          fontSize: 11,
          color: "rgba(232,230,225,0.2)",
          marginTop: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {t.label.replace(/s$/, "")}
          {entry.item.genre?.[0] ? ` · ${entry.item.genre[0]}` : ""}
          {" · "}{timeAgo(entry.createdAt)}
        </div>
        {entry.kind === "review" && entry.reviewSnippet && (
          <div style={{
            fontSize: 12,
            color: "rgba(232,230,225,0.35)",
            fontStyle: "italic",
            marginTop: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            &ldquo;{entry.reviewSnippet}{entry.reviewSnippet.length >= 50 ? "…" : ""}&rdquo;
          </div>
        )}
      </div>

      {/* Right: star rating or "Wants to ..." */}
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        {entry.rating ? (
          <div style={{ color: "#DAA520", fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>
            {"★".repeat(entry.rating)}
            <span style={{ color: "rgba(218,165,32,0.25)" }}>{"★".repeat(5 - entry.rating)}</span>
          </div>
        ) : entry.libraryStatus === "want_to" ? (
          <div style={{ fontSize: 11, color: "rgba(232,230,225,0.35)" }}>
            Wants to {wantVerbFor(entry.item.type)}
          </div>
        ) : entry.libraryStatus === "in_progress" ? (
          <div style={{ fontSize: 11, color: "rgba(232,230,225,0.35)" }}>In progress</div>
        ) : entry.libraryStatus === "completed" ? (
          <div style={{ fontSize: 11, color: "#2EC4B6" }}>Finished</div>
        ) : null}
      </div>
    </div>
  );
}

function actionVerb(e: ActivityEntry): string {
  if (e.kind === "review") return "reviewed";
  if (e.kind === "rating") return "rated";
  if (e.kind === "library") {
    if (e.libraryStatus === "want_to") return "added";
    if (e.libraryStatus === "in_progress") return "started";
    if (e.libraryStatus === "completed") return "finished";
    return "saved";
  }
  return "touched";
}

function wantVerbFor(type: string): string {
  if (type === "movie") return "watch";
  if (type === "tv" || type === "podcast") return "watch";
  if (type === "book" || type === "manga" || type === "comic") return "read";
  if (type === "game") return "play";
  if (type === "music") return "hear";
  return "see";
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

// ── Trending sidebar ───────────────────────────────────────────────────────

function TrendingSidebar({ items }: { items: TrendingItem[] | null }) {
  if (!items) return <TrendingSkeleton />;
  if (items.length === 0) return null;

  const label = items[0]?.window === "all-time" ? "Most rated" : "Trending this week";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.04)",
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 2,
        color: "rgba(232,230,225,0.25)",
        marginBottom: 14,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((it, idx) => (
          <TrendingRow key={it.id} item={it} rank={idx + 1} />
        ))}
      </div>
    </div>
  );
}

function TrendingSkeleton() {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.04)",
      borderRadius: 10,
      padding: 16,
      height: 290,
    }} />
  );
}

function TrendingRow({ item, rank }: { item: TrendingItem; rank: number }) {
  const t = (TYPES as Record<string, { label: string; icon: string; color: string }>)[item.type] || { color: "#888", label: item.type, icon: "?" };
  return (
    <Link
      href={getItemUrl(item as any)}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        color: "rgba(232,230,225,0.15)",
        width: 14,
        flexShrink: 0,
        textAlign: "right",
      }}>
        {rank}
      </span>
      <div style={{
        width: 30,
        height: 42,
        flexShrink: 0,
        borderRadius: 4,
        overflow: "hidden",
        background: `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
      }}>
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
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 500,
          color: "#fff",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {item.title}
        </div>
        <div style={{ fontSize: 10, color: "rgba(232,230,225,0.2)", marginTop: 2 }}>
          {t.label.replace(/s$/, "")}
          {" · "}
          {item.ratingCount} rating{item.ratingCount === 1 ? "" : "s"}
        </div>
      </div>
    </Link>
  );
}
