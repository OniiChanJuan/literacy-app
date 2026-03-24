export default function PrivacyPage() {
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
        Privacy Policy
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 40 }}>
        Last updated: March 2026
      </p>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>What we collect</h2>
        <p style={textStyle}>
          When you create an account, we collect your email address, display name, and password (stored securely as a hash, never in plain text). When you use Literacy, we store your ratings, reviews, library tracking data, and profile information you choose to provide (bio, avatar).
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>How we use your data</h2>
        <p style={textStyle}>
          Your data is used to provide the Literacy service: displaying your ratings and reviews, powering recommendations, and enabling social features like following other users. We use aggregated, anonymized data to improve recommendations for all users.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>What we never do</h2>
        <p style={textStyle}>
          We do not sell, rent, or share your personal data with third parties for marketing purposes. We do not use your data for advertising. We do not share your email address with other users.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Cookies</h2>
        <p style={textStyle}>
          We use only essential session cookies for authentication. These cookies are required for the site to function and cannot be disabled. We do not use tracking cookies, analytics cookies, or third-party advertising cookies.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Your rights</h2>
        <p style={textStyle}>
          You can view, edit, or delete your account and all associated data at any time from your profile settings. When you delete your account, all your ratings, reviews, library entries, and personal information are permanently removed from our systems.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Data security</h2>
        <p style={textStyle}>
          All data is transmitted over HTTPS. Passwords are hashed with bcrypt. Session tokens are HTTP-only cookies that cannot be accessed by JavaScript. We follow security best practices to protect your information.
        </p>
      </div>

      <div style={sectionStyle}>
        <h2 style={headingStyle}>Contact</h2>
        <p style={textStyle}>
          For privacy-related questions or requests, contact us at privacy@literacy.app.
        </p>
      </div>
    </div>
  );
}
