"use client";

/**
 * MobileItemActionBar — the item detail page's fixed bottom action bar
 * (rating stars + the 4 library-status buttons), per the mockup.
 *
 * Mobile-only (useIsMobile → null on desktop). Smart-hide via
 * useScrollDirection: hides on scroll-down, reappears on scroll-up / at top
 * (the Phase 1 accumulator threshold prevents momentum-bounce strobing). Only
 * THIS bar hides — the global BottomNav stays put (it's navigation
 * infrastructure, not page-contextual).
 *
 * Stacking: sits directly above the BottomNav at
 * bottom: var(--bottom-nav-h) + var(--safe-bottom), z-155 (just above the
 * BottomNav's 150 so its top border isn't clipped; both far below the
 * BottomSheet at 220). Reuses the same rate()/setStatus() calls the desktop
 * ItemSubBanner uses — no new data flow.
 */
import { TYPES, type Item } from "@/lib/data";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useScrollDirection } from "@/lib/use-scroll-direction";
import { useRatings } from "@/lib/ratings-context";
import { useLibrary, type LibraryStatus } from "@/lib/library-context";
import Stars from "./stars";

const STATUS_BUTTONS: { key: LibraryStatus; label: string; icon: string }[] = [
  { key: "want_to", label: "Want to", icon: "🔖" },
  { key: "in_progress", label: "In progress", icon: "▶" },
  { key: "completed", label: "Completed", icon: "✓" },
  { key: "dropped", label: "Dropped", icon: "✕" },
];

export default function MobileItemActionBar({ item }: { item: Item }) {
  const isMobile = useIsMobile();
  const { direction, atTop } = useScrollDirection();
  const { ratings, rate } = useRatings();
  const { entries, setStatus } = useLibrary();
  if (!isMobile || typeof item.id !== "number") return null;

  const t = TYPES[item.type] || { color: "#2EC4B6" };
  const userRating = ratings[item.id] || 0;
  const currentStatus = entries[item.id]?.status ?? null;
  const hidden = direction === "down" && !atTop;

  return (
    <>
      <nav
        className="mid-action-bar"
        aria-label="Rate and track"
        style={{ transform: hidden ? "translateY(130%)" : "translateY(0)", opacity: hidden ? 0 : 1 }}
      >
        <div className="mid-action-stars">
          <Stars rating={userRating} onRate={(s) => rate(item.id, s)} size={24} />
        </div>
        <div className="mid-action-buttons">
          {STATUS_BUTTONS.map((b) => {
            const active = currentStatus === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setStatus(item.id, active ? null : b.key)}
                className={`mid-action-btn${active ? " mid-action-btn-active" : ""}`}
              >
                <span className="mid-action-btn-icon">{b.icon}</span>
                {b.label}
              </button>
            );
          })}
        </div>
      </nav>

      <style>{`
        .mid-action-bar { display: none; }
        @media (max-width: 640px) {
          .mid-action-bar {
            display: block;
            position: fixed; left: 0; right: 0;
            bottom: calc(var(--bottom-nav-h) + var(--safe-bottom));
            z-index: 155;
            padding: 12px 14px;
            background: rgba(10,10,15,0.97);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-top: 1px solid rgba(255,255,255,0.08);
            transition: transform 220ms ease, opacity 220ms ease;
          }
          .mid-action-stars { display: flex; justify-content: center; margin-bottom: 10px; }
          .mid-action-buttons { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; }
          .mid-action-btn {
            padding: 8px 4px; border-radius: 6px; cursor: pointer;
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
            color: rgba(232,230,225,0.75); font-size: 10px; text-align: center;
            display: flex; flex-direction: column; align-items: center; gap: 2px;
          }
          .mid-action-btn-active {
            background: rgba(46,196,182,0.12); border-color: rgba(46,196,182,0.4); color: #2EC4B6;
          }
          .mid-action-btn-icon { font-size: 14px; line-height: 1; }
        }
      `}</style>
    </>
  );
}
