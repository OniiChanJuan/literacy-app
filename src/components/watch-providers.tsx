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
}

export default function WatchProviders({ title, year, mediaType, tmdbId }: WatchProvidersProps) {
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <section style={{ marginBottom: 32 }}>
        <SectionHeading />
        <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "8px 0" }}>
          Loading availability...
        </div>
      </section>
    );
  }

  if (providers.length === 0) {
    return (
      <section style={{ marginBottom: 32 }}>
        <SectionHeading />
        <div style={{
          fontSize: 12,
          color: "var(--text-faint)",
          padding: "16px",
          background: "var(--surface-1)",
          borderRadius: 12,
          border: "1px solid var(--border)",
          textAlign: "center",
        }}>
          No streaming info available for your region
        </div>
      </section>
    );
  }

  const streaming = providers.filter((p) => p.type === "stream");
  const rentBuy = providers.filter((p) => p.type === "rent" || p.type === "buy");

  return (
    <section style={{ marginBottom: 32 }}>
      <SectionHeading />

      {streaming.length > 0 && (
        <div style={{ marginBottom: rentBuy.length > 0 ? 16 : 0 }}>
          <div style={{
            fontSize: 10,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Streaming
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {streaming.map((p) => (
              <ProviderPill key={p.name} provider={p} />
            ))}
          </div>
        </div>
      )}

      {rentBuy.length > 0 && (
        <div>
          <div style={{
            fontSize: 10,
            color: "var(--text-faint)",
            textTransform: "uppercase",
            letterSpacing: 1,
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Rent / Buy
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {rentBuy.map((p) => (
              <ProviderPill key={p.name} provider={p} />
            ))}
          </div>
        </div>
      )}

      {link && (
        <div style={{ marginTop: 12, fontSize: 10, color: "var(--text-faint)" }}>
          Powered by{" "}
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3185FC", textDecoration: "none" }}
          >
            JustWatch
          </a>
        </div>
      )}
    </section>
  );
}

function ProviderPill({ provider }: { provider: ProviderData }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px 8px 8px",
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        transition: "transform 0.15s, box-shadow 0.15s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <Image
        src={provider.logo}
        alt={provider.name}
        width={32}
        height={32}
        quality={75}
        style={{
          borderRadius: 8,
          objectFit: "cover",
        }}
      />
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: "#fff",
      }}>
        {provider.name}
      </span>
    </div>
  );
}

function SectionHeading() {
  return (
    <h2 style={{
      fontFamily: "var(--font-serif)",
      fontSize: 16,
      fontWeight: 700,
      color: "var(--text-muted)",
      textTransform: "uppercase",
      letterSpacing: "1px",
      marginBottom: 12,
    }}>
      Where to Watch
    </h2>
  );
}
