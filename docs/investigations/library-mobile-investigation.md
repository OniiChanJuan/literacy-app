# Phase 4a — Library mobile investigation (read-only findings)

Date: 2026-06-13. Scope: map the Library mockup (`design/mobile/crossshelf-mobile-library.html`)
to existing code, define the filter/search/sort state model, and report exactly which
timestamps exist to back a sort cycle. **No code written. Stop for approval before Phase 4b.**

Route: `src/app/library/page.tsx` (client component). Data via `useLibrary()`
(`src/lib/library-context.tsx`) + `useRatings()` (`src/lib/ratings-context.tsx`).

---

## 1. Mockup section → existing code

| Mockup element | Exists today? | Where / notes |
|---|---|---|
| Page title "Library" + **Import** button | ✅ | Header row in `page.tsx` (Import → `/settings?tab=import`). Mockup puts Import top-right as a small pill — restyle only. |
| **Status pills w/ counts** (All / Done / Going / Want / Drop) | ⚠️ partial | `STATUSES.map` renders 4 colored count pills — **display-only, no "All" pill, not tappable**. Need: add "All", make tappable filters. |
| Status pill colors | ⚠️ close | Current: completed `#2EC4B6`, in_progress `#3185FC`, want_to `#9B5DE5`, dropped `#E84855`. Mockup: Done teal, Going **blue `#93b3c4`**, Want **purple `#c9a3d4`**, Drop **red `#d44848`**. Minor hex differences; keep the desktop `STATUSES` colors as the source of truth (type-color language) unless you want the exact mockup tints on mobile. |
| **Type filter pills** (movie/tv/book/game/manga…) | ✅ | `globalFilter` state + `TYPE_ORDER` pills, already applies across all sections. Mockup shows them as icon-only round pills. |
| **Search pill** (library-only) | ❌ new | Not present. Client-side title filter over loaded entries. |
| **Sort button** (cycles) | ❌ new | Not present. See §3 for what the data can back. |
| **Following section** (franchises, horizontal scroll) | ✅ | `FollowingSection` + `FranchiseCard` already fetch `/api/user/following`. Currently `flex-wrap`; mockup wants horizontal scroll at top. Own-library only (correct; flagged for Profile phase). |
| **Per-status sections** (Completed/In Progress/Want To/Dropped) | ✅ | `STATUSES.map` renders each section with header + count + grid. |
| **Item cards** (badge, gold rating, score+bar+pct, genres, stars) | ✅ | `Card` (`src/components/card.tsx`) already renders ALL of this — see §4. No custom markup needed. |
| **In-Progress progress** ("Ep 8 / 15") | ⚠️ partial | Current page draws a thin progress **bar overlay** on in_progress cards. Mockup shows progress as **text meta** ("Ep 8 / 15 · Max", "p. 145 / 545 · author"). Text version is richer; bar is what exists. Decision in §5. |
| **Show N more** (4 default, progressive) | ❌ new | Current renders ALL cards. Mobile-only cap at 4 + "Show 4 more · N remaining". |
| Empty state ("Nothing tracked yet") | ✅ | Already implemented, keep as-is. |
| Bottom tab nav | ✅ | Global `BottomNav` (Phase 0) already owns this. |

**Takeaway:** the page already has the data and most of the structure. Phase 4b is
mostly *presentation + three new interactions* (status-pill filter, search, sort) +
one mobile-only layout adaptation (show-more). No new endpoints.

---

## 2. Filter / search / sort state model (proposed)

All client-side, layered on the data already loaded by the two contexts:

```
statusFilter: LibraryStatus | "all"      // NEW — driven by tappable status pills; default "all"
typeFilter:   MediaType | "all"          // EXISTS today as globalFilter
query:        string                     // NEW — search pill; client-side title.includes (case-insensitive)
sort:         SortKey                    // NEW — see §3 for the allowed set
expanded:     Record<LibraryStatus, number>  // NEW, mobile-only — how many cards shown per section (default 4)
```

Apply order per section: `entries → resolve item → filter by status section →
typeFilter → query → sort → (mobile) slice to expanded[status]`.

Desktop vs mobile (per your answers):
- **Search + Sort:** both desktop and mobile (real feature, not layout).
- **Status-pill tap-to-filter:** trivial on both (it's just `statusFilter` state gating
  which sections render — desktop already renders all sections, so the pill just becomes a
  scroll-free filter). **Recommend both**; negligible desktop complexity.
- **Show-more (4 cap):** mobile-only via CSS breakpoint / `useIsMobile`; desktop renders all.

---

## 3. Sort — what the data can actually back (the key finding)

**Timestamps available, end to end:**

