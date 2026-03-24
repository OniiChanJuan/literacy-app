"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function passwordStrength(pw: string): { level: "weak" | "medium" | "strong"; color: string; text: string } {
  if (!pw) return { level: "weak", color: "#E84855", text: "" };
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
  const long = pw.length >= 12;
  const score = [hasUpper, hasLower, hasNumber, hasSpecial, long, pw.length >= 8].filter(Boolean).length;
  if (score >= 5) return { level: "strong", color: "#2EC4B6", text: "Strong" };
  if (score >= 3) return { level: "medium", color: "#F9A620", text: "Medium" };
  return { level: "weak", color: "#E84855", text: "Weak" };
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Debounced username check
  const checkUsername = useCallback((u: string) => {
    const clean = u.toLowerCase().trim();
    if (!clean || clean.length < 3) { setUsernameStatus("idle"); return; }
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(clean)) { setUsernameStatus("invalid"); return; }

    setUsernameStatus("checking");
    fetch(`/api/auth/check-username?username=${encodeURIComponent(clean)}`)
      .then((r) => r.json())
      .then((data) => setUsernameStatus(data.available ? "available" : "taken"))
      .catch(() => setUsernameStatus("idle"));
  }, []);

  useEffect(() => {
    if (!username) { setUsernameStatus("idle"); return; }
    const timer = setTimeout(() => checkUsername(username), 300);
    return () => clearTimeout(timer);
  }, [username, checkUsername]);

  const strength = passwordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (name.length > 30) { setError("Name must be 30 characters or less"); return; }
    if (usernameStatus !== "available") { setError("Please choose an available username"); return; }
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(password)) { setError("Password needs at least one uppercase letter"); return; }
    if (!/[a-z]/.test(password)) { setError("Password needs at least one lowercase letter"); return; }
    if (!/[0-9]/.test(password)) { setError("Password needs at least one number"); return; }
    if (!agreedToTerms) { setError("You must agree to the Terms of Service and Privacy Policy"); return; }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username: username.toLowerCase().trim(), email, password, honeypot, agreedToTerms }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });
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
    <div style={{ maxWidth: 400, margin: "60px auto", padding: "0 20px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <h1 style={{
          fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 900, marginBottom: 8,
          background: "linear-gradient(135deg, #E84855, #3185FC, #2EC4B6)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Join Literacy
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Create an account to start rating and reviewing
        </p>
      </div>

      {/* Google Sign Up */}
      <button
        onClick={() => signIn("google", { callbackUrl: "/complete-profile" })}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
          color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          marginBottom: 24,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Or sign up with email</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{
            background: "#E8485522", border: "1px solid #E8485555", borderRadius: 10,
            padding: "10px 14px", fontSize: 13, color: "#E84855", marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
            Display Name
          </label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={30} style={inputStyle} />
        </div>

        {/* Username */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
            Username
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              required
              maxLength={20}
              placeholder="3-20 chars: letters, numbers, _, -"
              style={{
                ...inputStyle,
                borderColor: usernameStatus === "available" ? "#2EC4B6" :
                  usernameStatus === "taken" || usernameStatus === "invalid" ? "#E84855" : "var(--border)",
                paddingRight: 36,
              }}
            />
            {/* Status indicator */}
            <span style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14,
            }}>
              {usernameStatus === "checking" && <span style={{ color: "var(--text-faint)" }}>...</span>}
              {usernameStatus === "available" && <span style={{ color: "#2EC4B6" }}>✓</span>}
              {usernameStatus === "taken" && <span style={{ color: "#E84855" }}>✗</span>}
              {usernameStatus === "invalid" && <span style={{ color: "#E84855" }}>✗</span>}
            </span>
          </div>
          {usernameStatus === "taken" && (
            <div style={{ fontSize: 11, color: "#E84855", marginTop: 4 }}>This username is taken</div>
          )}
          {usernameStatus === "invalid" && (
            <div style={{ fontSize: 11, color: "#E84855", marginTop: 4 }}>3-20 chars: letters, numbers, underscores, hyphens</div>
          )}
        </div>

        {/* Email */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} placeholder="Min 8 chars, uppercase, lowercase, number" />
          {password && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                <div style={{
                  height: "100%", borderRadius: 2, background: strength.color, transition: "width 0.3s",
                  width: strength.level === "weak" ? "33%" : strength.level === "medium" ? "66%" : "100%",
                }} />
              </div>
              <span style={{ fontSize: 10, color: strength.color, fontWeight: 600 }}>{strength.text}</span>
            </div>
          )}
          {password && (
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4, display: "flex", gap: 8 }}>
              <span style={{ color: /[A-Z]/.test(password) ? "#2EC4B6" : "var(--text-faint)" }}>A-Z ✓</span>
              <span style={{ color: /[a-z]/.test(password) ? "#2EC4B6" : "var(--text-faint)" }}>a-z ✓</span>
              <span style={{ color: /[0-9]/.test(password) ? "#2EC4B6" : "var(--text-faint)" }}>0-9 ✓</span>
              <span style={{ color: password.length >= 8 ? "#2EC4B6" : "var(--text-faint)" }}>8+ ✓</span>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>Confirm Password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            style={{
              ...inputStyle,
              borderColor: confirm && confirm !== password ? "#E84855" : confirm && confirm === password ? "#2EC4B6" : "var(--border)",
            }}
          />
          {confirm && confirm !== password && (
            <div style={{ fontSize: 11, color: "#E84855", marginTop: 4 }}>Passwords don't match</div>
          )}
        </div>

        {/* Honeypot */}
        <div style={{ position: "absolute", left: -9999, opacity: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
          <label>Leave this empty</label>
          <input type="text" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
        </div>

        {/* Terms */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
            fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5,
          }}>
            <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} style={{ marginTop: 2, accentColor: "#E84855" }} />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" style={{ color: "#3185FC", textDecoration: "none" }}>Terms of Service</Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" style={{ color: "#3185FC", textDecoration: "none" }}>Privacy Policy</Link>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || usernameStatus !== "available"}
          style={{
            width: "100%", padding: "12px 16px", borderRadius: 12, border: "none",
            background: "#E84855", color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading || usernameStatus !== "available" ? 0.6 : 1,
          }}
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "#3185FC", textDecoration: "none", fontWeight: 600 }}>Sign in</Link>
      </p>
    </div>
  );
}
