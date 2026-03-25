export default function PrivacyPage() {
  const heading: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 };
  const h2Style: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 36, marginBottom: 12 };
  const h3Style: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 24, marginBottom: 8 };
  const p: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, marginBottom: 16 };
  const ul: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 };
  const updated: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 24 };

  return (
    <div className="content-width" style={{ maxWidth: 800, marginTop: 40 }}>
      <h1 style={heading}>Privacy Policy</h1>
      <p style={updated}>Last updated: March 24, 2026</p>

      <h2 style={h2Style}>1. Introduction</h2>
      <p style={p}>
        Literacy (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the Literacy platform at literacy.app (the &quot;Service&quot;), a cross-media review and recommendation platform. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our Service.
      </p>
      <p style={p}>
        We are committed to protecting your privacy and complying with applicable data protection laws, including the EU General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA), the Brazilian General Data Protection Law (LGPD), and the Children&apos;s Online Privacy Protection Act (COPPA).
      </p>
      <p style={p}>
        By using our Service, you acknowledge that you have read and understood this Privacy Policy. If you do not agree with our practices, please do not use the Service.
      </p>

      <h2 style={h2Style}>2. Information We Collect</h2>

      <h3 style={h3Style}>2.1 Account Information</h3>
      <p style={p}>
        When you create an account, we collect the following information:
      </p>
      <ul style={ul}>
        <li>Email address</li>
        <li>Display name / username</li>
        <li>Password (stored only as a bcrypt hash; we never store or have access to your plain-text password)</li>
        <li>Profile information you choose to provide (bio, avatar image)</li>
        <li>Privacy preferences (public or private profile setting)</li>
      </ul>

      <h3 style={h3Style}>2.2 User Content</h3>
      <p style={p}>
        When you use the Service, we store the content you create:
      </p>
      <ul style={ul}>
        <li>Ratings (star scores and recommend/mixed/skip tags)</li>
        <li>Written reviews</li>
        <li>Library entries (status tracking: Completed, In Progress, Want To, Dropped)</li>
        <li>Progress data for In Progress items (episodes watched, chapters read, etc.)</li>
        <li>Follow relationships (which users you follow)</li>
        <li>Helpful votes on reviews</li>
      </ul>

      <h3 style={h3Style}>2.3 Authentication Data</h3>
      <p style={p}>
        If you sign in via Google or Apple OAuth, we receive limited profile information from those providers (name, email address, and profile picture). We do not receive or store your Google or Apple password. We store only the minimum information needed to authenticate your account.
      </p>

      <h3 style={h3Style}>2.4 Usage Data Collected Automatically</h3>
      <p style={p}>
        We automatically collect limited usage data through our servers:
      </p>
      <ul style={ul}>
        <li><strong>Page views:</strong> We record which pages you visit on Literacy through our implicit signals system. This data is used to understand general platform usage patterns and may inform future recommendation features.</li>
        <li><strong>Standard server request logs:</strong> Our servers automatically log your IP address, browser type (user agent string), and timestamp for each request. These logs are used for security monitoring, debugging, and abuse prevention.</li>
      </ul>
      <p style={p}>
        We do not currently track search queries, filter selections, time spent on individual pages, mouse movements, click patterns, or other detailed behavioral analytics.
      </p>

      <h3 style={h3Style}>2.5 Device Data</h3>
      <p style={p}>
        Through standard server request logs, we may receive general device information included in HTTP headers, such as browser type, operating system, and device category (desktop or mobile). We do not use fingerprinting techniques or collect detailed hardware information.
      </p>

      <h3 style={h3Style}>2.6 Cookies</h3>
      <p style={p}>
        We use only essential session cookies required for authentication. These cookies allow you to stay logged in during your session. We do not use advertising cookies, analytics cookies, third-party tracking cookies, or social media tracking cookies. For more details, see our <a href="/cookies" style={{ color: "#E84855" }}>Cookie Policy</a>.
      </p>

      <h2 style={h2Style}>3. How We Use Your Information</h2>
      <p style={p}>We use the information we collect for the following purposes:</p>
      <ul style={ul}>
        <li><strong>Providing the Service:</strong> Displaying your ratings, reviews, and library data; enabling your profile; showing your activity to followers (if your profile is public).</li>
        <li><strong>Recommendations:</strong> Generating personalized recommendations based on your ratings, reviews, and library data, including cross-media suggestions.</li>
        <li><strong>Aggregated Statistics:</strong> Computing community scores, rating distributions, and recommend percentages from anonymized, aggregated user data.</li>
        <li><strong>Security and Abuse Prevention:</strong> Monitoring server logs for unauthorized access, spam, and abuse.</li>
        <li><strong>Service Improvement:</strong> Using aggregated, anonymized page view data to understand how the platform is used and identify areas for improvement.</li>
        <li><strong>Communications:</strong> Sending essential service communications such as password reset emails, account security alerts, and notices of changes to our terms or privacy policy.</li>
      </ul>
      <p style={p}>
        We do not use your personal data for advertising. We do not build advertising profiles. We do not send marketing emails unless you explicitly opt in to receive them.
      </p>

      <h2 style={h2Style}>4. Legal Basis for Processing (GDPR)</h2>
      <p style={p}>
        For users in the European Union and United Kingdom, we process your personal data under the following legal bases:
      </p>
      <ul style={ul}>
        <li><strong>Contract Performance (Article 6(1)(b)):</strong> Processing necessary to provide the Service you signed up for, including storing your account data, ratings, reviews, and library entries.</li>
        <li><strong>Legitimate Interests (Article 6(1)(f)):</strong> Processing for security monitoring, abuse prevention, and aggregated analytics to improve the Service. We balance these interests against your rights and freedoms.</li>
        <li><strong>Consent (Article 6(1)(a)):</strong> Where we rely on your consent (such as optional marketing communications), you may withdraw consent at any time.</li>
        <li><strong>Legal Obligation (Article 6(1)(c)):</strong> Processing necessary to comply with legal requirements, such as responding to lawful data access requests.</li>
      </ul>

      <h2 style={h2Style}>5. Data Sharing</h2>
      <p style={p}>
        <strong>We do not sell your personal data.</strong> We have never sold personal data and have no plans to do so.
      </p>
      <p style={p}>
        We share data only with the following categories of service providers, solely to operate the Service:
      </p>
      <ul style={ul}>
        <li><strong>Vercel:</strong> Hosts our frontend application. Vercel processes HTTP requests which include your IP address and browser information as part of standard web hosting.</li>
        <li><strong>Supabase:</strong> Hosts our PostgreSQL database and provides authentication services. Stores your account data, ratings, reviews, and library entries.</li>
        <li><strong>Google (OAuth):</strong> If you choose to sign in with Google, Google processes your authentication. We receive only your name, email, and profile picture.</li>
      </ul>
      <p style={p}>
        We use the following third-party APIs to source media metadata (titles, descriptions, cover art, release dates). We send only search queries and media identifiers to these services — we do not send any of your personal data:
      </p>
      <ul style={ul}>
        <li>TMDB (The Movie Database) — movie and TV show metadata</li>
        <li>IGDB (Internet Game Database) — video game metadata</li>
        <li>Spotify API — music and podcast metadata</li>
        <li>Jikan (MyAnimeList API) — manga and anime metadata</li>
        <li>Google Books API — book metadata</li>
        <li>Comic Vine API — comic book metadata</li>
      </ul>
      <p style={p}>
        We may also disclose your information if required by law, court order, or governmental regulation, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.
      </p>

      <h2 style={h2Style}>6. International Data Transfers</h2>
      <p style={p}>
        Our servers are located in the United States. If you access the Service from outside the United States, your data will be transferred to and processed in the United States.
      </p>
      <p style={p}>
        For users in the EU/UK, we rely on Standard Contractual Clauses (SCCs) approved by the European Commission as the legal mechanism for transferring personal data outside the European Economic Area. Our service providers (Vercel and Supabase) maintain appropriate data transfer safeguards.
      </p>

      <h2 style={h2Style}>7. Data Retention</h2>
      <ul style={ul}>
        <li><strong>Active accounts:</strong> We retain your account data, ratings, reviews, and library entries for as long as your account is active.</li>
        <li><strong>Account deletion:</strong> When you delete your account, all your personal data, ratings, reviews, library entries, and follow relationships are permanently deleted within 30 days. Some anonymized, aggregated data (such as contribution to community averages) may be retained.</li>
        <li><strong>Server logs:</strong> Standard server request logs (IP addresses, timestamps, browser information) are automatically deleted after 90 days.</li>
        <li><strong>Page view data:</strong> Implicit signal data (page views) associated with your account is deleted when you delete your account.</li>
      </ul>

      <h2 style={h2Style}>8. Your Rights</h2>

      <h3 style={h3Style}>8.1 All Users</h3>
      <p style={p}>Regardless of your location, you have the right to:</p>
      <ul style={ul}>
        <li>Access your personal data through your profile and settings pages</li>
        <li>Edit or correct your personal information at any time</li>
        <li>Delete your account and all associated data</li>
        <li>Export your data (ratings, reviews, library entries)</li>
        <li>Control your profile visibility (public or private)</li>
      </ul>

      <h3 style={h3Style}>8.2 EU/UK Residents (GDPR)</h3>
      <p style={p}>If you are located in the European Union or United Kingdom, you additionally have the right to:</p>
      <ul style={ul}>
        <li><strong>Right of access (Article 15):</strong> Request a copy of all personal data we hold about you.</li>
        <li><strong>Right to rectification (Article 16):</strong> Request correction of inaccurate personal data.</li>
        <li><strong>Right to erasure (Article 17):</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;).</li>
        <li><strong>Right to restrict processing (Article 18):</strong> Request that we limit how we use your data.</li>
        <li><strong>Right to data portability (Article 20):</strong> Receive your data in a structured, commonly used, machine-readable format.</li>
        <li><strong>Right to object (Article 21):</strong> Object to processing based on legitimate interests.</li>
        <li><strong>Right to withdraw consent (Article 7(3)):</strong> Where processing is based on consent, withdraw it at any time.</li>
        <li><strong>Right to lodge a complaint:</strong> File a complaint with your local data protection supervisory authority.</li>
      </ul>
      <p style={p}>
        To exercise these rights, contact us at <a href="mailto:privacy@literacy.app" style={{ color: "#E84855" }}>privacy@literacy.app</a>. We will respond within 30 days.
      </p>

      <h3 style={h3Style}>8.3 California Residents (CCPA/CPRA)</h3>
      <p style={p}>If you are a California resident, the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA) provide you with additional rights:</p>
      <ul style={ul}>
        <li><strong>Right to know:</strong> Request disclosure of the categories and specific pieces of personal information we have collected about you.</li>
        <li><strong>Right to delete:</strong> Request deletion of your personal information.</li>
        <li><strong>Right to correct:</strong> Request correction of inaccurate personal information.</li>
        <li><strong>Right to opt out of sale:</strong> We do not sell personal information. See our <a href="/do-not-sell" style={{ color: "#E84855" }}>Do Not Sell</a> page.</li>
        <li><strong>Right to non-discrimination:</strong> We will not discriminate against you for exercising your CCPA rights.</li>
        <li><strong>Right to limit use of sensitive personal information:</strong> We do not collect sensitive personal information as defined by CPRA beyond what is necessary for the Service.</li>
      </ul>
      <p style={p}><strong>Categories of personal information collected in the last 12 months:</strong></p>
      <ul style={ul}>
        <li><strong>Identifiers:</strong> Email address, display name, IP address, account ID</li>
        <li><strong>Internet activity:</strong> Page views on Literacy, browser type, server request logs</li>
        <li><strong>User-generated content:</strong> Ratings, reviews, library entries, profile information</li>
      </ul>
      <p style={p}>
        <strong>Categories sold:</strong> None. We do not sell personal information.<br />
        <strong>Categories shared for cross-context behavioral advertising:</strong> None.
      </p>

      <h3 style={h3Style}>8.4 Brazilian Residents (LGPD)</h3>
      <p style={p}>If you are located in Brazil, the Lei Geral de Proteção de Dados (LGPD) provides you with the following rights:</p>
      <ul style={ul}>
        <li>Confirmation of the existence of processing of your data</li>
        <li>Access to your personal data</li>
        <li>Correction of incomplete, inaccurate, or outdated data</li>
        <li>Anonymization, blocking, or deletion of unnecessary or excessive data</li>
        <li>Data portability to another service provider</li>
        <li>Deletion of data processed with your consent</li>
        <li>Information about public and private entities with which we share your data</li>
        <li>Information about the possibility of denying consent and the consequences</li>
        <li>Revocation of consent</li>
      </ul>
      <p style={p}>
        To exercise your rights under LGPD, contact us at <a href="mailto:privacy@literacy.app" style={{ color: "#E84855" }}>privacy@literacy.app</a>.
      </p>

      <h2 style={h2Style}>9. Children&apos;s Privacy</h2>
      <p style={p}>
        Literacy is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13, in compliance with the Children&apos;s Online Privacy Protection Act (COPPA).
      </p>
      <p style={p}>
        In the European Union, users under the age of 16 require verifiable parental consent to create an account, in accordance with GDPR Article 8.
      </p>
      <p style={p}>
        If we discover that we have collected personal information from a child under the applicable age threshold without appropriate consent, we will delete that information promptly. If you believe a child has provided us with personal information, please contact us at <a href="mailto:privacy@literacy.app" style={{ color: "#E84855" }}>privacy@literacy.app</a>.
      </p>

      <h2 style={h2Style}>10. Security</h2>
      <p style={p}>
        We take the security of your personal data seriously and implement industry-standard measures to protect it:
      </p>
      <ul style={ul}>
        <li>All data is transmitted over HTTPS (TLS encryption in transit)</li>
        <li>Passwords are hashed using bcrypt with appropriate salt rounds</li>
        <li>Session tokens are stored as HTTP-only cookies that cannot be accessed by client-side JavaScript</li>
        <li>Database access is restricted and authenticated</li>
        <li>Server logs are monitored for unauthorized access attempts</li>
        <li>We follow industry best practices for web application security</li>
      </ul>
      <p style={p}>
        No method of transmission or storage is 100% secure. While we strive to protect your data, we cannot guarantee absolute security. If we become aware of a data breach affecting your personal information, we will notify you and relevant authorities as required by applicable law.
      </p>

      <h2 style={h2Style}>11. Changes to This Policy</h2>
      <p style={p}>
        We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or legal requirements. When we make material changes, we will notify you by email (if you have an account) and by posting a prominent notice on the Service at least 30 days before the changes take effect.
      </p>
      <p style={p}>
        Your continued use of the Service after the updated policy takes effect constitutes your acceptance of the changes. If you do not agree with the updated policy, you may delete your account.
      </p>

      <h2 style={h2Style}>12. Contact Us</h2>
      <p style={p}>
        If you have questions about this Privacy Policy, want to exercise your data rights, or have concerns about how we handle your information, please contact us:
      </p>
      <p style={p}>
        Email: <a href="mailto:privacy@literacy.app" style={{ color: "#E84855" }}>privacy@literacy.app</a>
      </p>
      <p style={p}>
        For GDPR inquiries, you may also contact your local data protection supervisory authority.
      </p>
    </div>
  );
}
