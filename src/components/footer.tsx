"use client";

import Link from "next/link";

const browseLinks = [
  { label: "For You", href: "/" },
  { label: "Explore", href: "/explore" },
  { label: "Library", href: "/library" },
  { label: "People", href: "/people" },
  { label: "Coming Soon", href: "/" },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Cookie Policy", href: "/cookies" },
  { label: "Content Guidelines", href: "/guidelines" },
  { label: "DMCA", href: "/dmca" },
  { label: "Accessibility", href: "/accessibility" },
];

const linkStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.3)",
  textDecoration: "none",
  display: "block",
  marginBottom: 8,
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.35)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 12,
};

export default function Footer() {
  return (
    <footer
      style={{
        background: "#08080c",
        borderTop: "0.5px solid rgba(255,255,255,0.04)",
        padding: "32px 28px 24px",
      }}
    >
      <style>{`
        .footer-link:hover { color: rgba(255,255,255,0.6) !important; }
        .footer-bottom-link:hover { color: rgba(255,255,255,0.3) !important; }
      `}</style>
      <div
        className="content-width"
      >
        {/* Columns */}
        <div
          style={{
            display: "flex",
            gap: 40,
            flexWrap: "wrap",
          }}
        >
          {/* Brand */}
          <div style={{ minWidth: 200 }}>
            <div
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 16,
                fontWeight: 500,
                color: "#fff",
              }}
            >
              CrossShelf
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.25)",
                marginTop: 4,
              }}
            >
              Fluent in every medium
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.2)",
                maxWidth: 250,
                lineHeight: 1.6,
                marginTop: 8,
              }}
            >
              Rate, review, and discover across movies, TV, books, manga,
              comics, games, music, and podcasts.
            </div>
          </div>

          {/* Browse */}
          <div style={{ minWidth: 200 }}>
            <div style={sectionHeaderStyle}>Browse</div>
            {browseLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="footer-link"
                style={linkStyle}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Legal */}
          <div style={{ minWidth: 200 }}>
            <div style={sectionHeaderStyle}>Legal</div>
            {legalLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="footer-link"
                style={linkStyle}
              >
                {link.label}
              </Link>
            ))}
            <a
              href="mailto:privacy@crossshelf.app"
              className="footer-link"
              style={linkStyle}
              rel="noopener noreferrer"
              target="_blank"
            >
              Contact
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            borderTop: "0.5px solid rgba(255,255,255,0.04)",
            marginTop: 24,
            paddingTop: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>
            &copy; 2025 CrossShelf. All rights reserved.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: "rgba(255,255,255,0.15)",
            }}
          >
            <Link
              href="/do-not-sell"
              className="footer-bottom-link"
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.15)",
                textDecoration: "none",
              }}
            >
              Do Not Sell My Personal Information
            </Link>
            <span>&middot;</span>
            <Link
              href="/sitemap-page"
              className="footer-bottom-link"
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.15)",
                textDecoration: "none",
              }}
            >
              Sitemap
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
