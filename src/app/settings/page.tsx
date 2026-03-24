"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Section = "profile" | "account" | "privacy" | "notifications" | "appearance";

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "account", label: "Account", icon: "🔐" },
  { id: "privacy", label: "Privacy", icon: "🔒" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "appearance", label: "Appearance", icon: "🎨" },
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
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change-password", currentPassword: currentPw, newPassword: newPw }),
    });
    if (res.ok) { setMessage("Password updated!"); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }
    else { const d = await res.json(); setError(d.error || "Failed"); }
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
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px" }}>
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
        <div style={{ flex: 1 }}>
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
        </div>
      </div>
    </div>
  );
}
