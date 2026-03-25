export default function DMCAPage() {
  const heading: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 };
  const h2Style: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 36, marginBottom: 12 };
  const h3Style: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 24, marginBottom: 8 };
  const p: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, marginBottom: 16 };
  const ul: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 };
  const updated: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 24 };

  return (
    <div className="content-width" style={{ maxWidth: 700, marginTop: 40 }}>
      <h1 style={heading}>DMCA &amp; Copyright Policy</h1>
      <p style={updated}>Last updated: March 24, 2026</p>

      <h2 style={h2Style}>Respect for Intellectual Property</h2>
      <p style={p}>
        Literacy respects the intellectual property rights of others and expects our users to do the same. We comply with the Digital Millennium Copyright Act (DMCA) and respond promptly to valid notices of alleged copyright infringement.
      </p>

      <h2 style={h2Style}>Media Metadata and Third-Party Content</h2>
      <p style={p}>
        Literacy is a review and recommendation platform. We display media metadata — including titles, descriptions, cover art, release dates, and credits — sourced from third-party APIs under their respective terms of service:
      </p>
      <ul style={ul}>
        <li><strong>TMDB (The Movie Database):</strong> Movie and TV show metadata, used under the TMDB API Terms of Use</li>
        <li><strong>IGDB (Internet Game Database):</strong> Video game metadata, used under the IGDB API Terms</li>
        <li><strong>Google Books API:</strong> Book metadata, used under Google API Terms of Service</li>
        <li><strong>Spotify API:</strong> Music and podcast metadata, used under Spotify Developer Terms of Service</li>
        <li><strong>Jikan (MyAnimeList API):</strong> Manga metadata, used under the Jikan API terms</li>
        <li><strong>Comic Vine API:</strong> Comic book metadata, used under the Comic Vine API terms</li>
      </ul>
      <p style={p}>
        If you believe that any metadata displayed on Literacy infringes your copyright, please note that this content is sourced from the above providers. We recommend contacting the source API provider directly. However, you may also file a DMCA notice with us, and we will address the issue.
      </p>

      <h2 style={h2Style}>User-Generated Content</h2>
      <p style={p}>
        User reviews and ratings are the responsibility of the individual users who post them. Reviews should be original content reflecting the user&apos;s genuine opinions. Users must not reproduce substantial portions of copyrighted works (such as full chapters, articles, or scripts) in their reviews.
      </p>

      <h2 style={h2Style}>Filing a DMCA Takedown Notice</h2>
      <p style={p}>
        If you believe that content on Literacy infringes your copyright, you may submit a DMCA takedown notice. Your notice must include all of the following:
      </p>
      <ul style={ul}>
        <li>Your full legal name and contact information (mailing address, phone number, and email address)</li>
        <li>Identification of the copyrighted work you claim has been infringed, or if multiple works are covered by a single notification, a representative list</li>
        <li>The specific URL(s) on Literacy where the allegedly infringing material is located, described with enough detail for us to find it</li>
        <li>A statement that you have a good faith belief that the use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law</li>
        <li>A statement, made under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on the copyright owner&apos;s behalf</li>
        <li>Your physical or electronic signature</li>
      </ul>
      <p style={p}>
        Send your DMCA takedown notice to:
      </p>
      <p style={p}>
        Email: <a href="mailto:dmca@literacy.app" style={{ color: "#E84855" }}>dmca@literacy.app</a>
      </p>

      <h2 style={h2Style}>Response Timeline</h2>
      <p style={p}>
        We will acknowledge receipt of your DMCA notice within 2 business days and will process valid notices within 10 business days. If the notice is complete and valid, we will:
      </p>
      <ul style={ul}>
        <li>Remove or disable access to the allegedly infringing content</li>
        <li>Notify the user who posted the content (if applicable) that their content has been removed due to a DMCA notice</li>
        <li>Provide the user with information about filing a counter-notification if they believe the removal was in error</li>
      </ul>

      <h2 style={h2Style}>Counter-Notification</h2>
      <p style={p}>
        If you believe your content was removed by mistake or misidentification, you may file a counter-notification. Your counter-notification must include:
      </p>
      <ul style={ul}>
        <li>Your full legal name and contact information (mailing address, phone number, and email address)</li>
        <li>Identification of the material that was removed and the URL where it appeared before removal</li>
        <li>A statement under penalty of perjury that you have a good faith belief that the material was removed or disabled as a result of mistake or misidentification</li>
        <li>A statement that you consent to the jurisdiction of the federal court in your judicial district (or, if outside the United States, any judicial district in which Literacy may be found), and that you will accept service of process from the person who filed the original DMCA notice or their agent</li>
        <li>Your physical or electronic signature</li>
      </ul>
      <p style={p}>
        Send counter-notifications to: <a href="mailto:dmca@literacy.app" style={{ color: "#E84855" }}>dmca@literacy.app</a>
      </p>
      <p style={p}>
        Upon receiving a valid counter-notification, we will forward it to the original complainant. If the original complainant does not file a court action within 10 business days, we will restore the removed content.
      </p>

      <h2 style={h2Style}>Repeat Infringers</h2>
      <p style={p}>
        In accordance with the DMCA, we will terminate the accounts of users who are determined to be repeat infringers in appropriate circumstances. We define a repeat infringer as a user who has received two or more valid DMCA takedown notices.
      </p>

      <h2 style={h2Style}>Good Faith</h2>
      <p style={p}>
        Please be aware that under 17 U.S.C. &sect; 512(f), any person who knowingly materially misrepresents that material is infringing, or that material was removed or disabled by mistake, may be subject to liability for damages, including costs and attorneys&apos; fees. Do not file a DMCA notice or counter-notification unless you genuinely believe your rights have been infringed or that a removal was made in error.
      </p>
    </div>
  );
}
