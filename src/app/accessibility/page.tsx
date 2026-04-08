export default function AccessibilityPage() {
  const heading: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 };
  const h2Style: React.CSSProperties = { fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 36, marginBottom: 12 };
  const h3Style: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 24, marginBottom: 8 };
  const p: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, marginBottom: 16 };
  const ul: React.CSSProperties = { fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, paddingLeft: 20, marginBottom: 16 };
  const updated: React.CSSProperties = { fontSize: 12, color: "rgba(255,255,255,0.25)", marginBottom: 24 };

  return (
    <div className="content-width" style={{ maxWidth: 800, marginTop: 40 }}>
      <h1 style={heading}>Accessibility Statement</h1>
      <p style={updated}>Last updated: March 24, 2026</p>

      <h2 style={h2Style}>Our Commitment</h2>
      <p style={p}>
        CrossShelf is committed to ensuring digital accessibility for all users, including people with disabilities. We believe everyone should be able to discover, rate, and review media regardless of ability. We are continually improving the user experience for everyone and applying relevant accessibility standards.
      </p>

      <h2 style={h2Style}>Standards</h2>
      <p style={p}>
        We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. These guidelines explain how to make web content more accessible to people with a wide range of disabilities, including visual, auditory, physical, speech, cognitive, language, learning, and neurological disabilities.
      </p>

      <h2 style={h2Style}>Current Accessibility Features</h2>

      <h3 style={h3Style}>Keyboard Navigation</h3>
      <p style={p}>
        All interactive elements on CrossShelf can be accessed and operated using a keyboard alone. You can navigate through the site using the Tab key, activate buttons and links with Enter or Space, and close modals with Escape.
      </p>

      <h3 style={h3Style}>Screen Reader Support</h3>
      <p style={p}>
        We use semantic HTML elements (headings, landmarks, lists, buttons) and ARIA attributes where necessary to ensure screen readers can accurately convey the content and structure of our pages. Images include descriptive alt text.
      </p>

      <h3 style={h3Style}>Color Contrast</h3>
      <p style={p}>
        We maintain color contrast ratios that meet WCAG 2.1 Level AA requirements (minimum 4.5:1 for normal text, 3:1 for large text). Our dark theme has been designed with accessibility in mind, using carefully selected text and background color combinations.
      </p>

      <h3 style={h3Style}>Alt Text</h3>
      <p style={p}>
        Media cover images and user avatars include descriptive alternative text so that screen reader users understand the content being displayed. Decorative images are marked appropriately so they are skipped by assistive technologies.
      </p>

      <h3 style={h3Style}>Focus Indicators</h3>
      <p style={p}>
        All interactive elements display visible focus indicators when navigated to via keyboard. Focus styles are designed to be clearly visible against our dark background.
      </p>

      <h3 style={h3Style}>Text Sizing</h3>
      <p style={p}>
        The site supports browser-level text resizing up to 200% without loss of content or functionality. Our layouts use relative units that adapt to user font size preferences.
      </p>

      <h2 style={h2Style}>Known Limitations</h2>
      <p style={p}>
        While we strive for full accessibility, some areas of the platform may have limitations:
      </p>
      <ul style={ul}>
        <li>Some interactive visualizations (such as rating distribution charts) may not be fully accessible to screen readers. We provide text alternatives where possible.</li>
        <li>Hover preview popups are currently mouse-activated; we are working on keyboard-accessible alternatives.</li>
        <li>Some third-party content (such as embedded media from external APIs) may not meet our accessibility standards.</li>
        <li>Older content may not yet have complete alt text or ARIA labels.</li>
      </ul>
      <p style={p}>
        We are actively working to address these limitations and improve accessibility across the entire platform.
      </p>

      <h2 style={h2Style}>Feedback</h2>
      <p style={p}>
        We welcome your feedback on the accessibility of CrossShelf. If you encounter any accessibility barriers, have suggestions for improvement, or need assistance using any part of the platform, please contact us:
      </p>
      <p style={p}>
        Email: <a href="mailto:accessibility@crossshelf.app" style={{ color: "#E84855" }}>accessibility@crossshelf.app</a>
      </p>
      <p style={p}>
        When contacting us about an accessibility issue, please include:
      </p>
      <ul style={ul}>
        <li>A description of the issue you encountered</li>
        <li>The page URL where the issue occurred</li>
        <li>The assistive technology you are using (if applicable)</li>
        <li>Your browser and operating system</li>
      </ul>
      <p style={p}>
        We will make every effort to respond within 5 business days and to address reported issues promptly.
      </p>

      <h2 style={h2Style}>Continuous Improvement</h2>
      <p style={p}>
        Accessibility is an ongoing effort. We regularly review our platform for accessibility issues, include accessibility considerations in our development process, and work to ensure that new features meet WCAG 2.1 Level AA standards before release.
      </p>
    </div>
  );
}
