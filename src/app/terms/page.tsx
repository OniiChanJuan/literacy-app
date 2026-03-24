export default function TermsPage() {
  const sectionStyle = { marginBottom: 28 };
  const headingStyle = {
    fontFamily: "var(--font-serif)" as const,
    fontSize: 18,
    fontWeight: 700 as const,
    color: "#fff",
    marginBottom: 10,
  };
  const textStyle = { fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 };

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 32,
        fontWeight: 900,
        color: "#fff",
        marginBottom: 8,
      }}>
        Terms of Service
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 40 }}>
        Last updated: March 2026
      </p>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Using Literacy</h2>
        <p style={textStyle}>
          Literacy is a platform for rating, reviewing, and discovering media across all types. By creating an account, you agree to use the service respectfully and in accordance with these terms.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Your content</h2>
        <p style={textStyle}>
          Reviews, ratings, and other content you create on Literacy remain yours. By posting content, you grant Literacy a license to display it on the platform. You can delete your content at any time by removing individual reviews or deleting your account.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Community guidelines</h2>
        <p style={textStyle}>
          Be respectful in your reviews and interactions. Do not post spam, hate speech, harassment, threats, or content that promotes violence. Do not impersonate other users or public figures. Reviews should be genuine opinions about the media being reviewed.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Content moderation</h2>
        <p style={textStyle}>
          We reserve the right to remove content that violates these guidelines and to suspend or ban accounts that repeatedly violate them. We will notify you if action is taken against your account.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Account security</h2>
        <p style={textStyle}>
          You are responsible for keeping your account credentials secure. Do not share your password with others. If you believe your account has been compromised, change your password immediately.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Changes to these terms</h2>
        <p style={textStyle}>
          We may update these terms from time to time. We will notify users of significant changes via email or an in-app notice. Continued use of the service after changes constitutes acceptance of the updated terms.
        </p>
      </div>
    </div>
  );
}
