"use client";

import { useState, useRef, useEffect } from "react";

interface TagResult {
  slug: string;
  displayName: string;
  category: string;
}

export default function TagSuggest({ itemId, itemType }: { itemId: number | string; itemType: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TagResult[]>([]);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`/api/tags?search=${encodeURIComponent(search)}&type=${itemType}`)
        .then(r => r.json())
        .then(d => setResults(d.tags || []))
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(t);
  }, [search, open, itemType]);

  const suggest = async (slug: string) => {
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: Number(itemId), tagSlug: slug }),
      });
      if (res.ok) {
        setSubmitted(slug);
        setTimeout(() => { setOpen(false); setSubmitted(null); setSearch(""); }, 1500);
      }
    } catch {}
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.2)",
          fontSize: 10,
          cursor: "pointer",
          padding: "2px 0",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        Suggest a tag
      </button>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <input
        autoFocus
        type="text"
        placeholder="Search tags..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: 180,
          padding: "5px 8px",
          fontSize: 11,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          color: "#fff",
          outline: "none",
        }}
      />
      {results.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          width: 220,
          maxHeight: 200,
          overflowY: "auto",
          background: "#1a1a20",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          marginTop: 4,
          zIndex: 100,
        }}>
          {results.map(t => (
            <button
              key={t.slug}
              onClick={() => suggest(t.slug)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                background: submitted === t.slug ? "rgba(46,196,182,0.15)" : "transparent",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                color: submitted === t.slug ? "#2EC4B6" : "rgba(255,255,255,0.6)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {submitted === t.slug ? "Suggested!" : t.displayName}
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginLeft: 6 }}>
                {t.category}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
