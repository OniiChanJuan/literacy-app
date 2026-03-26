"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * Banner shown to logged-in users who haven't verified their email.
 * Google OAuth users are auto-verified so they won't see this.
 * Doesn't block usage — just a reminder.
 */
export default function EmailVerificationBanner() {
  const { data: session, status } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    // Check if email is verified
    fetch("/api/auth/check-verification")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsVerification) {
          setNeedsVerification(true);
        }
      })
      .catch(() => {});
  }, [status, session?.user?.id]);

  if (!needsVerification || dismissed || status !== "authenticated") return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await fetch("/api/auth/resend-verification", { method: "POST" });
      setSent(true);
    } catch {
      // silently fail
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      background: "rgba(249,166,32,0.1)",
      borderBottom: "1px solid rgba(249,166,32,0.2)",
      padding: "8px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      fontSize: 12,
      color: "rgba(255,255,255,0.7)",
      position: "relative",
    }}>
      <span>
        {sent
          ? "Verification email sent! Check your inbox."
          : "Please verify your email to secure your account."}
      </span>
      {!sent && (
        <button
          onClick={handleResend}
          disabled={sending}
          style={{
            background: "none",
            border: "1px solid rgba(249,166,32,0.4)",
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 11,
            color: "#F9A620",
            cursor: sending ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {sending ? "Sending..." : "Resend verification"}
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.3)",
          cursor: "pointer",
          fontSize: 14,
          padding: "2px 6px",
        }}
        title="Dismiss"
      >
        &#x2715;
      </button>
    </div>
  );
}
