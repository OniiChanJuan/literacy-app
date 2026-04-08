export default function GuidelinesPage() {
  const heading: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 };
  const h2Style: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 36, marginBottom: 12 };
  const h3Style: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 24, marginBottom: 8 };
  const p: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, marginBottom: 16 };
  const ul: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 };
  const updated: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 24 };

  return (
    <div className="content-width" style={{ maxWidth: 800, marginTop: 40 }}>
      <h1 style={heading}>Content Guidelines</h1>
      <p style={updated}>Last updated: March 24, 2026</p>

      <p style={p}>
        CrossShelf is a community built around honest reviews and genuine media discussion. These guidelines help ensure the platform remains a respectful, trustworthy space for everyone. All users are expected to follow these guidelines when posting reviews, ratings, and interacting with others.
      </p>

      <h2 style={h2Style}>Write Honest Reviews</h2>
      <p style={p}>
        Your reviews should reflect your genuine opinion of the media you are reviewing. A great review helps others decide whether something is worth their time. You do not need to be a professional critic — personal, authentic perspectives are what make CrossShelf valuable.
      </p>
      <ul style={ul}>
        <li>Rate and review media you have actually experienced (watched, read, played, listened to)</li>
        <li>Be specific about what you liked or disliked and why</li>
        <li>It is perfectly fine to dislike popular media or enjoy something widely criticized — honest opinions are always welcome</li>
        <li>Review the media itself, not other reviewers or the creator&apos;s personal life</li>
      </ul>

      <h2 style={h2Style}>Respect Other Users</h2>
      <p style={p}>
        You will encounter people with different tastes and opinions. That is the point. Disagreement is welcome; hostility is not.
      </p>
      <ul style={ul}>
        <li>Critique ideas and opinions, not people</li>
        <li>Do not insult, belittle, or mock other users for their tastes</li>
        <li>Engage constructively when you disagree with a review</li>
        <li>Do not follow or target specific users with repeated negative interactions</li>
      </ul>

      <h2 style={h2Style}>Use Spoiler Tags</h2>
      <p style={p}>
        Many people use CrossShelf to decide what to watch, read, play, or listen to next. Protect their experience by marking spoilers appropriately.
      </p>
      <ul style={ul}>
        <li>Use spoiler tags when discussing specific plot points, twists, endings, or major reveals</li>
        <li>Stating general themes or vibes (e.g., &quot;this has a dark ending&quot;) is acceptable without spoiler tags</li>
        <li>When in doubt, err on the side of tagging as a spoiler</li>
      </ul>

      <h2 style={h2Style}>No Spam or Self-Promotion</h2>
      <ul style={ul}>
        <li>Do not post repetitive or copy-pasted reviews across multiple items</li>
        <li>Do not use reviews to advertise products, services, or external websites</li>
        <li>Do not post reviews that are unrelated to the media being reviewed</li>
        <li>Do not use automated tools or bots to post reviews or ratings</li>
      </ul>

      <h2 style={h2Style}>No Review Manipulation</h2>
      <p style={p}>
        The integrity of our ratings and reviews is fundamental to the platform. The following are strictly prohibited:
      </p>
      <ul style={ul}>
        <li>Creating multiple accounts to inflate or deflate ratings</li>
        <li>Coordinating with others to artificially boost or lower a score</li>
        <li>Offering or accepting payment, gifts, or incentives in exchange for reviews or ratings</li>
        <li>Rating items you have not experienced for the purpose of manipulation</li>
        <li>Using bots or scripts to submit ratings</li>
      </ul>

      <h2 style={h2Style}>No Hate Speech, Harassment, or Threats</h2>
      <p style={p}>
        The following content is prohibited on CrossShelf:
      </p>
      <ul style={ul}>
        <li><strong>Hate speech:</strong> Content that promotes violence, hatred, or discrimination against individuals or groups based on race, ethnicity, nationality, religion, gender, gender identity, sexual orientation, age, disability, or other protected characteristics</li>
        <li><strong>Harassment:</strong> Repeatedly targeting, intimidating, or threatening another user; doxxing (sharing personal information); stalking behavior</li>
        <li><strong>Threats:</strong> Threatening violence or harm against any person, group, or organization</li>
        <li><strong>Graphic violence:</strong> Gratuitous descriptions of violence in reviews that go beyond discussing the media&apos;s content</li>
      </ul>

      <h2 style={h2Style}>No Illegal or Explicit Content</h2>
      <ul style={ul}>
        <li>Do not post content that promotes or facilitates illegal activity</li>
        <li>Do not post sexually explicit content in reviews or profile information</li>
        <li>Do not share pirated content or links to pirated content</li>
        <li>Do not post content that infringes on copyright or other intellectual property rights</li>
      </ul>

      <h2 style={h2Style}>Reporting Violations</h2>
      <p style={p}>
        If you encounter content that violates these guidelines, please use the report button available on every review and profile. Reports are reviewed by our moderation team. We take all reports seriously and will investigate promptly.
      </p>
      <p style={p}>
        Please do not abuse the report feature. Filing false reports to harass other users or suppress legitimate reviews is itself a violation of these guidelines.
      </p>

      <h2 style={h2Style}>Consequences</h2>
      <p style={p}>
        Violations of these guidelines are handled through a graduated system based on severity and frequency:
      </p>
      <ul style={ul}>
        <li><strong>Content removal:</strong> The violating content is removed from the platform. You will be notified of the removal and the reason.</li>
        <li><strong>Warning:</strong> For first-time or minor violations, you will receive a formal warning explaining which guideline was violated and what is expected going forward.</li>
        <li><strong>Temporary suspension:</strong> For repeated violations or more serious offenses, your account may be temporarily suspended for a period determined by the severity of the violation.</li>
        <li><strong>Permanent ban:</strong> For egregious violations (threats, hate speech, persistent harassment) or continued violations after previous warnings and suspensions, your account will be permanently banned.</li>
      </ul>
      <p style={p}>
        We aim to be fair and proportionate in our enforcement. You may appeal any moderation decision by contacting us. Appeals are reviewed by a different member of our team than the one who made the original decision.
      </p>
    </div>
  );
}
