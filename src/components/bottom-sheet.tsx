"use client";

/**
 * BottomSheet — shared mobile sheet primitive (Phase 1 of the mobile work).
 *
 * Generic controlled overlay that slides up from the bottom edge: backdrop
 * tap, Escape, the ✕ button, or dragging the handle past the threshold all
 * close it. Intended consumers (Phase 2): Explore and Library filter panels.
 * No consumer is wired yet.
 *
 *   <BottomSheet open={open} onClose={() => setOpen(false)} title="Filters">
 *     ...content...
 *   </BottomSheet>
 *
 * Implementation notes:
 * - z-index 220: above the bottom tab nav (150) and the nav slide-out (200).
 * - Height caps at 85dvh (dynamic viewport units — iOS Safari's toolbar
 *   makes 100vh unreliable); content area scrolls.
 * - Drag-to-close uses pointer events on the handle strip only, so the
 *   scrollable content never fights the gesture. Release past 80px closes;
 *   otherwise the sheet springs back.
 * - Body scroll is locked while open; safe-area bottom padding applied.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const CLOSE_DRAG_PX = 80;

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  // Escape closes; body scroll locks while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Reset drag offset whenever the sheet (re)opens.
  useEffect(() => { if (open) setDragY(0); }, [open]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current)); // downward only
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    setDragY((y) => {
      if (y > CLOSE_DRAG_PX) onClose();
      return 0; // spring back (or reset for next open)
    });
  }, [onClose]);

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes sheet-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 219,
          background: "rgba(0,0,0,0.55)",
          animation: "sheet-fade 160ms ease-out",
        }}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || "Sheet"}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 220,
          maxHeight: "85dvh",
          display: "flex", flexDirection: "column",
          background: "var(--bg-elevated)",
          borderTop: "1px solid var(--border-hover)",
          borderRadius: "16px 16px 0 0",
          paddingBottom: "var(--safe-bottom)",
          transform: `translateY(${dragY}px)`,
          transition: dragStart.current === null ? "transform 160ms ease-out" : "none",
          animation: "sheet-up 200ms ease-out",
          touchAction: "none",
        }}
      >
        {/* Drag handle strip — the only drag surface */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ padding: "10px 0 6px", cursor: "grab", flexShrink: 0 }}
        >
          <div style={{
            width: 36, height: 4, borderRadius: 2, margin: "0 auto",
            background: "var(--surface-5)",
          }} />
        </div>

        {/* Header row */}
        {(title !== undefined) && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "2px 16px 10px", flexShrink: 0,
            borderBottom: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", fontSize: 18, padding: 4,
                minHeight: "var(--touch-target)", display: "flex", alignItems: "center",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ overflowY: "auto", padding: 16, touchAction: "pan-y" }}>
          {children}
        </div>
      </div>
    </>
  );
}
