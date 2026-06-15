# Mobile redesign — consolidated signed-in verification checklist

One place to run every outstanding **signed-in production check** and see every
**deferred follow-up** across all shipped mobile phases (2b For You, 3b Item Detail,
4b Library, 5b People, 6b Public Profile, 7b Explore). Last updated: 2026-06-13 (after
Phase 7b — the mobile redesign's last page).

**Why this exists:** most mobile work was verified logged-out (layout, empty states,
desktop-unchanged) but the *authenticated / populated* surfaces can't be exercised in
the logged-out dev preview. Walk these on **https://crossshelf.app** signed in.
Mobile = phone or DevTools at **380px**; desktop = **1280px**. Report anything off with
the **§/item number** and **viewport**.

---

## How to read this
- **§1 Signed-in checks** — per page, things to eyeball while logged in. Each has *what
  to check · viewport · expected*.
- **§2 Tracked follow-up chips** — spawned background tasks (one-click to start in a
  worktree). Listed with chip ID + scope.
- **§3 Documented follow-ups (no chip)** — known deferrals captured in handoffs/investigations.
- **§4 Pre-launch infra items** — not mobile-UI, but open.

---

## §1 — Signed-in verification checks

### For You (`/`) — Phase 2b
Mostly viewable logged-out (it's the landing page), but the personalized rows need a
signed-in account with ratings + follows.
1. **Identity / taste strip** · 380 · renders your gradient avatar + taste summary, not a placeholder.
2. **Cross your shelf** · 380 · shows the correct one of its three framings (personalized vs popular vs empty-state CTA) for your data; source-row layout intact.
3. **Picked for you** · 380 · compact rows + status pill + "show more"; personalized framing when you have ratings, popular framing when sparse.
4. **What's happening** · 380 · single-line activity rows from people you follow (needs follows); avatar = your gradient, not the item cover.
5. **Curated rows** (Critically Acclaimed / Hidden Gems) · 380 · load without the transient "Failed to load" (known to appear only after a dev hot-reload; hard-refresh clears — confirm it does NOT happen on a clean prod load).
6. Desktop unchanged · 1280 · two-column For You intact.

### Item Detail (`/[type]/[slug]`, `/item/[id]`) — Phase 3b
Public pages, but the authed/high-data UI needs a signed-in account and a well-rated item.
1. **Your activity card vs Rate prompt** · 380 · signed-in with a rating on the item → "your activity" card; without → rate prompt. (Can't see logged-out.)
2. **Rating distribution** · 380 · only renders at **≥10 ratings** on the item (find a popular title); hidden below threshold (no empty bars).
3. **Community pill** (≥10 ratings) and **Recommend % pill** (≥5 recommend tags) · 380 · appear only above threshold; teal treatment only when ≥10 ratings AND an external score exists.
4. **Smart-hide action bar** · 380 · hides on scroll-down, reappears on scroll-up; rate/track actions work.
5. **Franchise / series strip** · 380 · shows for items in the static set (e.g. a LOTR film that's in `franchises.ts`). **Known gap:** does NOT show for DB-only franchise items (e.g. *LOTR: The Return of the King*) — see §2 / §3.
6. Sparse item · 380 · sparse-state spec (no distribution, no where-to, etc.) — hide-don't-placeholder.
7. Desktop unchanged · 1280.

### Library (`/library`) — Phase 4b
**Fully auth-gated** (redirects to sign-in logged-out) — *none* of this was verifiable
logged-out. You already did a pass and confirmed status pills / Following / 2-col grid /
sections / sort; the items below are the remainder + the overflow fix.
1. **Horizontal-overflow fix** · 380 · page width == viewport, no empty gutter on the right, on a library that includes books with odd-aspect covers (the Dorian Gray / Google-Books "no-cover" strips). **This is the fix from the last Library session — confirm it's resolved on prod.**
2. **Tappable status pills** + "All" · 380 · tap filters to that status section; tap again / "All" resets.
3. **Search** (library-only) · 380 + 1280 · filters by title client-side; ✕/Esc clears. (Desktop too — search/sort shipped to both.)
4. **Sort cycle** Recent → Rating → A–Z · 380 + 1280 · Recent = newest tracked first. **Known caveat:** pre-migration entries share one `createdAt`, so the *old backlog* won't differentiate under "Recent" until new add/track activity accrues — expected, self-correcting.
5. **Show N more** · 380 · sections cap at 4, reveal 4 per tap; desktop shows all.
6. **Following (franchises) row** · 380 · horizontal scroll, owns-library only.
7. Empty/sparse states · 380 · empty library = "Nothing tracked yet" CTA; filtered-to-empty hides sections.
8. Desktop unchanged · 1280.

### People (`/people`) — Phase 5b
Renders logged-out (sign-in prompts), but the feed/threads/type-mix need auth + follows.
1. **Activity feed entries** · 380 · avatar/username/time/stars, "reviewed [item]" line, text; username→profile, title→detail.
2. **Recent / Top toggle** · 380 · flips sort, resets feed to 4.
3. **Show 4 more** · 380 · reveals 4 client-side; fetches next server page when the loaded set is exhausted.
4. **Votes — BOTH viewports** · 380 + 1280 · up/down persist via `/api/reviews/helpful`; already-voted reviews show correct pre-selected state on load; refresh confirms persistence. **Check desktop feed votes too** (newly persisted there). Desktop now has **no** Reply control (intentional).
5. **Threaded replies (mobile)** · 380 · tap "N replies" → thread lazy-loads + nests with teal border; per-reply up/down + Reply composer; posting inserts the reply and keeps thread open; "Collapse thread" works; "Reply" on a 0-reply review opens the composer.
6. **Type-mix bar** · 380 · Following cards show real proportions in platform type colors.
7. **Similar taste** · 380 · empty copy under 10 ratings; "N shared" cards (no %); hidden at ≥10 with no matches.
8. **Following** · 380 · horizontal-scroll cards; section hidden when you follow no one.
9. Desktop unchanged · 1280.

### Public Profile (`/user/[id]`) — Phase 6b
Public profiles render logged-out (verified); private-state was verified at the **API**
level (data withheld, not UI-only). Signed-in remainder:
1. **Follow / Unfollow** · 380 · button toggles + count updates via `/api/users/[id]/follow`.
2. **Edit Profile + edit form (own profile, mobile)** · 380 · Edit replaces Follow; form (name/bio/Private toggle) saves; toggling Private updates the view.
3. **Persisted review votes** · 380 · up/down on the Reviews section persist (shared hook).
4. **Own private profile** · 380 · viewing your OWN profile while Private is on → you still see everything (the `isOwn` bypass), unlike a visitor who sees only identity + bio + "Library is private".
5. **Owner stars on cards** · 380 · **Known gap:** Top Rated / status-section cards show *your* rating (viewer), not the profile owner's — see §2 (`task_86be861b`). Mockup wants the owner's stars.
6. Reviews reply count · 380 · links to item detail (no inline thread expansion on profile — deferred, §3).
7. Desktop unchanged · 1280 · (note: the Gap-A privacy fix means the desktop "Reviewed" stat now shows 0 on a *private* profile — intended).

### Explore (`/explore`) — Phase 7b
Public page — **most of this was verified logged-out** (9-chip row, FILTERS/sort sheets,
per-type rows, type-selected 2-col grid, search results, desktop unchanged). Signed-in
remainder is minimal:
1. **Card stars on Explore** · 380 · cards reuse `<Card>`, so the gold star reflects *your*
   rating (same as everywhere) — confirm it shows your ratings when signed in.
2. **Recent searches** · 380 · tapping the search bar shows your recent searches (localStorage;
   works logged-out too) — confirm persistence across visits.
3. Spot-check the live states against the mockup: tap each type chip → 2-col grid + others
   hidden; FILTERS sheet (Genre multi / Vibe + Tag single) updates "Filters: …"; sort sheet
   updates the bar label; "See all →" / chip both land on the type grid.
4. Desktop unchanged · 1280 · three filter rows + auto-fill grid intact.

**Deferred (mockup notes call these "design later" — not built, by decision):**
- **Full-screen search experience** — the mockup's tap-to-fullscreen search is undesigned; we
  kept the existing inline search (restyled). A real full-screen search is a future task.
- **Dedicated `/explore/[type]` browse page** — "See all →" uses the existing `?type=` filtered
  grid instead; no new route built.
- **"Building" marker** is hardcoded to `{music, podcast}` (editorial, no catalog-status field) —
  revisit if more catalogs become "building".

---

## §2 — Tracked follow-up chips (spawned, one-click to start)

- **`task_58550134` — Desktop People feed threading.** ⚠️ **UNVERIFIED on main** (committed
  `c5bd3c9`, pushed) — landed deliberately as an owner-approved exception to verify-before-commit.
  Verify signed-in on https://crossshelf.app (desktop 1280, authed account following users whose
  reviews have replies): **(1) thread expand/collapse, (2) lazy reply load, (3) vote persistence.**
  Fix forward if any of the three is broken. The original chip scope (bring the mobile lazy-loaded
  threaded-reply experience to the desktop `ActivityCard`, reusing the shared hooks/helpers in
  `people/page.tsx`) is implemented; only the interactive signed-in confirmation remains.
- **`task_86be861b` — Profile cards: owner's rating + Rating sort.** Mobile profile
  collection cards reuse `<Card>`, which shows the *viewer's* rating, not the owner's
  (pre-existing, same on desktop). Add owner-score-per-entry to `/api/users/[id]` (gated
  by `showRatings`), render the owner's stars, and add a "Rating" sort option (currently
  A–Z only).

---

## §3 — Documented follow-ups (no chip yet)

- **Item-detail section order** — People currently precedes Where-to (mockup has Where-to
  between About and People). Cosmetic, inherent to the Option-C hybrid.
- **Cross-shelf / Related row labels on item detail** keep the desktop labels ("Across
  Media", "More X") rather than the mockup's italic "Cross your shelf" framing — relabel
  is shared with desktop, so deferred.
- **Profile reviews — inline thread expansion.** Profile review cards link the reply count
  to item detail rather than expanding the thread inline (People-style). Possible follow-up.
- **CrossShelf Score wordmark / scale.** Mobile cards omit the "CrossShelf" wordmark, `/10`
  scale, and "blended from N sources" text until the real blended score ships — deferred to
  the dedicated CrossShelf Score session. The score-row container is ready for it.

### Resolved (was flagged, now done)
- **Franchise data-source unification (the "LOTR strip not showing" bug)** — ✅ fixed:
  the mobile strip + desktop `FranchiseBadge` now use the shared `useItemFranchise` hook
  (DB `/api/franchises?itemId=`), linking the numeric `/franchise/[id]` route. Renders for
  all ~3,988 DB-franchise items with working links (verified: LOTR ROTK → `/franchise/575`,
  Dune → `/franchise/391`). The static `lib/franchises.ts` was removed. **Signed-in note:**
  this is public, so verifiable logged-out — confirm on prod that item pages broadly show
  the franchise strip/badge and links resolve.
- **Private Library toggle enforcement at the API/DB level** — ✅ verified in Phase 6a:
  `/api/users/[id]` withholds ratings/library/reviews/typeCounts and zeroes the counts when
  private (tested as a non-owner against a real flipped-then-restored user). Not UI-only.

---

## §4 — Pre-launch infra items (not mobile-UI)

- **Localhost OAuth redirect** — Supabase dashboard Redirect URLs need
  `http://localhost:3000/**`; the in-repo `redirectTo` is already origin-relative and
  correct (`src/lib/supabase/use-session.tsx`, `src/app/auth/callback/route.ts`).
- **~59 book covers on `storage.googleapis.com` still CSP-blocked** — audit + re-pull or
  allow the host (NYT `static01.nyt.com` was already allowed; GCS intentionally left out).
- **Vercel Analytics not enabled** (cosmetic warning).
- **App-layer privacy → RLS follow-up** — privacy gates live in `src/lib/privacy.ts`
  (Prisma uses the superuser pooler, bypassing RLS). A follow-up will mirror them as
  SECURITY DEFINER SQL + RLS for the PostgREST key path.
