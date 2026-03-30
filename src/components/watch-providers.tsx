"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface ProviderData {
  name: string;
  logo: string;
  type: "stream" | "rent" | "buy";
}

interface WatchProvidersProps {
  title: string;
  year: number;
  mediaType: "movie" | "tv";
  tmdbId?: number;
  genres?: string[];
}

export default function WatchProviders({ title, year, mediaType, tmdbId, genres }: WatchProvidersProps) {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAnime = (genres || []).some(g => g.toLowerCase() === "anime" || g.toLowerCase() === "animation");

  useEffect(() => {
    const params = new URLSearchParams({ type: mediaType });
    if (tmdbId) {
      params.set("tmdbId", String(tmdbId));
    } else {
      params.set("title", title);
      params.set("year", String(year));
    }

    fetch(`/api/watch-providers?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setProviders(data.providers || []);
        setLink(data.link || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [title, year, mediaType, tmdbId]);

  const justWatchSearch = `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;
  const sectionLink = link || justWatchSearch;

  if (loading) {
    return (
      <section style={{ marginBottom: 24 }}>
        <SectionHeading mediaType={mediaType} />
        <div style={{ fontSize: 11, color: "var(--text-faint)", padding: "8px 0" }}>
          Checking availability…
        </div>
      </section>
    );
  }

  const streaming = providers.filter((p) => p.type === "stream");
  const rentBuy = providers.filter((p) => p.type === "rent" || p.type === "buy");

  // Anime fallback links: Crunchyroll + HiDive (if not already in streaming providers)
  const streamingNames = new Set(streaming.map(p => p.name.toLowerCase()));
  const showCrunchyroll = isAnime && !streamingNames.has("crunchyroll");
  const showHidive = isAnime && !streamingNames.has("hidive");

  if (providers.length === 0 && !showCrunchyroll && !showHidive) {
    return (
      <section style={{ marginBottom: 24 }}>
        <SectionHeading mediaType={mediaType} />
        <div style={{
          fontSize: 12,
          color: "var(--text-faint)",
          padding: "12px 14px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 10,
          border: "0.5px solid rgba(255,255,255,0.06)",
        }}>
          Streaming availability not found.{" "}
          <a
            href={justWatchSearch}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3185FC", textDecoration: "none" }}
          >
            Check JustWatch →
          </a>
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <SectionHeading mediaType={mediaType} />

      {streaming.length > 0 && (
        <div style={{ marginBottom: rentBuy.length > 0 ? 14 : 0 }}>
          <div style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Stream
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {streaming.map((p) => (
              <ProviderPill key={p.name} provider={p} href={sectionLink} />
            ))}
            {showCrunchyroll && (
              <FallbackPill
                label="Crunchyroll"
                href={`https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`}
                bg="#F47521"
              />
            )}
            {showHidive && (
              <FallbackPill
                label="HiDive"
                href={`https://www.hidive.com/search?q=${encodeURIComponent(title)}`}
                bg="#00BAFF"
              />
            )}
          </div>
        </div>
      )}

      {/* Anime fallbacks when no stream providers at all */}
      {streaming.length === 0 && (showCrunchyroll || showHidive) && (
        <div style={{ marginBottom: rentBuy.length > 0 ? 14 : 0 }}>
          <div style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Stream
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {showCrunchyroll && (
              <FallbackPill
                label="Crunchyroll"
                href={`https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`}
                bg="#F47521"
              />
            )}
            {showHidive && (
              <FallbackPill
                label="HiDive"
                href={`https://www.hidive.com/search?q=${encodeURIComponent(title)}`}
                bg="#00BAFF"
              />
            )}
          </div>
        </div>
      )}

      {rentBuy.length > 0 && (
        <div>
          <div style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Rent / Buy
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {rentBuy.map((p) => (
              <ProviderPill key={p.name} provider={p} href={sectionLink} />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
          Availability may vary by region ·{" "}
          <a
            href={sectionLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none" }}
          >
            All options on JustWatch →
          </a>
        </span>
      </div>
    </section>
  );
}

function ProviderPill({ provider, href }: { provider: ProviderData; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 14px 7px 7px",
        background: "rgba(255,255,255,0.05)",
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        transition: "transform 0.15s, box-shadow 0.15s, background 0.15s",
        cursor: "pointer",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.boxShadow = "";
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
      }}
    >
      <Image
        src={provider.logo}
        alt={provider.name}
        width={28}
        height={28}
        quality={75}
        style={{ borderRadius: 6, objectFit: "cover" }}
      />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>
        {provider.name}
      </span>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>↗</span>
    </a>
  );
}

function FallbackPill({ label, href, bg }: { label: string; href: string; bg: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 14px",
        background: bg,
        borderRadius: 10,
        transition: "transform 0.15s, box-shadow 0.15s",
        cursor: "pointer",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 20px ${bg}66`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.boxShadow = "";
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{label}</span>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>↗</span>
    </a>
  );
}

function SectionHeading({ mediaType }: { mediaType: "movie" | "tv" }) {
  return (
    <h2 style={{
      fontFamily: "var(--font-serif)",
      fontSize: 14,
      fontWeight: 700,
      color: "var(--text-muted)",
      textTransform: "uppercase",
      letterSpacing: "1px",
      marginBottom: 12,
    }}>
      {mediaType === "movie" ? "Where to Watch" : "Where to Watch"}
    </h2>
  );
}
