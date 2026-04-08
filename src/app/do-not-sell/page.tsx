export default function DoNotSellPage() {
  const heading: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 };
  const h2Style: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 36, marginBottom: 12 };
  const p: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, marginBottom: 16 };
  const ul: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 };
  const updated: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 24 };

  return (
    <div className="content-width" style={{ maxWidth: 800, marginTop: 40 }}>
      <h1 style={heading}>Do Not Sell My Personal Information</h1>
      <p style={updated}>Last updated: March 24, 2026</p>

      <p style={p}>
        This page is provided in compliance with the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA), which require businesses to provide California residents with the ability to opt out of the sale or sharing of their personal information.
      </p>

      <h2 style={h2Style}>CrossShelf Does Not Sell Your Personal Information</h2>
      <p style={p}>
        CrossShelf does not sell your personal information to third parties. We have never sold personal information. We have no plans to sell personal information.
      </p>
      <p style={p}>
        This means:
      </p>
      <ul style={ul}>
        <li>We do not sell your name, email address, or account information to anyone</li>
        <li>We do not sell your ratings, reviews, or library data to anyone</li>
        <li>We do not sell your usage data or browsing activity to anyone</li>
        <li>We do not share your personal information with third parties for their own marketing purposes</li>
        <li>We do not share your personal information for cross-context behavioral advertising</li>
      </ul>

      <h2 style={h2Style}>No Advertising or Data Brokerage</h2>
      <p style={p}>
        CrossShelf does not display advertisements and does not work with advertising networks, data brokers, or any third parties that would use your personal information for targeted advertising. We do not use advertising cookies, tracking pixels, or similar technologies.
      </p>

      <h2 style={h2Style}>How We Do Use Your Data</h2>
      <p style={p}>
        Your personal information is used solely to provide and improve the CrossShelf service. This includes displaying your reviews, powering recommendations, and enabling social features like following other users. For complete details, see our <a href="/privacy" style={{ color: "#E84855" }}>Privacy Policy</a>.
      </p>

      <h2 style={h2Style}>Your Rights Under CCPA/CPRA</h2>
      <p style={p}>
        As a California resident, you have the right to:
      </p>
      <ul style={ul}>
        <li>Know what personal information we collect, use, and disclose</li>
        <li>Request deletion of your personal information</li>
        <li>Request correction of inaccurate personal information</li>
        <li>Opt out of the sale or sharing of your personal information (not applicable as we do not sell or share)</li>
        <li>Not be discriminated against for exercising your privacy rights</li>
      </ul>

      <h2 style={h2Style}>Contact Us</h2>
      <p style={p}>
        If you have questions about this page, our data practices, or wish to exercise any of your rights under CCPA/CPRA, please contact us:
      </p>
      <p style={p}>
        Email: <a href="mailto:privacy@crossshelf.app" style={{ color: "#E84855" }}>privacy@crossshelf.app</a>
      </p>
      <p style={p}>
        We will respond to verifiable consumer requests within 45 days as required by law.
      </p>
    </div>
  );
}
