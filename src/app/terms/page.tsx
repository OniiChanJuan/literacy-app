export default function TermsPage() {
  const heading: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 };
  const h2Style: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 36, marginBottom: 12 };
  const h3Style: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 24, marginBottom: 8 };
  const p: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, marginBottom: 16 };
  const ul: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 };
  const updated: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 24 };

  return (
    <div className="content-width" style={{ maxWidth: 800, marginTop: 40 }}>
      <h1 style={heading}>Terms of Service</h1>
      <p style={updated}>Last updated: March 24, 2026</p>

      <h2 style={h2Style}>1. Acceptance of Terms</h2>
      <p style={p}>
        By accessing or using Literacy (&quot;the Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the Service.
      </p>
      <p style={p}>
        You must be at least 13 years old to use Literacy. In the European Union, users under the age of 16 must have verifiable parental or guardian consent to create an account. By creating an account, you represent that you meet these age requirements.
      </p>

      <h2 style={h2Style}>2. Account Responsibility</h2>
      <p style={p}>
        You are responsible for maintaining the confidentiality of your account credentials. You agree to:
      </p>
      <ul style={ul}>
        <li>Provide accurate and complete information when creating your account</li>
        <li>Keep your password secure and not share it with others</li>
        <li>Notify us immediately if you believe your account has been compromised</li>
        <li>Accept responsibility for all activity that occurs under your account</li>
      </ul>
      <p style={p}>
        You may not create multiple accounts for the purpose of manipulating ratings, reviews, or any other platform feature. We reserve the right to suspend or terminate accounts that violate this provision.
      </p>

      <h2 style={h2Style}>3. User Content</h2>
      <p style={p}>
        <strong>Ownership:</strong> You retain ownership of all content you create on Literacy, including your reviews, ratings, and profile information. We do not claim ownership of your content.
      </p>
      <p style={p}>
        <strong>License grant:</strong> By posting content on Literacy, you grant us a worldwide, non-exclusive, royalty-free, sublicensable license to use, display, reproduce, and distribute your content solely in connection with operating and providing the Service. This license exists only for as long as your content remains on the platform.
      </p>
      <p style={p}>
        <strong>Deletion:</strong> You may delete your content at any time. When you delete a review or rating, it is removed from public display. When you delete your account, all of your content is permanently deleted within 30 days, as described in our <a href="/privacy" style={{ color: "#E84855" }}>Privacy Policy</a>.
      </p>
      <p style={p}>
        <strong>Responsibility:</strong> You are solely responsible for the content you post. Your reviews and ratings should represent your genuine opinions about the media being reviewed.
      </p>

      <h2 style={h2Style}>4. Prohibited Conduct</h2>
      <p style={p}>You agree not to engage in any of the following prohibited activities:</p>
      <ul style={ul}>
        <li><strong>Spam:</strong> Posting repetitive, unsolicited, or irrelevant content; using automated tools to post reviews or ratings</li>
        <li><strong>Harassment:</strong> Targeting, bullying, intimidating, or repeatedly contacting another user in a hostile manner</li>
        <li><strong>Hate speech:</strong> Content that promotes violence or hatred against individuals or groups based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics</li>
        <li><strong>Threats:</strong> Threatening violence or harm against any person or group</li>
        <li><strong>Impersonation:</strong> Falsely representing yourself as another person, public figure, or entity</li>
        <li><strong>Review manipulation:</strong> Creating fake reviews, using multiple accounts to inflate or deflate ratings, offering or accepting payment for reviews, or coordinating rating campaigns</li>
        <li><strong>Fake accounts:</strong> Creating accounts with false information, operating bot accounts, or maintaining multiple accounts for deceptive purposes</li>
        <li><strong>Copyright infringement:</strong> Posting content that infringes on the intellectual property rights of others, including reproducing substantial portions of copyrighted works in reviews</li>
        <li><strong>Illegal activity:</strong> Using the Service for any purpose that violates applicable local, state, national, or international law</li>
        <li><strong>Circumventing security:</strong> Attempting to bypass security measures, access other users&apos; accounts, or interfere with the Service&apos;s infrastructure</li>
      </ul>

      <h2 style={h2Style}>5. Content Moderation</h2>
      <p style={p}>
        We reserve the right to review, remove, or disable access to any content that violates these Terms or our <a href="/guidelines" style={{ color: "#E84855" }}>Content Guidelines</a>. We may also suspend or terminate accounts that repeatedly or egregiously violate our policies.
      </p>
      <p style={p}>
        When we take action against your content or account, we will notify you of the action taken and the reason for it, unless doing so would compromise the safety of others or the integrity of an investigation. You may appeal moderation decisions by contacting us.
      </p>
      <p style={p}>
        We are not obligated to monitor all content posted on the Service, but we reserve the right to do so. We encourage users to report content that violates these Terms using the report feature.
      </p>

      <h2 style={h2Style}>6. External Content Disclaimer</h2>
      <p style={p}>
        Literacy displays media metadata (titles, descriptions, cover art, release dates, cast and crew information) sourced from third-party APIs including TMDB, IGDB, Google Books, Spotify, Jikan, and Comic Vine. This content is provided by those services and is subject to their respective terms of use.
      </p>
      <p style={p}>
        We also display external review scores from sources such as IMDb, Rotten Tomatoes, Metacritic, and others. These scores are the property of their respective owners and are displayed for informational purposes only.
      </p>
      <p style={p}>
        We do not guarantee the accuracy, completeness, or timeliness of any third-party content. Links to external platforms (such as streaming services, stores, or databases) are provided for convenience and do not imply endorsement.
      </p>

      <h2 style={h2Style}>7. Intellectual Property</h2>
      <p style={p}>
        The Literacy brand, logo, design, and original software are the property of Literacy and are protected by applicable intellectual property laws. You may not use our branding without prior written permission.
      </p>
      <p style={p}>
        Media metadata, cover art, and related content displayed on the platform belong to their respective owners (studios, publishers, developers, artists, and the API providers that aggregate this data). Literacy uses this content under the terms of the respective API agreements.
      </p>
      <p style={p}>
        User-generated content (reviews, ratings) is owned by the users who created it, subject to the license grant described in Section 3.
      </p>

      <h2 style={h2Style}>8. Limitation of Liability</h2>
      <p style={p}>
        The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
      </p>
      <p style={p}>
        To the maximum extent permitted by applicable law, Literacy shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenue, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from:
      </p>
      <ul style={ul}>
        <li>Your use of or inability to use the Service</li>
        <li>Any unauthorized access to or use of our servers or any personal information stored therein</li>
        <li>Any interruption or cessation of the Service</li>
        <li>Any content posted by other users</li>
        <li>Any errors, inaccuracies, or omissions in third-party content displayed on the platform</li>
      </ul>

      <h2 style={h2Style}>9. Governing Law</h2>
      <p style={p}>
        These Terms shall be governed by and construed in accordance with the laws of the State of Texas, United States, without regard to its conflict of law provisions. This choice of law does not affect your rights as a consumer under the mandatory consumer protection laws of your country of residence.
      </p>

      <h2 style={h2Style}>10. Dispute Resolution</h2>
      <p style={p}>
        <strong>Good faith negotiation:</strong> Before initiating any formal dispute resolution process, you agree to first contact us and attempt to resolve the dispute informally for at least 30 days.
      </p>
      <p style={p}>
        <strong>Binding arbitration:</strong> If we cannot resolve a dispute through good faith negotiation, any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be settled by binding arbitration administered in accordance with the rules of the American Arbitration Association. The arbitration shall take place in Texas, and the language of the arbitration shall be English.
      </p>
      <p style={p}>
        <strong>Exceptions:</strong> Either party may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement of intellectual property rights. Nothing in this section prevents you from filing a complaint with your local consumer protection agency.
      </p>
      <p style={p}>
        <strong>Class action waiver:</strong> You agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action.
      </p>

      <h2 style={h2Style}>11. Changes to These Terms</h2>
      <p style={p}>
        We may update these Terms from time to time. When we make material changes, we will provide at least 30 days&apos; notice before the changes take effect. Notice will be provided by email (to the address associated with your account) and by posting a prominent notice on the Service.
      </p>
      <p style={p}>
        Your continued use of the Service after the updated Terms take effect constitutes your acceptance of the changes. If you do not agree with the updated Terms, you may delete your account before the changes take effect.
      </p>
      <p style={p}>
        We will maintain an archive of previous versions of these Terms, available upon request.
      </p>

      <h2 style={h2Style}>12. Contact</h2>
      <p style={p}>
        If you have questions about these Terms of Service, please contact us at <a href="mailto:privacy@literacy.app" style={{ color: "#E84855" }}>privacy@literacy.app</a>.
      </p>
    </div>
  );
}
