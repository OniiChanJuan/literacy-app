"use client";

import { useState, useEffect } from "react";

interface ReportData {
  id: number;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  reporter: { username: string; name: string };
  review: { id: number; text: string; user: { username: string } };
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  useEffect(() => {
    fetch(`/api/admin/reports?status=${filter}`)
      .then((r) => r.json())
      .then((data) => { setReports(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  const updateStatus = async (id: number, status: string) => {
    const res = await fetch("/api/admin/reports", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setReports((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    }
  };

  return (
    <div className="content-width" style={{ maxWidth: 900, paddingTop: 40 }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 24 }}>
        Review Reports
      </h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["pending", "reviewed", "actioned", "dismissed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: filter === s ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
              border: filter === s ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
              color: filter === s ? "#fff" : "rgba(255,255,255,0.4)",
              cursor: "pointer", textTransform: "capitalize",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading...</div>
      ) : reports.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20 }}>No {filter} reports</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map((report) => (
            <div key={report.id} style={{
              padding: 16, background: "rgba(255,255,255,0.02)",
              border: "0.5px solid rgba(255,255,255,0.06)", borderRadius: 10,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#E84855", textTransform: "capitalize" }}>
                    {report.reason.replace("_", " ")}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 8 }}>
                    by @{report.reporter.username} — {new Date(report.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 4,
                  background: report.status === "pending" ? "rgba(249,166,32,0.1)" : "rgba(46,196,182,0.1)",
                  color: report.status === "pending" ? "#F9A620" : "#2EC4B6",
                  fontWeight: 600, textTransform: "uppercase",
                }}>
                  {report.status}
                </span>
              </div>

              <div style={{
                fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8,
                padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6,
              }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 4 }}>
                  Review by @{report.review.user.username}:
                </div>
                {report.review.text.slice(0, 200)}{report.review.text.length > 200 ? "..." : ""}
              </div>

              {report.details && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
                  Details: {report.details}
                </div>
              )}

              {report.status === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => updateStatus(report.id, "actioned")}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "none",
                      background: "#E84855", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Take Action
                  </button>
                  <button
                    onClick={() => updateStatus(report.id, "dismissed")}
                    style={{
                      padding: "4px 12px", borderRadius: 6,
                      border: "0.5px solid rgba(255,255,255,0.1)", background: "none",
                      color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer",
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
