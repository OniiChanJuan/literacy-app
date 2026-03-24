"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function CompleteProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Check if user already has a username — if so, skip to home
  useEffect(() => {
    if (session?.user?.id) {
      fetch(`/api/users/${session.user.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.username) {
            router.push("/");
          }
        })
        .catch(() => {});
    }
  }, [session, router]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus !== "available") return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/users/set-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.toLowerCase().trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="content-width" style={{ textAlign: "center", paddingTop: 80, paddingBottom: 20, color: "var(--text-faint)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="content-width" style={{ maxWidth: 400, marginTop: 80 }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <h1 style={{
          fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, marginBottom: 8,
          color: "#fff",
        }}>
          Welcome to Literacy!
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Choose a username to complete your profile
        </p>
      </div>

      {session?.user?.image && (
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img
            src={session.user.image}
            alt=""
            width={60}
            height={60}
            style={{ borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)" }}
          />
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginTop: 8 }}>
            {session.user.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
            {session.user.email}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{
            background: "#E8485522", border: "1px solid #E8485555", borderRadius: 10,
            padding: "10px 14px", fontSize: 13, color: "#E84855", marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
            Username
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              maxLength={20}
              placeholder="3-20 chars: letters, numbers, _, -"
              autoFocus
              style={{
                width: "100%", padding: "12px 40px 12px 14px", borderRadius: 10, fontSize: 14,
                background: "var(--surface-1)", color: "#fff", outline: "none", boxSizing: "border-box",
                border: usernameStatus === "available" ? "1px solid #2EC4B6" :
                  usernameStatus === "taken" || usernameStatus === "invalid" ? "1px solid #E84855" :
                  "1px solid var(--border)",
              }}
            />
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>
              {usernameStatus === "checking" && <span style={{ color: "var(--text-faint)" }}>...</span>}
              {usernameStatus === "available" && <span style={{ color: "#2EC4B6" }}>✓</span>}
              {usernameStatus === "taken" && <span style={{ color: "#E84855" }}>✗</span>}
              {usernameStatus === "invalid" && <span style={{ color: "#E84855" }}>✗</span>}
            </span>
          </div>
          {usernameStatus === "taken" && <div style={{ fontSize: 11, color: "#E84855", marginTop: 4 }}>This username is taken</div>}
          {usernameStatus === "invalid" && <div style={{ fontSize: 11, color: "#E84855", marginTop: 4 }}>3-20 chars: letters, numbers, underscores, hyphens</div>}
          {usernameStatus === "available" && <div style={{ fontSize: 11, color: "#2EC4B6", marginTop: 4 }}>Username is available!</div>}
        </div>

        <button
          type="submit"
          disabled={loading || usernameStatus !== "available"}
          style={{
            width: "100%", padding: "12px 16px", borderRadius: 12, border: "none",
            background: "#E84855", color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: loading || usernameStatus !== "available" ? "not-allowed" : "pointer",
            opacity: loading || usernameStatus !== "available" ? 0.6 : 1,
          }}
        >
          {loading ? "Setting up..." : "Complete Profile"}
        </button>
      </form>
    </div>
  );
}
