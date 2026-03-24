"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      textAlign: "center",
      padding: "80px 20px",
      maxWidth: 400,
      margin: "0 auto",
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
      <h1 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 28,
        fontWeight: 900,
        color: "#fff",
        marginBottom: 12,
      }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 28, lineHeight: 1.6 }}>
        An unexpected error occurred. Please try again.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            padding: "10px 24px",
            borderRadius: 12,
            background: "#E84855",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: "10px 24px",
            borderRadius: 12,
            background: "var(--surface-3)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
