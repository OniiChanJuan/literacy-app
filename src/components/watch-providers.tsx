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
  itemId?: number;
}

const REGIONS = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "JP", label: "Japan" },
  { code: "BR", label: "Brazil" },
  { code: "IN", label: "India" },
  { code: "MX", label: "Mexico" },
];

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function WatchProviders({ title, year, mediaType, tmdbId, itemId }: WatchProvidersProps) {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("watchRegion") || "US";
    }
    return "US";
  });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ type: mediaType, region });
    if (tmdbId) {
      params.set("tmdbId", String(tmdbId));
    } else {
      params.set("title", title);
      params.set("year", String(year));
    }
    if (itemId) params.set("itemId", String(itemId));

    fetch(`/api/watch-providers?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setProviders(data.providers || []);
        setLink(data.link || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [title, year, mediaType, tmdbId, itemId, region]);

  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRegion = e.target.value;
    setRegion(newRegion);
    if (typeof window !== "undefined") {
      localStorage.setItem("watchRegion", newRegion);
    }
  };

  const regionLabel = REGIONS.find((r) => r.code === region)?.label || region;
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

  // No providers — trust TMDB data, no guessing
  if (providers.length === 0) {
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
          {region !== "US" ? (
            <>
              No streaming data for {regionLabel}.{" "}
              <button
                onClick={() => setRegion("US")}
                style={{ color: "#3185FC", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12 }}
              >
                Try US →
              </button>
            </>
          ) : (
            <>
              Streaming availability not found.{" "}
              <a
                href={justWatchSearch}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#3185FC", textDecoration: "none" }}
              >
                Check JustWatch →
              </a>
            </>
          )}
        </div>
        <RegionFooter region={region} regionLabel={regionLabel} sectionLink={sectionLink} onRegionChange={handleRegionChange} />
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

      <RegionFooter region={region} regionLabel={regionLabel} sectionLink={sectionLink} onRegionChange={handleRegionChange} />
    </section>
  );
}

function RegionFooter({
  region,
  regionLabel,
  sectionLink,
  onRegionChange,
}: {
  region: string;
  regionLabel: string;
  sectionLink: string;
  onRegionChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Region:</span>
      <select
        value={region}
        onChange={onRegionChange}
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.6)",
          background: "rgba(255,255,255,0.06)",
          border: "0.5px solid rgba(255,255,255,0.14)",
          borderRadius: 4,
          padding: "2px 6px",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {REGIONS.map((r) => (
          <option key={r.code} value={r.code} style={{ background: "#1a1a1a" }}>
            {r.label}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>·</span>
      <a
        href={sectionLink}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}
      >
        All options on JustWatch →
      </a>
    </div>
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
