export default function CookiesPage() {
  const heading: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 };
  const h2Style: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 36, marginBottom: 12 };
  const h3Style: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 24, marginBottom: 8 };
  const p: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, marginBottom: 16 };
  const ul: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 };
  const updated: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 24 };

  return (
    <div className="content-width" style={{ maxWidth: 800, marginTop: 40 }}>
      <h1 style={heading}>Cookie Policy</h1>
      <p style={updated}>Last updated: March 24, 2026</p>

      <p style={p}>
        This Cookie Policy explains how CrossShelf (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) uses cookies on our platform at crossshelf.app. We are committed to transparency about the technologies we use.
      </p>

      <h2 style={h2Style}>What Are Cookies</h2>
      <p style={p}>
        Cookies are small text files that are stored on your device (computer, tablet, or phone) when you visit a website. They are widely used to make websites work, keep you logged in, and provide information to the site operator.
      </p>

      <h2 style={h2Style}>Cookies We Use</h2>

      <h3 style={h3Style}>Session / Authentication Cookie</h3>
      <p style={p}>
        We use a single essential cookie to manage your authentication session. When you log in to CrossShelf, a session cookie is set to keep you logged in as you navigate the site. This cookie is:
      </p>
      <ul style={ul}>
        <li><strong>HTTP-only:</strong> It cannot be accessed by client-side JavaScript, which protects against cross-site scripting attacks</li>
        <li><strong>Secure:</strong> It is only transmitted over HTTPS encrypted connections</li>
        <li><strong>Session-scoped:</strong> It expires when you close your browser or after your session times out</li>
      </ul>
      <p style={p}>
        This cookie is strictly necessary for the Service to function. Without it, you would need to log in again on every page.
      </p>

      <h2 style={h2Style}>Cookies We Do NOT Use</h2>
      <p style={p}>
        CrossShelf does not use any of the following types of cookies:
      </p>
      <ul style={ul}>
        <li><strong>Advertising cookies:</strong> We do not serve ads and do not use cookies for ad targeting or retargeting</li>
        <li><strong>Third-party tracking cookies:</strong> We do not allow third parties to place tracking cookies on our site</li>
        <li><strong>Analytics cookies:</strong> We do not use Google Analytics, Mixpanel, Hotjar, or any other cookie-based analytics service. We use Vercel Analytics for basic, anonymous page view tracking — this does not use cookies and does not collect personal information</li>
        <li><strong>Social media tracking cookies:</strong> We do not embed social media widgets that place tracking cookies (such as Facebook Pixel, Twitter tracking, etc.)</li>
        <li><strong>Preference cookies:</strong> We store user preferences (such as theme settings) server-side in your account, not in cookies</li>
      </ul>

      <h2 style={h2Style}>Analytics</h2>
      <p style={p}>
        We use Vercel Analytics for basic, anonymous page view tracking. This does not use cookies and does not collect personal information. Vercel Analytics is privacy-respecting and GDPR-compliant by design — it tracks aggregate page views and web performance metrics without identifying individual users.
      </p>

      <h2 style={h2Style}>Legal Basis</h2>
      <p style={p}>
        Our use of cookies is limited to those that are strictly necessary for the operation of the Service. Under GDPR Article 5(3) and the ePrivacy Directive (Directive 2002/58/EC, as amended by Directive 2009/136/EC), strictly necessary cookies do not require user consent.
      </p>
      <p style={p}>
        Because we only use strictly necessary cookies (and our analytics solution is cookie-free), we do not display a cookie consent banner. If we ever introduce non-essential cookies in the future, we will update this policy and implement a consent mechanism before doing so.
      </p>

      <h2 style={h2Style}>How to Manage Cookies</h2>
      <p style={p}>
        You can control and manage cookies through your browser settings. Please note that disabling cookies will prevent you from logging in to CrossShelf, though you will still be able to browse publicly available content.
      </p>
      <p style={p}>
        Instructions for managing cookies in common browsers:
      </p>

      <h3 style={h3Style}>Google Chrome</h3>
      <p style={p}>
        Settings &rarr; Privacy and Security &rarr; Cookies and other site data. You can block all cookies, block third-party cookies, or manage exceptions for specific sites.
      </p>

      <h3 style={h3Style}>Mozilla Firefox</h3>
      <p style={p}>
        Settings &rarr; Privacy &amp; Security &rarr; Cookies and Site Data. Firefox offers Enhanced Tracking Protection which blocks third-party cookies by default. You can also manage per-site cookie permissions.
      </p>

      <h3 style={h3Style}>Safari</h3>
      <p style={p}>
        Preferences &rarr; Privacy &rarr; Manage Website Data. Safari blocks third-party cookies by default through Intelligent Tracking Prevention. You can also block all cookies or manage data for specific websites.
      </p>

      <h3 style={h3Style}>Microsoft Edge</h3>
      <p style={p}>
        Settings &rarr; Cookies and site permissions &rarr; Manage and delete cookies and site data. You can block all cookies, block third-party cookies, or manage exceptions.
      </p>

      <h2 style={h2Style}>Changes to This Policy</h2>
      <p style={p}>
        If we change our cookie practices (for example, if we introduce analytics or other non-essential cookies), we will update this Cookie Policy and notify users before any new cookies are set.
      </p>

      <h2 style={h2Style}>Contact</h2>
      <p style={p}>
        If you have questions about our use of cookies, please contact us at <a href="mailto:privacy@crossshelf.app" style={{ color: "#E84855" }}>privacy@crossshelf.app</a>.
      </p>
    </div>
  );
}
