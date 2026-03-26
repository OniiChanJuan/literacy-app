"use client";

import { useState } from "react";

interface ShareButtonProps {
  title: string;
  text?: string;
  size?: number;
}

export default function ShareButton({ title, text, size = 28 }: ShareButtonProps) {
  const [showToast, setShowToast] = useState(false);
  const [hovered, setHovered] = useState(false);

  const iconSize = size * 0.5;

  const handleClick = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          text: text || "Check out " + title + " on Literacy",
          url: window.location.href,
        });
      } catch {
        // user cancelled share
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
      } catch {
        // clipboard failed
      }
    }
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
          border: "0.5px solid rgba(255,255,255,0.1)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 150ms",
          padding: 0,
        }}
        aria-label={`Share ${title}`}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 11l5-5 5 5" />
          <path d="M12 6v10" />
          <rect x="4" y="16" width="16" height="4" rx="1" />
        </svg>
      </button>
      {showToast && (
        <div
          style={{
            position: "absolute",
            bottom: -(size + 8),
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          Link copied!
        </div>
      )}
    </div>
  );
}
