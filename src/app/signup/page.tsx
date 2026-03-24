"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (name.length > 30) {
      setError("Name must be 30 characters or less");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!agreedToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, honeypot, agreedToTerms }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Account created but login failed. Try signing in.");
    } else {
      router.push("/");
      router.refresh();
    }
  };

  const inputStyle = {
    width: "100%" as const,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-1)",
    color: "#fff",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{
      maxWidth: 400,
      margin: "60px auto",
      padding: "0 20px",
    }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: 32,
          fontWeight: 900,
          marginBottom: 8,
          background: "linear-gradient(135deg, #E84855, #3185FC, #2EC4B6)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Join Literacy
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Create an account to start rating and reviewing
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
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={30}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
            Email
          </label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
            Password
          </label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} placeholder="At least 8 characters" />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
            Confirm Password
          </label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={inputStyle} />
        </div>

        {/* Honeypot field — hidden from real users, bots fill it in */}
        <div style={{ position: "absolute", left: -9999, opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
          <label>Leave this empty</label>
          <input
            type="text"
            name="website"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Terms checkbox */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            cursor: "pointer",
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              style={{ marginTop: 2, accentColor: "#E84855" }}
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" style={{ color: "#3185FC", textDecoration: "none" }}>
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" style={{ color: "#3185FC", textDecoration: "none" }}>
                Privacy Policy
              </Link>
            </span>
          </label>
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
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "#3185FC", textDecoration: "none", fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
