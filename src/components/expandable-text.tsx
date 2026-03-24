"use client";

import { useState, useRef, useEffect } from "react";

const CHAR_LIMIT = 1000;

interface ExpandableTextProps {
  text: string;
  /** Compact mode for hero banner — smaller font, line clamp, custom toggle color */
  compact?: boolean;
  /** Color for the toggle button (defaults to var(--accent)) */
  toggleColor?: string;
}

export function ExpandableText({ text, compact, toggleColor }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  // For compact mode, detect if text is actually clamped
  useEffect(() => {
    if (compact && ref.current) {
      setClamped(ref.current.scrollHeight > ref.current.clientHeight + 2);
    }
  }, [text, compact]);

  if (!text) return null;

  // Compact mode — line-clamp based
  if (compact) {
    return (
      <div>
        <p
          ref={ref}
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
            lineHeight: 1.5,
            margin: 0,
            ...(!expanded ? {
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            } : {}),
          }}
        >
          {text}
        </p>
        {(clamped || expanded) && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: "none",
              border: "none",
              color: toggleColor ? `${toggleColor}99` : "var(--accent)",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 0",
              marginTop: 2,
            }}
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>
    );
  }

  // Standard mode — character limit based
  if (text.length <= CHAR_LIMIT) {
    return (
      <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.75 }}>
        {text}
      </p>
    );
  }

  let truncated = text.substring(0, CHAR_LIMIT);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastExcl = truncated.lastIndexOf("!");
  const lastQ = truncated.lastIndexOf("?");
  const lastEnd = Math.max(lastPeriod, lastExcl, lastQ);
  if (lastEnd > CHAR_LIMIT * 0.5) {
    truncated = truncated.substring(0, lastEnd + 1);
  }

  return (
    <div>
      <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.75 }}>
        {expanded ? text : truncated}
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "none",
          border: "none",
          color: toggleColor || "var(--accent)",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          padding: "4px 0",
          marginTop: 4,
        }}
      >
        {expanded ? "Show less" : "Read more"}
      </button>
    </div>
  );
}