| Field | Where | Returned to client? | Usable for sort? |
|---|---|---|---|
| `Rating.createdAt` | `ratings` table (Prisma) | ❌ `/api/ratings` returns only `{ ratings: {id:score}, recTags }` — **no dates** | No (not surfaced) |
| `LibraryEntry.startedAt?` | `library_entries` table | ❌ `/api/library` GET selects only `status, progressCurrent` | No |
| `LibraryEntry.completedAt?` | `library_entries` table | ❌ not returned | No |
| **`LibraryEntry.createdAt`** | — | — | **Does not exist.** The model has no `createdAt`/`updatedAt` at all (cols: userId, itemId, status, progressCurrent, progressTotal, startedAt?, completedAt?). |
| `item.title` | loaded | ✅ | **Yes** |
| user score `ratings[id]` | loaded | ✅ (number) | **Yes** |
| `item.year` | loaded | ✅ | Yes (weak proxy, release year ≠ activity) |

**Conclusion:** the sort cycle the data **cleanly backs today** is exactly two:
- **Rating** — your star score, high → low (unrated items sink to bottom).
- **A–Z** — by title.

**"Recent" (your requested default) is NOT backed today.** There is no per-entry
add/update timestamp reaching the client. `startedAt`/`completedAt` are nullable, absent
for Want-To items, and not even returned by the API. The page's current de-facto order is
`Object.entries(entries)` → ascending `itemId` (catalog insertion order), which is *not*
user activity.

Honest-labeling says: don't ship a "Recent" option we can't order correctly. So this is a
real fork for you to lock (§5, Decision 1).

---

## 4. Card approach — tokenize, no custom markup

`Card` already renders the mockup's `lib-card` almost 1:1:
- type badge top-left ✅ · user gold rating badge top-right (★ N) ✅ · title ✅
- **score row: number + teal bar + %** ✅ (matches `.lib-info-score-row` exactly)
- genre meta ✅ · inline `Stars` at bottom ✅ (mockup's gold ★★★★★; ours is interactive)

So — per "Card is the blast radius" — we get the 2-col poster layout by scoping
`--card-w` / `--card-cover-h` on a `.library-root` parent (mobile only), **not** by
editing `Card` and **not** by writing custom card markup (unlike Picked-for-you /
Cross-shelf, which used bespoke markup). At 380px with 14px page padding + 10px gap →
card ≈ 171px wide; cover-h ≈ 171 × 1.5 ≈ 256px for the 2/3 poster. Desktop keeps 150/210.

The In-Progress overlay bar already exists; the mockup's richer "Ep 8/15 · Max" text is
the only card-content delta (Decision 2).

---

## 5. Decisions to lock before Phase 4b

**Decision 1 — Sort cycle + default (blocking).** Pick one:

- **Path A (recommended): add a real timestamp now.** Small migration: add
  `createdAt DateTime @default(now())` (and optional `updatedAt @updatedAt`) to
  `LibraryEntry`; return it from `/api/library` GET; carry it in `library-context`.
  Then the cycle is **Recent / Rating / A–Z** with **default Recent** as you wanted.
  *Caveat to accept:* existing rows backfill to a single `now()` value on migration, so
  the pre-existing backlog sorts as one undifferentiated "added now" block until new
  activity accrues (could partially seed from `completedAt`/`startedAt` where non-null).
  This is a forward DB change — wants your explicit sign-off.
- **Path B: ship what's backed today, no migration.** Cycle is **Rating / A–Z** only,
  **default Rating**. Add "Recent" later in a dedicated follow-up once the timestamp lands.
  Zero schema risk now; default isn't your preferred "Recent."

**Decision 2 — In-Progress card progress.** Keep the existing thin **bar overlay**
(simplest, already works), or upgrade to the mockup's **text meta** ("Ep 8/15 · platform")?
Text needs `progressTotal` (exists in DB but, like the timestamps, is **not returned** by
`/api/library` GET — would need to add `progressCurrent`/`progressTotal` to the select).
Recommend: keep the bar for Phase 4b, file the text upgrade as a follow-up (avoids
widening the API in the same pass) — unless you want it now.

**Decision 3 — Status-pill colors.** Use the existing desktop `STATUSES` hexes
(teal/blue/purple/red, type-color language) on mobile too, or the mockup's softer tints
(`#93b3c4`/`#c9a3d4`/`#d44848`)? Recommend the desktop hexes for consistency.

---

## 6. Proposed Phase 4b commit plan (after approval)

Isolated commits, verify rich+sparse+desktop at 380/1280 before push:

1. `(migration)` add `LibraryEntry.createdAt` + return it from API + context — **only if Path A**.
2. Status pills → add "All", make tappable `statusFilter` (desktop + mobile).
3. Tools row: search pill (client title filter) + sort button (cycle from Decision 1), styled as 4px teal "tools" distinct from round type pills.
4. Show-N-more progressive disclosure per section (mobile-only, 4 default).
5. Mobile card sizing: scope `--card-w`/`--card-cover-h` on `.library-root`; 2-col grid.
6. Following row → horizontal scroll on mobile; move above status sections.

DO NOT: edit `Card`, add Tailwind utilities, change desktop layout beyond the shared
search/sort/status-filter features, or render placeholder zeros.
