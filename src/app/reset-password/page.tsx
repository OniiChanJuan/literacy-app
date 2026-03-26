"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Suspense } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  if (session?.user) {
    router.push("/");
    return null;
  }

  if (!token) {
    return (
      <div className="content-width" style={{ maxWidth: 400, marginTop: 60, textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, marginBottom: 12, color: "#fff" }}>
          Invalid Reset Link
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
          This reset link is invalid or has expired. Please request a new one.
        </p>
        <Link href="/forgot-password" style={{
          display: "inline-block",
          padding: "10px 20px",
          borderRadius: 10,
          background: "#E84855",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
        }}>
          Request New Link
        </Link>
      </div>
    );
  }

  const passwordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    match: password === confirmPassword && password.length > 0,
  };

  const canSubmit = Object.values(passwordChecks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="content-width" style={{ maxWidth: 400, marginTop: 60, textAlign: "center" }}>
        <div style={{
          background: "rgba(46,196,182,0.1)",
          border: "1px solid rgba(46,196,182,0.3)",
          borderRadius: 12,
          padding: "24px",
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>&#x2705;</div>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#fff" }}>
            Password Reset
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
            Your password has been updated successfully. You can now sign in with your new password.
          </p>
        </div>
        <Link href="/login" style={{
          display: "inline-block",
          padding: "12px 24px",
          borderRadius: 12,
          background: "#E84855",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          textDecoration: "none",
        }}>
          Sign In
        </Link>
      </div>
    );
  }

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
          Set new password
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Choose a strong password for your account.
        </p>
      </div>

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

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
            New Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
          {password.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
              {[
                { check: passwordChecks.length, label: "At least 8 characters" },
                { check: passwordChecks.upper, label: "One uppercase letter" },
                { check: passwordChecks.lower, label: "One lowercase letter" },
                { check: passwordChecks.number, label: "One number" },
              ].map(({ check, label }) => (
                <span key={label} style={{ fontSize: 11, color: check ? "#2EC4B6" : "var(--text-faint)" }}>
                  {check ? "\u2713" : "\u2717"} {label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${confirmPassword.length > 0 ? (passwordChecks.match ? "rgba(46,196,182,0.5)" : "rgba(232,72,85,0.5)") : "var(--border)"}`,
              background: "var(--surface-1)",
              color: "#fff",
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {confirmPassword.length > 0 && !passwordChecks.match && (
            <span style={{ fontSize: 11, color: "#E84855", marginTop: 4, display: "block" }}>
              Passwords don&apos;t match
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !canSubmit}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            border: "none",
            background: canSubmit ? "#E84855" : "rgba(232,72,85,0.3)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: loading || !canSubmit ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Resetting..." : "Reset Password"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
        <Link href="/login" style={{ color: "#3185FC", textDecoration: "none", fontWeight: 600 }}>
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="content-width" style={{ maxWidth: 400, marginTop: 60, textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
