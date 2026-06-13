"use client";

/**
 * useIsMobile — the canonical client breakpoint gate for the app.
 *
 * Returns true at the mobile breakpoint (<=640px, matching the CSS system
 * documented in globals.css). Use this ONLY when a component must *mount*
 * differently per breakpoint — e.g. to avoid double-mounting a data-fetching
 * island on both the desktop and mobile layouts. For pure presentational
 * differences, prefer CSS media queries (no JS, no hydration cost).
 *
 * SSR-safe by construction: built on useSyncExternalStore, so the server
 * snapshot is a deterministic `false` (desktop default) and React reconciles
 * to the real matchMedia value on hydration without a mismatch warning. The
 * subscription listens to matchMedia "change", so resize/rotation updates it.
 *
 * Single source of truth — future mobile work imports this rather than
 * re-implementing matchMedia logic.
 */
import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 640px)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false; // desktop default during SSR; reconciled on hydration
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
