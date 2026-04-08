"use client";

import { useState } from "react";
import { useSession } from "@/lib/supabase/use-session";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  if (session?.user) {
    router.push("/");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError(resetError.message);
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content-width" style={{ maxWidth: 400, marginTop: 60 }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 28,
          fontWeight: 900,
          marginBottom: 8,
          color: "#fff",
        }}>
          Reset your password
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
          {sent
            ? "Check your email for a reset link."
            : "Enter your email and we'll send you a link to reset your password."}
        </p>
      </div>

      {sent ? (
        <div style={{
          background: "rgba(46,196,182,0.1)",
          border: "1px solid rgba(46,196,182,0.3)",
          borderRadius: 12,
          padding: "20px",
          textAlign: "center",
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>&#x2709;</div>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 8, lineHeight: 1.5 }}>
            If an account with that email exists, we&apos;ve sent a reset link.
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Didn&apos;t receive it? Check your spam folder or try again in a few minutes.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              background: "#E8485522",
              border: "1px solid #E8485555",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              color: "#E84855",
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface-1)",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#E84855",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      )}

      <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
        Remember your password?{" "}
        <Link href="/login" style={{ color: "#3185FC", textDecoration: "none", fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
