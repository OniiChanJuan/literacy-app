"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "already" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Invalid verification link.");
      return;
    }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setStatus("error");
          setErrorMsg(data.error);
        } else if (data.alreadyVerified) {
          setStatus("already");
        } else {
          setStatus("success");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again.");
      });
  }, [token]);

  return (
    <div className="content-width" style={{ maxWidth: 420, marginTop: 60, textAlign: "center" }}>
      {status === "loading" && (
        <div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
            Verifying your email...
          </h1>
          <div style={{
            width: 32, height: 32, border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "#E84855", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "20px auto",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {status === "success" && (
        <div style={{
          background: "rgba(46,196,182,0.1)",
          border: "1px solid rgba(46,196,182,0.3)",
          borderRadius: 12,
          padding: "28px",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>&#x2705;</div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            Email Verified
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20, lineHeight: 1.5 }}>
            Your email has been verified. You now have full access to Literacy.
          </p>
          <Link href="/" style={{
            display: "inline-block",
            padding: "10px 24px",
            borderRadius: 10,
            background: "#E84855",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}>
            Go to For You
          </Link>
        </div>
      )}

      {status === "already" && (
        <div style={{
          background: "rgba(49,133,252,0.1)",
          border: "1px solid rgba(49,133,252,0.3)",
          borderRadius: 12,
          padding: "28px",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>&#x2139;</div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            Already Verified
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20, lineHeight: 1.5 }}>
            Your email is already verified. You&apos;re all set!
          </p>
          <Link href="/" style={{
            display: "inline-block",
            padding: "10px 24px",
            borderRadius: 10,
            background: "#3185FC",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}>
            Go to For You
          </Link>
        </div>
      )}

      {status === "error" && (
        <div style={{
          background: "rgba(232,72,85,0.1)",
          border: "1px solid rgba(232,72,85,0.3)",
          borderRadius: 12,
          padding: "28px",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>&#x26A0;</div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            Verification Failed
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20, lineHeight: 1.5 }}>
            {errorMsg}
          </p>
          <Link href="/login" style={{
            display: "inline-block",
            padding: "10px 24px",
            borderRadius: 10,
            background: "#E84855",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}>
            Go to Sign In
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="content-width" style={{ maxWidth: 420, marginTop: 60, textAlign: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
