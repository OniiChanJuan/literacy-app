import Link from "next/link";

export default function SitemapPage() {
  const heading: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 };
  const h2Style: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 36, marginBottom: 12 };
  const p: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, marginBottom: 16 };
  const ul: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 };
  const updated: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 24 };

  const linkStyle: React.CSSProperties = { color: "#E84855", textDecoration: "none" };

  return (
    <div className="content-width" style={{ maxWidth: 700, marginTop: 40 }}>
      <h1 style={heading}>Sitemap</h1>
      <p style={updated}>Last updated: March 24, 2026</p>

      <p style={p}>
        A complete list of all pages on Literacy.
      </p>

      <h2 style={h2Style}>Main Pages</h2>
      <ul style={ul}>
        <li><Link href="/" style={linkStyle}>Home</Link> — Your personalized For You page</li>
        <li><Link href="/explore" style={linkStyle}>Explore</Link> — Browse and search all media</li>
        <li><Link href="/library" style={linkStyle}>Library</Link> — Your tracked media and progress</li>
        <li><Link href="/people" style={linkStyle}>People</Link> — Find and follow other users</li>
        <li><Link href="/settings" style={linkStyle}>Settings</Link> — Account and profile settings</li>
      </ul>

      <h2 style={h2Style}>Legal &amp; Compliance</h2>
      <ul style={ul}>
        <li><Link href="/privacy" style={linkStyle}>Privacy Policy</Link> — How we handle your data</li>
        <li><Link href="/terms" style={linkStyle}>Terms of Service</Link> — Rules for using Literacy</li>
        <li><Link href="/guidelines" style={linkStyle}>Content Guidelines</Link> — Community standards for reviews and interactions</li>
        <li><Link href="/cookies" style={linkStyle}>Cookie Policy</Link> — How we use cookies</li>
        <li><Link href="/dmca" style={linkStyle}>DMCA / Copyright</Link> — Copyright policy and takedown process</li>
        <li><Link href="/accessibility" style={linkStyle}>Accessibility</Link> — Our accessibility commitment and standards</li>
        <li><Link href="/do-not-sell" style={linkStyle}>Do Not Sell My Personal Information</Link> — CCPA opt-out information</li>
      </ul>
    </div>
  );
}
