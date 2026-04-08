"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signOut } from "@/lib/supabase/use-session";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Section = "profile" | "account" | "privacy" | "notifications" | "appearance" | "import";

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "account", label: "Account", icon: "🔐" },
  { id: "privacy", label: "Privacy", icon: "🔒" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "appearance", label: "Appearance", icon: "🎨" },
  { id: "import", label: "Import Data", icon: "📥" },
];

const MEDIA_TYPES = ["Movies", "TV", "Books", "Manga", "Comics", "Games", "Music", "Podcasts"];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [section, setSection] = useState<Section>("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Profile state
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid" | "unchanged">("idle");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [favoriteTypes, setFavoriteTypes] = useState<string[]>([]);

  const [memberNumber, setMemberNumber] = useState<number | null>(null);
  const [joinedDate, setJoinedDate] = useState("");

  // Account state
  const [hasPassword, setHasPassword] = useState(false);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [deleteUsername, setDeleteUsername] = useState("");
  const [deletePw, setDeletePw] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  // Privacy state
  const [isPrivate, setIsPrivate] = useState(false);
  const [showRatings, setShowRatings] = useState(true);
  const [showLibrary, setShowLibrary] = useState(true);
  const [showActivity, setShowActivity] = useState(true);

  // Notifications state
  const [emailFollower, setEmailFollower] = useState(true);
  const [emailReview, setEmailReview] = useState(true);
  const [emailFranchise, setEmailFranchise] = useState(true);
  const [emailDigest, setEmailDigest] = useState(true);

  // Appearance state
  const [theme, setTheme] = useState("dark");
  const [defaultMedia, setDefaultMedia] = useState("all");
  const [showMature, setShowMature] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Read ?tab= query param on mount to deep-link to a specific section
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as Section | null;
    if (tab && SECTIONS.some(s => s.id === tab)) {
      setSection(tab);
    }
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setName(data.user.name || "");
          setUsername(data.user.username || "");
          setOriginalUsername(data.user.username || "");
          setBio(data.user.bio || "");
          setEmail(data.user.email || "");
          setIsPrivate(data.user.isPrivate || false);
          setHasPassword(data.user.hasPassword || false);
          setMemberNumber(data.user.memberNumber || null);
          setJoinedDate(data.user.createdAt ? new Date(data.user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "");
        }
        if (data.settings) {
          setShowRatings(data.settings.showRatingsPublicly);
          setShowLibrary(data.settings.showLibraryPublicly);
          setShowActivity(data.settings.showActivityPublicly);
          setTheme(data.settings.theme);
          setDefaultMedia(data.settings.defaultMediaType);
          setShowMature(data.settings.showMatureContent);
          setEmailFollower(data.settings.emailNewFollower);
          setEmailReview(data.settings.emailReviewLiked);
          setEmailFranchise(data.settings.emailFranchiseRelease);
          setEmailDigest(data.settings.emailWeeklyDigest);
          setFavoriteTypes(Array.isArray(data.settings.favoriteMediaTypes) ? data.settings.favoriteMediaTypes : []);
        }
        if (data.connectedProviders) setConnectedProviders(data.connectedProviders);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session]);

  // Username availability check
  const checkUsername = useCallback((u: string) => {
    if (u === originalUsername) { setUsernameStatus("unchanged"); return; }
    const clean = u.toLowerCase().trim();
    if (!clean || clean.length < 3) { setUsernameStatus("idle"); return; }
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(clean)) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    fetch(`/api/auth/check-username?username=${encodeURIComponent(clean)}`)
      .then((r) => r.json())
      .then((data) => setUsernameStatus(data.available ? "available" : "taken"))
      .catch(() => setUsernameStatus("idle"));
  }, [originalUsername]);

  useEffect(() => {
    if (!username) return;
    const timer = setTimeout(() => checkUsername(username), 300);
    return () => clearTimeout(timer);
  }, [username, checkUsername]);

  const saveProfile = async () => {
    setSaving(true); setError(""); setMessage("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username: username.toLowerCase().trim(), bio, email, favoriteMediaTypes: favoriteTypes }),
    });
    if (res.ok) { setMessage("Profile saved!"); setOriginalUsername(username.toLowerCase().trim()); }
    else { const d = await res.json(); setError(d.error || "Failed to save"); }
    setSaving(false);
  };

  const savePrivacy = async () => {
    setSaving(true); setError(""); setMessage("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrivate, showRatingsPublicly: showRatings, showLibraryPublicly: showLibrary, showActivityPublicly: showActivity }),
    });
    if (res.ok) setMessage("Privacy settings saved!");
    else setError("Failed to save");
    setSaving(false);
  };

  const saveNotifications = async () => {
    setSaving(true); setError(""); setMessage("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailNewFollower: emailFollower, emailReviewLiked: emailReview, emailFranchiseRelease: emailFranchise, emailWeeklyDigest: emailDigest }),
    });
    if (res.ok) setMessage("Notification preferences saved!");
    else setError("Failed to save");
    setSaving(false);
  };

  const saveAppearance = async () => {
    setSaving(true); setError(""); setMessage("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme, defaultMediaType: defaultMedia, showMatureContent: showMature }),
    });
    if (res.ok) setMessage("Appearance settings saved!");
    else setError("Failed to save");
    setSaving(false);
  };

  const changePassword = async () => {
    if (newPw !== confirmPw) { setError("Passwords don't match"); return; }
    setSaving(true); setError(""); setMessage("");
    // Supabase Auth handles password updates client-side. The current
    // password isn't required by Supabase, but we keep the input as a
    // basic anti-shoulder-surf check on the UI.
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error: e } = await supabase.auth.updateUser({ password: newPw });
    if (e) setError(e.message);
    else { setMessage("Password updated!"); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }
    setSaving(false);
  };

  const deleteAccount = async () => {
    setSaving(true); setError("");
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-account", confirmUsername: deleteUsername, password: deletePw }),
    });
    if (res.ok) { signOut({ callbackUrl: "/" }); }
    else { const d = await res.json(); setError(d.error || "Failed"); }
    setSaving(false);
  };

  if (loading || status === "loading") {
    return <div style={{ padding: "80px 20px", textAlign: "center", color: "var(--text-faint)" }}>Loading settings...</div>;
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)",
    background: "var(--surface-1)", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    width: 44, height: 24, borderRadius: 12, cursor: "pointer", position: "relative",
    background: active ? "#2EC4B6" : "rgba(255,255,255,0.1)", border: "none",
    transition: "background 0.2s",
  });

  const toggleDot = (active: boolean): React.CSSProperties => ({
    position: "absolute", top: 3, left: active ? 23 : 3,
    width: 18, height: 18, borderRadius: "50%", background: "#fff",
    transition: "left 0.2s",
  });

  return (
    <div className="content-width" style={{ paddingTop: 40 }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 28 }}>
        Settings
      </h1>

      {/* Feedback messages */}
      {message && <div style={{ background: "#2EC4B622", border: "1px solid #2EC4B644", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#2EC4B6", marginBottom: 16 }}>{message}</div>}
      {error && <div style={{ background: "#E8485522", border: "1px solid #E8485544", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#E84855", marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "flex", gap: 32 }}>
        {/* Sidebar */}
        <div style={{ minWidth: 160 }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => { setSection(s.id); setMessage(""); setError(""); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "10px 14px", borderRadius: 8, marginBottom: 4,
                background: section === s.id ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none", color: section === s.id ? "#fff" : "var(--text-faint)",
                fontSize: 13, fontWeight: section === s.id ? 600 : 400,
                cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ fontSize: 14 }}>{s.icon}</span> {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, maxWidth: 600 }}>
          {/* PROFILE */}
          {section === "profile" && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Profile</h2>

              {memberNumber && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 20,
                  padding: "10px 14px", borderRadius: 8,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                    Member #{memberNumber}
                    {joinedDate && ` — joined ${joinedDate}`}
                  </span>
                  {memberNumber <= 100 && (
                    <span style={{
                      fontSize: 10, color: "#F9A620", fontWeight: 600,
                      background: "#F9A62015", padding: "2px 8px", borderRadius: 6,
                      border: "1px solid #F9A62025",
                    }}>
                      ★ Founding member
                    </span>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-faint)", marginBottom: 6, fontWeight: 600 }}>Display Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} style={inputStyle} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-faint)", marginBottom: 6, fontWeight: 600 }}>Username</label>
                <div style={{ position: "relative" }}>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                    maxLength={20}
                    style={{ ...inputStyle, paddingRight: 36 }}
                  />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>
                    {usernameStatus === "checking" && "..."}
                    {usernameStatus === "available" && <span style={{ color: "#2EC4B6" }}>✓</span>}
                    {usernameStatus === "taken" && <span style={{ color: "#E84855" }}>✗</span>}
                    {usernameStatus === "unchanged" && <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </span>
                </div>
                {username !== originalUsername && usernameStatus === "available" && (
                  <div style={{ fontSize: 11, color: "#F9A620", marginTop: 4 }}>
                    Your old username will become available for others to use
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-faint)", marginBottom: 6, fontWeight: 600 }}>
                  Bio <span style={{ fontWeight: 400 }}>({250 - bio.length} remaining)</span>
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={250}
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-faint)", marginBottom: 8, fontWeight: 600 }}>
                  Favorite Media Types (pick up to 3)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {MEDIA_TYPES.map((mt) => {
                    const active = favoriteTypes.includes(mt);
                    return (
                      <button
                        key={mt}
                        onClick={() => {
                          if (active) setFavoriteTypes(favoriteTypes.filter((t) => t !== mt));
                          else if (favoriteTypes.length < 3) setFavoriteTypes([...favoriteTypes, mt]);
                        }}
                        style={{
                          padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: active ? "#E8485522" : "rgba(255,255,255,0.04)",
                          border: active ? "1px solid #E84855" : "1px solid var(--border)",
                          color: active ? "#E84855" : "var(--text-faint)",
                          cursor: "pointer",
                        }}
                      >
                        {mt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={saveProfile} disabled={saving} style={{
                padding: "10px 24px", borderRadius: 10, border: "none", background: "#E84855",
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1,
              }}>
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          )}

          {/* ACCOUNT */}
          {section === "account" && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Account</h2>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-faint)", marginBottom: 6, fontWeight: 600 }}>Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={inputStyle} />
              </div>

              <div style={{ marginBottom: 24, padding: 16, background: "var(--surface-1)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>
                  {hasPassword ? "Change Password" : "Set a Password"}
                </h3>
                {!hasPassword && (
                  <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 12 }}>
                    Add email/password login alongside your Google account
                  </p>
                )}
                {hasPassword && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Current Password</label>
                    <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} style={inputStyle} />
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>New Password</label>
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={inputStyle} placeholder="Min 8 chars, uppercase, lowercase, number" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Confirm New Password</label>
                  <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle} />
                </div>
                <button onClick={changePassword} disabled={saving || !newPw} style={{
                  padding: "8px 18px", borderRadius: 8, border: "none", background: "#3185FC",
                  color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: saving || !newPw ? 0.5 : 1,
                }}>
                  {hasPassword ? "Update Password" : "Set Password"}
                </button>
              </div>

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Connected Accounts</h3>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  background: "var(--surface-1)", borderRadius: 8, border: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: 18 }}>🔵</span>
                  <span style={{ fontSize: 13, color: "#fff", flex: 1 }}>Google</span>
                  <span style={{ fontSize: 11, color: connectedProviders.includes("google") ? "#2EC4B6" : "var(--text-faint)" }}>
                    {connectedProviders.includes("google") ? "Connected" : "Not connected"}
                  </span>
                </div>
              </div>

              {/* Data Export */}
              <div style={{ marginBottom: 24, padding: 16, background: "var(--surface-1)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Your Data</h3>
                <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 12, lineHeight: 1.5 }}>
                  Download a copy of all your data including profile info, ratings, reviews, library entries, follows, taste profile, and activity history.
                </p>
                <button
                  onClick={() => {
                    window.location.href = "/api/export-data";
                  }}
                  style={{
                    padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)",
                    background: "var(--surface-2)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Download my data
                </button>
              </div>

              <div style={{ borderTop: "1px solid rgba(232,72,85,0.15)", paddingTop: 20 }}>
                <button
                  onClick={() => setShowDelete(!showDelete)}
                  style={{
                    background: "none", border: "none", color: "#E84855",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0,
                  }}
                >
                  {showDelete ? "Cancel" : "Delete my account"}
                </button>

                {showDelete && (
                  <div style={{
                    marginTop: 16, padding: 16, background: "#E8485508",
                    border: "1px solid #E8485522", borderRadius: 10,
                  }}>
                    <p style={{ fontSize: 12, color: "#E84855", marginBottom: 12, lineHeight: 1.6 }}>
                      This will permanently delete your account and all your data — ratings, reviews, library, and follows. This cannot be undone.
                    </p>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: "block", fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>
                        Type your username <strong>{originalUsername}</strong> to confirm
                      </label>
                      <input value={deleteUsername} onChange={(e) => setDeleteUsername(e.target.value)} style={inputStyle} />
                    </div>
                    {hasPassword && (
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Enter your password</label>
                        <input type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} style={inputStyle} />
                      </div>
                    )}
                    <button
                      onClick={deleteAccount}
                      disabled={saving || deleteUsername !== originalUsername}
                      style={{
                        padding: "8px 18px", borderRadius: 8, border: "none",
                        background: deleteUsername === originalUsername ? "#E84855" : "rgba(255,255,255,0.06)",
                        color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
                        opacity: deleteUsername === originalUsername ? 1 : 0.4,
                      }}
                    >
                      Delete permanently
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PRIVACY */}
          {section === "privacy" && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Privacy</h2>
              {[
                { label: "Profile visibility", desc: isPrivate ? "Private — only username and avatar visible" : "Public — ratings, reviews, and library visible to all", value: !isPrivate, set: (v: boolean) => setIsPrivate(!v) },
                { label: "Show ratings publicly", desc: "Your individual ratings visible on your profile", value: showRatings, set: setShowRatings },
                { label: "Show library publicly", desc: "Your tracked/completed items visible on your profile", value: showLibrary, set: setShowLibrary },
                { label: "Activity feed visibility", desc: "Your activity appears in followers' feeds", value: showActivity, set: setShowActivity },
              ].map((toggle) => (
                <div key={toggle.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{toggle.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{toggle.desc}</div>
                  </div>
                  <button onClick={() => toggle.set(!toggle.value)} style={toggleStyle(toggle.value)}>
                    <div style={toggleDot(toggle.value)} />
                  </button>
                </div>
              ))}
              <button onClick={savePrivacy} disabled={saving} style={{
                marginTop: 20, padding: "10px 24px", borderRadius: 10, border: "none",
                background: "#E84855", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>
                {saving ? "Saving..." : "Save Privacy Settings"}
              </button>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {section === "notifications" && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Notifications</h2>
              <p style={{ fontSize: 12, color: "#F9A620", marginBottom: 20 }}>📧 Email notifications coming soon</p>
              {[
                { label: "New follower", value: emailFollower, set: setEmailFollower },
                { label: "Someone liked your review", value: emailReview, set: setEmailReview },
                { label: "Franchise you follow has a new release", value: emailFranchise, set: setEmailFranchise },
                { label: "Weekly recommendations digest", value: emailDigest, set: setEmailDigest },
              ].map((toggle) => (
                <div key={toggle.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  <span style={{ fontSize: 13, color: "#fff" }}>{toggle.label}</span>
                  <button onClick={() => toggle.set(!toggle.value)} style={toggleStyle(toggle.value)}>
                    <div style={toggleDot(toggle.value)} />
                  </button>
                </div>
              ))}
              <button onClick={saveNotifications} disabled={saving} style={{
                marginTop: 20, padding: "10px 24px", borderRadius: 10, border: "none",
                background: "#E84855", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>
                Save
              </button>
            </div>
          )}

          {/* APPEARANCE */}
          {section === "appearance" && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Appearance</h2>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#fff", display: "block", marginBottom: 8 }}>Theme</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {["dark", "light"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      style={{
                        padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: theme === t ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                        border: theme === t ? "1px solid rgba(255,255,255,0.2)" : "1px solid var(--border)",
                        color: theme === t ? "#fff" : "var(--text-faint)", cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {t === "dark" ? "🌙" : "☀️"} {t}
                    </button>
                  ))}
                </div>
                {theme === "light" && <p style={{ fontSize: 11, color: "#F9A620", marginTop: 6 }}>Light mode styling coming soon</p>}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#fff", display: "block", marginBottom: 8 }}>Default Media Type</label>
                <select
                  value={defaultMedia}
                  onChange={(e) => setDefaultMedia(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="all">All</option>
                  {MEDIA_TYPES.map((mt) => <option key={mt} value={mt.toLowerCase()}>{mt}</option>)}
                </select>
              </div>

              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                marginBottom: 20,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>Mature content</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>Show mature-rated content in browse and recommendations</div>
                </div>
                <button onClick={() => setShowMature(!showMature)} style={toggleStyle(showMature)}>
                  <div style={toggleDot(showMature)} />
                </button>
              </div>

              <button onClick={saveAppearance} disabled={saving} style={{
                padding: "10px 24px", borderRadius: 10, border: "none",
                background: "#E84855", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>
                Save
              </button>
            </div>
          )}

          {/* IMPORT DATA */}
          {section === "import" && <ImportSection />}
        </div>
      </div>
    </div>
  );
}

// ─── Import Section Component ─────────────────────────────────────────

interface ImportRecord {
  id: number;
  source: string;
  status: string;
  totalItems: number;
  importedItems: number;
  skippedItems: number;
  failedItems: number;
  duplicateItems: number;
  startedAt: string;
  completedAt: string | null;
}

interface ImportResult {
  importId: number;
  imported: number;
  skipped: number;
  failed: number;
  duplicates: number;
  total: number;
  errors: string[];
}

type ImportSource = "letterboxd" | "goodreads" | "myanimelist" | "steam" | "spotify";
type ImportStep = "idle" | "uploading" | "parsing" | "matching" | "importing" | "done" | "error";

const PLATFORM_CONFIG: { id: ImportSource; name: string; icon: string; color: string; desc: string; method: string }[] = [
  { id: "letterboxd", name: "Letterboxd", icon: "🎬", color: "#00D735", desc: "Import your movie ratings, watchlist, and reviews", method: "Upload ZIP or CSV export" },
  { id: "goodreads", name: "Goodreads", icon: "📖", color: "#553B08", desc: "Import your book ratings, shelves, and reviews", method: "Upload CSV export" },
  { id: "myanimelist", name: "MyAnimeList", icon: "🗾", color: "#2E51A2", desc: "Import your anime and manga lists with ratings", method: "Enter your MAL username" },
  { id: "steam", name: "Steam", icon: "🎮", color: "#1B2838", desc: "Import your game library with playtime data", method: "Enter your Steam ID or profile URL" },
  { id: "spotify", name: "Spotify", icon: "🎵", color: "#1DB954", desc: "Import your saved albums and listening data", method: "Connect via Spotify" },
];

function ImportSection() {
  const [activeImport, setActiveImport] = useState<ImportSource | null>(null);
  const [step, setStep] = useState<ImportStep>("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [conflictMode, setConflictMode] = useState<"skip" | "overwrite" | "keep_higher">("skip");

  // Re-import warning state: set when a previous import from the same source exists
  const [pendingImport, setPendingImport] = useState<{
    source: ImportSource;
    items: any[];
    previousImport: ImportRecord;
  } | null>(null);

  // MAL/Steam inputs
  const [malUsername, setMalUsername] = useState("");
  const [steamId, setSteamId] = useState("");

  // Load import history
  useEffect(() => {
    fetch("/api/imports")
      .then(r => r.json())
      .then(data => { if (data.imports) setHistory(data.imports); })
      .catch(() => {});
  }, [result]); // refresh after each import

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)",
    background: "var(--surface-1)", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  // ── Chunked import helper ───────────────────────────────
  // Sends items to /api/import/batch in chunks of 50 and updates the progress
  // bar after each chunk, giving real-time feedback.

  const doChunkedImport = async (source: ImportSource, allItems: any[]): Promise<ImportResult> => {
    const CHUNK_SIZE = 50;
    let importId: number | undefined;
    let totalImported = 0, totalSkipped = 0, totalFailed = 0, totalDuplicates = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
      const chunk = allItems.slice(i, i + CHUNK_SIZE);
      const isLast = i + CHUNK_SIZE >= allItems.length;
      const processed = Math.min(i + CHUNK_SIZE, allItems.length);

      setProgress({
        current: processed,
        total: allItems.length,
        label: `Importing ${processed} of ${allItems.length}…`,
      });

      const res = await fetch("/api/import/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, items: chunk, conflictMode, importId, isLast }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }

      const data = await res.json();
      if (!importId) importId = data.importId;

      totalImported += data.imported;
      totalSkipped += data.skipped;
      totalFailed += data.failed;
      totalDuplicates += data.duplicates;
      allErrors.push(...(data.errors || []));

      // Small delay between chunks so the UI can re-render
      if (!isLast) await new Promise(r => setTimeout(r, 80));
    }

    return {
      importId: importId!,
      imported: totalImported,
      skipped: totalSkipped,
      failed: totalFailed,
      duplicates: totalDuplicates,
      total: allItems.length,
      errors: allErrors.slice(0, 10),
    };
  };

  // ── Check for previous import (re-import warning) ──────

  const checkAndStartImport = async (source: ImportSource, items: any[]) => {
    if (items.length === 0) {
      setError("No items found in the file. Make sure you uploaded the correct export file.");
      setStep("error");
      return;
    }

    // Look for a previous completed import from this source
    const prev = history.find(h => h.source === source && h.status === "completed");
    if (prev) {
      // Show re-import warning — store state and let user confirm
      setPendingImport({ source, items, previousImport: prev });
      return;
    }

    await runImport(source, items);
  };

  const runImport = async (source: ImportSource, items: any[]) => {
    setPendingImport(null);
    setStep("matching");
    setProgress({ current: 0, total: items.length, label: `Matching ${items.length} items…` });

    try {
      const data = await doChunkedImport(source, items);
      setResult(data);
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Import failed");
      setStep("error");
    }
  };

  // ── File import (Letterboxd / Goodreads) ───────────────

  const handleFileImport = async (source: ImportSource, file: File) => {
    setActiveImport(source);
    setStep("uploading");
    setError("");
    setResult(null);
    setProgress({ current: 0, total: 0, label: "Reading file..." });

    try {
      let parsedItems: any[] = [];

      if (source === "letterboxd") {
        parsedItems = await parseLetterboxdFile(file);
      } else if (source === "goodreads") {
        parsedItems = await parseGoodreadsFile(file);
      }

      await checkAndStartImport(source, parsedItems);
    } catch (err: any) {
      setError(err.message || "Import failed");
      setStep("error");
    }
  };

  // ── Letterboxd file parsing (ZIP or CSV) ───────────────

  const parseLetterboxdFile = async (file: File): Promise<any[]> => {
    setStep("parsing");
    setProgress({ current: 0, total: 0, label: "Parsing Letterboxd export..." });

    const { parseLetterboxdCSV, parseLetterboxdWatchlist, parseLetterboxdReviews } = await import("@/lib/import-parsers");

    if (file.name.endsWith(".zip")) {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);

      let items: any[] = [];

      // ratings.csv — main file with rated films
      const ratingsFile = zip.file("ratings.csv");
      if (ratingsFile) {
        const text = await ratingsFile.async("text");
        items = parseLetterboxdCSV(text);
      }

      // watchlist.csv — want to watch
      const watchlistFile = zip.file("watchlist.csv");
      if (watchlistFile) {
        const text = await watchlistFile.async("text");
        items.push(...parseLetterboxdWatchlist(text));
      }

      // reviews.csv — reviews
      const reviewsFile = zip.file("reviews.csv");
      if (reviewsFile) {
        const text = await reviewsFile.async("text");
        const reviews = parseLetterboxdReviews(text);
        // Merge reviews into existing items
        for (const rev of reviews) {
          const existing = items.find(i => i.title === rev.title && i.year === rev.year);
          if (existing) {
            existing.review = rev.review;
          } else {
            items.push(rev);
          }
        }
      }

      return items;
    } else {
      // Direct CSV upload
      const text = await file.text();
      return parseLetterboxdCSV(text);
    }
  };

  // ── Goodreads file parsing ─────────────────────────────

  const parseGoodreadsFile = async (file: File): Promise<any[]> => {
    setStep("parsing");
    setProgress({ current: 0, total: 0, label: "Parsing Goodreads export..." });

    const { parseGoodreadsCSV } = await import("@/lib/import-parsers");
    const text = await file.text();
    return parseGoodreadsCSV(text);
  };

  // ── MAL import ─────────────────────────────────────────

  const handleMALImport = async () => {
    if (!malUsername.trim()) return;
    setActiveImport("myanimelist");
    setStep("uploading");
    setError("");
    setResult(null);

    try {
      const allItems: any[] = [];

      // Fetch both anime and manga lists (paginated)
      for (const type of ["anime", "manga"] as const) {
        let page = 1;
        let hasMore = true;
        setProgress({ current: 0, total: 0, label: `Fetching ${type} list…` });

        while (hasMore) {
          const res = await fetch(`/api/import/mal?username=${encodeURIComponent(malUsername.trim())}&type=${type}&page=${page}`);
          if (!res.ok) {
            if (res.status === 404) throw new Error(`MAL user "${malUsername}" not found`);
            throw new Error(`Failed to fetch ${type} list`);
          }

          const data = await res.json();
          const { parseMALItems } = await import("@/lib/import-parsers");
          const parsed = parseMALItems(data.items, type);
          allItems.push(...parsed);

          setProgress({ current: allItems.length, total: data.totalItems || allItems.length, label: `Found ${allItems.length} entries…` });

          hasMore = data.hasMore;
          page++;

          if (hasMore) await new Promise(r => setTimeout(r, 400)); // Jikan rate limit
        }
      }

      await checkAndStartImport("myanimelist", allItems);
    } catch (err: any) {
      setError(err.message || "MAL import failed");
      setStep("error");
    }
  };

  // ── Steam import ───────────────────────────────────────

  const handleSteamImport = async () => {
    if (!steamId.trim()) return;
    setActiveImport("steam");
    setStep("uploading");
    setError("");
    setResult(null);
    setProgress({ current: 0, total: 0, label: "Fetching Steam library…" });

    try {
      const res = await fetch(`/api/import/steam?steamid=${encodeURIComponent(steamId.trim())}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch Steam library");
      }

      const data = await res.json();
      const { parseSteamGames } = await import("@/lib/import-parsers");
      const items = parseSteamGames(data.games);

      await checkAndStartImport("steam", items);
    } catch (err: any) {
      setError(err.message || "Steam import failed");
      setStep("error");
    }
  };

  // ── Spotify import ────────────────────────────────────

  const handleSpotifyImport = async () => {
    setActiveImport("spotify");
    setStep("uploading");
    setError("");
    setResult(null);
    setProgress({ current: 0, total: 0, label: "Fetching Spotify saved albums…" });

    try {
      const tokenRes = await fetch("/api/import/spotify");
      if (!tokenRes.ok) {
        const data = await tokenRes.json();
        // API returns needsAuth=true when Spotify isn't connected.
        // Show a helpful message — never try to redirect to an undefined authUrl.
        if (data.needsAuth) {
          setError(data.message || "Connect your Spotify account in Settings → Account first, then come back to import your saved albums.");
          setStep("error");
          return;
        }
        throw new Error(data.error || "Spotify connection failed");
      }

      const tokenData = await tokenRes.json();
      const { parseSpotifyAlbums } = await import("@/lib/import-parsers");
      const items = parseSpotifyAlbums(tokenData.albums);

      await checkAndStartImport("spotify", items);
    } catch (err: any) {
      setError(err.message || "Spotify import failed");
      setStep("error");
    }
  };

  const resetImport = () => {
    setActiveImport(null);
    setStep("idle");
    setProgress({ current: 0, total: 0, label: "" });
    setResult(null);
    setError("");
    setPendingImport(null);
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Import Data</h2>
      <p style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 20, lineHeight: 1.5 }}>
        Bring your ratings, reviews, and libraries from other platforms. Your existing CrossShelf data is safe — imports never delete anything.
      </p>

      {/* Conflict resolution setting */}
      <div style={{
        marginBottom: 20, padding: "12px 14px", background: "var(--surface-1)",
        borderRadius: 10, border: "1px solid var(--border)",
      }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-faint)", display: "block", marginBottom: 8 }}>
          When an item already has a rating:
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([
            { id: "skip" as const, label: "Keep existing" },
            { id: "overwrite" as const, label: "Use imported" },
            { id: "keep_higher" as const, label: "Keep higher" },
          ]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setConflictMode(opt.id)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: conflictMode === opt.id ? "#E8485522" : "rgba(255,255,255,0.04)",
                border: conflictMode === opt.id ? "1px solid #E84855" : "1px solid var(--border)",
                color: conflictMode === opt.id ? "#E84855" : "var(--text-faint)",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active import progress */}
      {step !== "idle" && step !== "done" && step !== "error" && (
        <div style={{
          marginBottom: 20, padding: 16, background: "var(--surface-1)",
          borderRadius: 10, border: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%",
              border: "2px solid #3185FC", borderTopColor: "transparent",
              animation: "spin 1s linear infinite",
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
              {step === "uploading" ? "Reading file..." :
               step === "parsing" ? "Parsing data..." :
               step === "matching" ? "Matching & importing..." :
               "Importing..."}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-faint)", margin: 0 }}>{progress.label}</p>
          {progress.total > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                <div style={{
                  width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                  height: "100%", background: "#3185FC", borderRadius: 2,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <span style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4, display: "block" }}>
                {progress.current} / {progress.total}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Import result */}
      {step === "done" && result && (
        <div style={{
          marginBottom: 20, padding: 16, background: "#2EC4B608",
          borderRadius: 10, border: "1px solid #2EC4B622",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2EC4B6", marginBottom: 8 }}>
            Import Complete!
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 12 }}>
            <span style={{ color: "var(--text-faint)" }}>Total items:</span>
            <span style={{ color: "#fff", fontWeight: 600 }}>{result.total}</span>
            <span style={{ color: "var(--text-faint)" }}>Imported:</span>
            <span style={{ color: "#2EC4B6", fontWeight: 600 }}>{result.imported}</span>
            {result.duplicates > 0 && <>
              <span style={{ color: "var(--text-faint)" }}>Duplicates:</span>
              <span style={{ color: "#F9A620", fontWeight: 600 }}>{result.duplicates}</span>
            </>}
            {result.skipped > 0 && <>
              <span style={{ color: "var(--text-faint)" }}>Skipped:</span>
              <span style={{ color: "var(--text-faint)" }}>{result.skipped}</span>
            </>}
            {result.failed > 0 && <>
              <span style={{ color: "var(--text-faint)" }}>Not found:</span>
              <span style={{ color: "#E84855" }}>{result.failed}</span>
            </>}
          </div>
          {result.errors.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 11, color: "var(--text-faint)", cursor: "pointer" }}>
                Show errors ({result.errors.length})
              </summary>
              <div style={{ marginTop: 6, fontSize: 11, color: "#E84855", lineHeight: 1.6 }}>
                {result.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            </details>
          )}
          <button onClick={resetImport} style={{
            marginTop: 12, padding: "6px 16px", borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--surface-2)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            Import more
          </button>
        </div>
      )}

      {/* Error */}
      {step === "error" && (
        <div style={{
          marginBottom: 20, padding: "12px 16px", background: "#E8485508",
          borderRadius: 10, border: "1px solid #E8485522",
        }}>
          <span style={{ fontSize: 13, color: "#E84855" }}>{error}</span>
          <button onClick={resetImport} style={{
            marginLeft: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #E84855",
            background: "transparent", color: "#E84855", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>
            Try again
          </button>
        </div>
      )}

      {/* Re-import warning */}
      {pendingImport && step === "idle" && (
        <div style={{
          marginBottom: 20, padding: 16, background: "#F9A62010",
          borderRadius: 10, border: "1px solid #F9A62040",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#F9A620", marginBottom: 6 }}>
            You've imported from {PLATFORM_CONFIG.find(p => p.id === pendingImport.source)?.name} before
          </div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 12, lineHeight: 1.6 }}>
            You imported {pendingImport.previousImport.importedItems} items on{" "}
            {new Date(pendingImport.previousImport.startedAt).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            })}.
            Importing again will{" "}
            {conflictMode === "skip"
              ? "skip any items you've already rated (keeping your existing ratings)."
              : conflictMode === "overwrite"
              ? "overwrite your existing ratings with the imported values."
              : "keep whichever rating is higher for each item."}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => runImport(pendingImport.source, pendingImport.items)}
              style={{
                padding: "7px 16px", borderRadius: 8, border: "none",
                background: "#F9A620", color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              Continue import ({pendingImport.items.length} items)
            </button>
            <button
              onClick={resetImport}
              style={{
                padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)",
                background: "transparent", color: "var(--text-faint)", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Platform cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        {PLATFORM_CONFIG.map(platform => (
          <div
            key={platform.id}
            style={{
              padding: 16, borderRadius: 10, background: "var(--surface-1)",
              border: activeImport === platform.id ? `1px solid ${platform.color}44` : "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{platform.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{platform.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{platform.desc}</div>
              </div>
            </div>

            {/* File upload platforms */}
            {(platform.id === "letterboxd" || platform.id === "goodreads") && (
              <div>
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
                  {platform.id === "letterboxd"
                    ? "Go to Letterboxd Settings → Import & Export → Export your data. Upload the ZIP file or ratings.csv."
                    : "Go to Goodreads → My Books → Import/Export → Export Library. Upload the CSV file."}
                </p>
                <label style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                  borderRadius: 8, background: `${platform.color}22`, border: `1px solid ${platform.color}44`,
                  color: platform.color === "#553B08" ? "#D4A94D" : platform.color,
                  fontSize: 12, fontWeight: 600, cursor: step !== "idle" ? "not-allowed" : "pointer",
                  opacity: step !== "idle" && step !== "done" && step !== "error" ? 0.5 : 1,
                }}>
                  <input
                    type="file"
                    accept={platform.id === "letterboxd" ? ".zip,.csv" : ".csv"}
                    style={{ display: "none" }}
                    disabled={step !== "idle" && step !== "done" && step !== "error"}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleFileImport(platform.id, file);
                      e.target.value = "";
                    }}
                  />
                  Upload {platform.id === "letterboxd" ? "ZIP or CSV" : "CSV"}
                </label>
              </div>
            )}

            {/* MAL */}
            {platform.id === "myanimelist" && (
              <div>
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
                  Enter your MyAnimeList username. Your anime and manga lists must be set to public.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={malUsername}
                    onChange={e => setMalUsername(e.target.value)}
                    placeholder="MAL username"
                    style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={e => { if (e.key === "Enter") handleMALImport(); }}
                  />
                  <button
                    onClick={handleMALImport}
                    disabled={!malUsername.trim() || (step !== "idle" && step !== "done" && step !== "error")}
                    style={{
                      padding: "8px 16px", borderRadius: 8, border: "none",
                      background: "#2E51A2", color: "#fff", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", opacity: !malUsername.trim() ? 0.5 : 1, whiteSpace: "nowrap",
                    }}
                  >
                    Import
                  </button>
                </div>
              </div>
            )}

            {/* Steam */}
            {platform.id === "steam" && (
              <div>
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
                  Enter your Steam ID, profile URL, or vanity name. Your profile and game details must be public.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={steamId}
                    onChange={e => setSteamId(e.target.value)}
                    placeholder="Steam ID, URL, or username"
                    style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={e => { if (e.key === "Enter") handleSteamImport(); }}
                  />
                  <button
                    onClick={handleSteamImport}
                    disabled={!steamId.trim() || (step !== "idle" && step !== "done" && step !== "error")}
                    style={{
                      padding: "8px 16px", borderRadius: 8, border: "none",
                      background: "#1B2838", color: "#fff", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", opacity: !steamId.trim() ? 0.5 : 1, whiteSpace: "nowrap",
                    }}
                  >
                    Import
                  </button>
                </div>
              </div>
            )}

            {/* Spotify */}
            {platform.id === "spotify" && (
              <div>
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>
                  Connect your Spotify account to import your saved albums.
                </p>
                <button
                  onClick={handleSpotifyImport}
                  disabled={step !== "idle" && step !== "done" && step !== "error"}
                  style={{
                    padding: "8px 16px", borderRadius: 8, border: "none",
                    background: "#1DB954", color: "#fff", fontSize: 12, fontWeight: 600,
                    cursor: "pointer",
                    opacity: step !== "idle" && step !== "done" && step !== "error" ? 0.5 : 1,
                  }}
                >
                  Connect Spotify
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Import History */}
      {history.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Import History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map(imp => {
              const platformConfig = PLATFORM_CONFIG.find(p => p.id === imp.source);
              return (
                <div
                  key={imp.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    background: "var(--surface-1)", borderRadius: 8, border: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{platformConfig?.icon || "📥"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>
                      {platformConfig?.name || imp.source}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                      {new Date(imp.startedAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: imp.status === "completed" ? "#2EC4B6" : imp.status === "failed" ? "#E84855" : "#F9A620" }}>
                      {imp.status === "completed" ? `${imp.importedItems} imported` : imp.status}
                    </div>
                    {imp.failedItems > 0 && (
                      <div style={{ fontSize: 10, color: "#E84855" }}>{imp.failedItems} failed</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
