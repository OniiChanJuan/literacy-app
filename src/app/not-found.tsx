import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      textAlign: "center",
      padding: "80px 20px",
      maxWidth: 400,
      margin: "0 auto",
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>📚</div>
      <h1 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 28,
        fontWeight: 900,
        color: "#fff",
        marginBottom: 12,
      }}>
        Page not found
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 28, lineHeight: 1.6 }}>
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          padding: "10px 24px",
          borderRadius: 12,
          background: "#E84855",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Back to home
      </Link>
    </div>
  );
}
