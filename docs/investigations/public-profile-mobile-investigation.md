# Phase 6a — Public Profile mobile investigation (read-only findings)

Date: 2026-06-13. Scope: map the Public Profile mockup
(`design/mobile/crossshelf-mobile-public-profile.html`, public + private states)
to the current route + data layer; **verify private-state enforcement is REAL at the
data layer**; identify reuse vs. new. **No code written. Stop for approval before 6b.
Public Profile page only — not Library, not People.**

Route: `src/app/user/[id]/page.tsx` (client component; People links here as `/user/<id>`).
API: `src/app/api/users/[id]/route.ts`. Follow: `src/app/api/users/[id]/follow/route.ts`.
Privacy helpers: `src/lib/privacy.ts`.

---

## 1. Mobile section order + how it differs from Library

**Public state (top → bottom):**
1. Sticky top header — back arrow + `@username` + share icon (arriving from People).
2. **Identity block** — large avatar, name, joined date, member rank (gold ★ #N), Follow
   button (or **Edit Profile** when own) + bio (quote-styled, teal left border, only if non-empty).
3. **Taste fingerprint** — full-width type-mix bar + color legend ("Reviews across").
4. **Stats row** — 5 cells: Rated / Reviewed / Tracked / Followers / Following (color-coded).
5. **Status pills** — All / Done / Going / Want / Drop (tap to filter — same as Library).
6. **Filter row** — type pills + sort, **no search, no import** (vs Library which has both).
7. **Top Rated** — 5-star items, 2-col grid + "Show N more".
8. **Per-status sections** — Completed / In Progress / Want To / **Dropped** (shown), 2-col grids + show-more.
9. **Reviews** — review cards (mini cover + item title + type/date + stars + text + up/down/replies).

**Difference from Library (the architectural model — "viewing someone else's collection"):**
it's a Library *shape* + an identity header on top. **Adds:** identity/bio/stats/taste
fingerprint, Top Rated, Reviews. **Removes:** search pill, import button, Following-franchises
section, all per-card edit affordances (tapping a card → item detail, but you can't change
their status). Dropped section *is* shown (owning your drops is part of reviewer identity).

**Private state (the whole point of the second phone):**
1. Top header. 2. Identity block + bio. 3. **"Library is private"** indicator card (lock icon
+ explanation + "follow them for activity"). **Everything else hidden** — taste, stats,
status pills, filter, Top Rated, all status sections, Reviews. Follow button stays active.

---

## 2. Private-state enforcement — the critical concern (data-layer audit)

**Verdict: ratings + library ARE enforced at the data layer (not UI-only). Two gaps to fix in 6b.**

`/api/users/[id]` computes:
```
showRatings = isOwn || (!user.isPrivate && flags.showRatingsPublicly)
showLibrary = isOwn || (!user.isPrivate && flags.showLibraryPublicly)
```
- **Ratings / Top Rated:** ✅ `topRatings` fetched only when `showRatings`. A visitor to a
  private profile gets `[]` — the rows never leave the DB. **Properly enforced.**
- **Library:** ✅ `library` fetched only when `showLibrary`; response sends `library:
  showLibrary ? library : null`. **Properly enforced.**
- **ratingsCount / trackedCount:** ✅ zeroed when not shown.
- **Enforcement model:** lives in `src/lib/privacy.ts` (Prisma uses the superuser pooler,
  bypassing RLS). There's already a documented follow-up to mirror these as SECURITY DEFINER
  SQL + RLS for the PostgREST path — out of scope here, but worth noting the gates are
  app-layer today.

**Gap A — `reviewsCount` leaks on private profiles (real, minor).** The API returns
`reviewsCount: counts._count.reviews` **unconditionally** (comment: "reviews are always
public"). But the **locked Option B says reviews — and by extension their count — hide when
private.** So a visitor to a private profile currently learns how many reviews that user
wrote. → **Finding: zero `reviewsCount` when the profile is private (non-owner).** Purely
additive gate, benefits desktop + mobile. Flagged per your instruction, not bundled silently.

**Gap B — the Reviews section + taste fingerprint are NEW data that does not exist yet, and
MUST be added behind the privacy gate in 6b.** The profile API returns **no review content**
and **no per-type counts** today (the current page has neither a Reviews section nor a taste
bar). To build them I'll extend `/api/users/[id]` with:
- `reviews` (top-level reviews + item context + helpfulCount/replyCount/myVote/createdAt),
  gated by `showReviews = isOwn || (!isPrivate && flags.showActivityPublicly)` — matches the
  existing gate pattern and the locked "reviews hide when private."
- `typeCounts` (per-type rating counts for the taste bar), gated behind `showRatings`.
Both **additive, no schema change.** This is the spot where a leak could be *introduced* if
careless — so the plan is to gate them at the API from the start, never UI-only.

**Not a leak:** `followerCount` / `followingCount` are always returned (the People page already
shows follower counts publicly). Option B hides the *stats row* when private — that's a UI
decision; the counts themselves aren't sensitive collection data. The mobile private state will
simply not render the stats row.

**Note on current desktop private UI (pre-existing, not a leak):** even when private, the
desktop page still renders the Top Rated section (empty "No ratings yet") and the stats row
(with 0s + real review/follower counts) — it only swaps the library area for a "library is
private" card. That's incomplete vs. Option B's "hide everything but identity+bio," but it's
a *UI* shortfall, not a data leak (the sensitive rows are already withheld). Desktop stays
visually unchanged this phase; **mobile implements full Option B hiding.** (The `reviewsCount`
zeroing in Gap A does change the desktop "Reviewed" stat for private profiles — that's a
privacy fix, not a layout change.)

---

## 3. Reuse vs. new

**Reuse:**
- **`TypeMixBar`** (`src/components/type-mix-bar.tsx`, decoupled in Phase 5b for exactly this)
  → the taste fingerprint. Mockup adds a legend below — I'll render the legend in the profile
  and feed counts to the shared bar (no fork).
- **`MemberBadge` / `MemberBadgeBlock` / `getMemberTier`** → member rank + FOUNDING pill (already used).
- **`Card`** → Top Rated + status-section cards, sized via `--card-w`/`--card-cover-h` scoped on a
  profile-root parent (same 2-col token approach as Library mobile — never edit Card).
- **Follow flow** → `handleFollow` + `/api/users/[id]/follow` already wired on the page.
- **`useReviewVote`** (Phase 5b) for the Reviews section's persisted votes — but it's currently
  defined *inside* `people/page.tsx`, not exported (see Q3).

**New (mobile recompose, scoped ≤640):**
- Mobile profile layout (CSS `.profile-mobile`/`.profile-desktop` toggle — same no-flash pattern as People).
- Identity block, taste fingerprint + legend, stats row, status pills, type filter + sort,
  Top Rated, status sections, Reviews — all mobile-styled.
- The Library *patterns* (status pills, 2-col grid, show-more, type filter, sort) were built in
  Phase 4 but live as `.lib-*` classes scoped to the Library page — **not shared components.**
  So they're re-implemented (mirrored) in the profile mobile branch, not imported. (Extracting a
  shared library-grid is possible but is scope creep — flagging, not doing.)
- Small helpers (`avatarStyle`, star-text) currently live in `people/page.tsx` and aren't
  exported — I'll add local equivalents or extract (Q3).

---

## 4. Follow / unfollow affordance

Maps cleanly to the existing `/api/users/[id]/follow` (POST follow / DELETE unfollow, returns
`{following, followerCount, followingCount}`). `handleFollow` with optimistic update + revert is
already on the page. The mobile Follow button reuses it. When own profile → **Edit Profile**
(muted) instead, also already present. Follow stays active on private profiles per Option B.

---

## 5. Decidable questions

**Q1 — Reviews section data + gate (needs a ruling).** Extend `/api/users/[id]` with a
privacy-gated `reviews` array (recommended — one endpoint, one place to enforce privacy), gated
`showReviews = isOwn || (!isPrivate && showActivityPublicly)`. Confirm Option B mapping: reviews
hide when **isPrivate** (the single "Private Library" toggle), which this does. OK?

**Q2 — Gap A fix (reviewsCount leak).** Zero `reviewsCount` when private (non-owner)? It changes
the desktop "Reviewed" stat for private profiles (a privacy fix, not layout). Recommend yes.

**Q3 — Shared helpers.** `useReviewVote`, `avatarStyle`, and the star-text helper live inside
`people/page.tsx`. For the profile Reviews section I'd either (a) extract them to a small shared
module (`src/lib/` / `src/components/`) and import in both — cleaner, slightly larger diff — or
(b) duplicate minimal local copies in the profile page. Recommend **(a) extract** `useReviewVote`
(+ `reviewIdOf`) since votes must stay consistent with People; duplicate the tiny presentational
helpers if extraction isn't clean. Your call on appetite for the refactor.

**Q4 — Taste fingerprint source.** Compute `typeCounts` from the user's **ratings** (gated by
`showRatings`, consistent with People's Following type-mix) even though the label says "Reviews
across"? Ratings ≈ reviews here and it reuses an existing gate. Or compute from reviews
specifically. Recommend ratings-based for gate-reuse + consistency.

**Q5 — Status filter / sort / show-more parity.** Mirror Library mobile exactly (tappable status
pills filter sections, type-pill filter, sort cycle Recent/Rating/A–Z, 4-card show-more)? The
profile has no `createdAt` per library entry exposed in this API — so "Recent" sort may need the
same treatment as Library (the entry has no timestamp in this endpoint's select). Recommend:
match Library's sort options the data can back; confirm whether to add the timestamp to this
endpoint or limit the profile sort to Rating/A–Z. (Flagging the same timestamp question Library hit.)

## 6. Proposed 6b commit plan (after approval)

1. **API**: extend `/api/users/[id]` with gated `reviews` + `typeCounts`; **fix Gap A** (zero
   `reviewsCount` when private). Additive, no schema change. (Own commit — the data/privacy layer.)
2. (If Q3=a) extract `useReviewVote`/`reviewIdOf` to a shared module; rewire People to import.
3. Mobile shell + identity block + bio + Follow/Edit (CSS `.profile-mobile`/`.profile-desktop` toggle).
4. Taste fingerprint (reuse `TypeMixBar` + legend) + stats row.
5. Status pills + type filter + sort + Top Rated + per-status 2-col sections + show-more.
6. Reviews section (cards + persisted votes + reply count; lazy threads optional/deferred).
7. **Private state**: full Option B hiding + "Library is private" indicator (mobile).

**Constraints honored:** class-driven CSS + `<style>` blocks; desktop visually unchanged >640;
tokenized card sizing; hide-don't-placeholder; reuse `TypeMixBar`; privacy gated at the API, never
UI-only.

**Verification plan:** tsc + build clean; 380px (mobile public + private) + 1280px (desktop
unchanged). The populated profile, the private state from a *visitor's* perspective, and the
Reviews/votes all need auth + specific data → signed-in production pass; the mobile layout +
not-found/own-profile shells are checkable logged-out. I'll note exactly what I couldn't verify.
