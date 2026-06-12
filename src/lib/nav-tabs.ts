/**
 * nav-tabs.ts — the single source of truth for primary navigation.
 *
 * Shared by the desktop top-tab bar (components/nav.tsx) and the mobile
 * bottom tab bar (components/bottom-nav.tsx). The refresh dispatchers fire
 * when the user taps the tab for the page they're already on — For You and
 * Explore listen for these events to re-roll their content (and the future
 * For You snapshot work will repurpose the same event for its refresh flow).
 */

export const NAV_TABS = [
  { id: "foryou",  label: "For You",  icon: "✦", href: "/" },
  { id: "explore", label: "Explore",  icon: "◎", href: "/explore" },
  { id: "library", label: "Library",  icon: "▤", href: "/library" },
  { id: "people",  label: "People",   icon: "◉", href: "/people" },
] as const;

export function dispatchForYouRefresh() {
  window.dispatchEvent(new CustomEvent("literacy:refresh-foryou"));
}

export function dispatchExploreRefresh() {
  window.dispatchEvent(new CustomEvent("literacy:refresh-explore"));
}

/** Shared active-tab tap behavior: refresh instead of navigating. */
export function handleActiveTabTap(e: { preventDefault(): void }, href: string, active: boolean) {
  if (!active) return;
  if (href === "/") { e.preventDefault(); dispatchForYouRefresh(); }
  if (href === "/explore") { e.preventDefault(); dispatchExploreRefresh(); }
}
