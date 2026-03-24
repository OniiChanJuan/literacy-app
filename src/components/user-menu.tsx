"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!session?.user) return null;

  const user = session.user;
  const avatarUrl = user.image;
  const initial = (user.name || user.email || "U")[0].toUpperCase();

  const menuItems = [
    { icon: "👤", label: "My Profile", href: `/user/${user.id}` },
    { icon: "📚", label: "My Library", href: "/library" },
    { icon: "⭐", label: "My Reviews", href: `/user/${user.id}?tab=reviews` },
    { icon: "⚙️", label: "Settings", href: "/settings" },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 32, height: 32, borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.1)",
          background: avatarUrl ? "transparent" : "linear-gradient(135deg, #E84855, #3185FC)",
          cursor: "pointer", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{initial}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          minWidth: 220,
          background: "#141419",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          zIndex: 1000,
          overflow: "hidden",
        }}>
          {/* User identity */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
              background: avatarUrl ? "#1a1a2e" : "linear-gradient(135deg, #E84855, #3185FC)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" width={40} height={40} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>{initial}</span>
              )}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{
                fontSize: 14, fontWeight: 500, color: "#fff",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {user.name || "User"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                @{(user as any).username || user.email?.split("@")[0] || "user"}
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: "6px 0" }}>
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 16px", textDecoration: "none",
                  color: "rgba(255,255,255,0.7)", fontSize: 13,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>

          {/* Divider + Logout */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "6px 0" }}>
            <button
              onClick={() => {
                setOpen(false);
                signOut({ callbackUrl: "/" });
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", width: "100%",
                background: "none", border: "none",
                color: "rgba(255,255,255,0.5)", fontSize: 13,
                cursor: "pointer", textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>🚪</span>
              Log Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
