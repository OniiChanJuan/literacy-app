# Phase 5a — People mobile investigation (read-only findings)

Date: 2026-06-13. Scope: map the People mockup
(`design/mobile/crossshelf-mobile-people.html`) to the current `/people` route +
data layer, identify reuse vs. new components, confirm what data exists for the
threaded feed and type-mix bar, and surface decidable questions. **No code written.
Stop for approval before 5b. People page only — NOT Public Profile, NOT onboarding.**

Route: `src/app/people/page.tsx` (client component, ~540 lines, currently a desktop
two-column layout). Data via `/api/activity`, `/api/users/me/following`,
`/api/users/similar`, `/api/users/search`, `/api/follows`.

---

## 1. Mockup section order vs. current

**Mockup mobile order (single column):** Activity (feed, first) → Find reviewers
(search) → Similar taste → Following.

**Current desktop:** two columns — LEFT = Find reviewers / search / Your following /
Similar taste; RIGHT = Activity. So mobile is a **re-stack with Activity promoted to
first**, same pattern as Phase 2b/3b (desktop two-column preserved >640; mobile
single-column via breakpoint gating / CSS `order`). The page does **not** redirect when
logged out (shows sign-in prompts) — so the mobile *layout* and *empty states* are
verifiable logged-out; the *populated* feed/threads/type-mix are not (auth + data).

## 2. Mockup section → existing code

| Mockup element | Exists? | Where / notes |
|---|---|---|
| Page title "People" | ✅ | trivial header |
| **Activity feed** (follow-based) | ✅ data | `/api/activity?sort=recent\|top&offset=` returns reviews + rating-only events from followed users. `ActivityCard` renders desktop card. |
| Activity entry: avatar+username+time+stars / action line / text / controls | ⚠️ re-skin | `ActivityCard` has all fields but as a bordered card; mockup wants compact border-bottom rows, stars top-right, teal item link, up/down/replies controls. Re-compose for mobile. |
| **Threaded replies** (Reddit-style expand) | ❌ in feed / ✅ elsewhere | **Not in the activity feed.** Full threading exists on the *item-review* system (see §3). `community-reviews.tsx` has a `ReplyThread`, but it's item-detail-coupled (composer for "this item", "my review" editing) — not reusable as-is. |
| up/down vote + count | ⚠️ partial | `ActivityCard` `VoteButtons` is **local-only** (not persisted). Feed returns `helpfulCount` (up-votes only); no `voteScore`/`myVote`. Real endpoint `/api/reviews/helpful` exists. |
| **"N replies" badge** | ❌ | Feed API returns **no reply count**. Requires an additive `/api/activity` field (§3, Q1). |
| **Recent / Top toggle** | ✅ re-skin | Current sort buttons → restyle as mockup pill toggle in the section header. |
| **"Show 4 more"** progressive | ⚠️ differs | Feed uses server pagination ("Load more", 20/page). Mockup wants client 4→8 progressive (Library pattern). Wrap client-side over loaded page (§Q5). |
| **Find reviewers** search | ✅ re-skin | `/api/users/search` + debounced input exist; re-skin search bar to mockup. |
| Search no-results copy | ✅ | exists ("No users found…") → adopt mockup copy. |
| **Similar taste** + empty state | ✅ data / ⚠️ rules | `/api/users/similar` returns `sharedRatings` (count) + `isFollowing`. Empty state exists; mockup adds **<10-ratings threshold** + similarity % (§Q4). |
| **Following** row (horizontal scroll) | ✅ re-skin | `FollowingCompactCard` + `/api/users/me/following`. Mockup adds rank + **type-mix bar**; hides section when empty. |
| **Type-mix bar** (proportional fingerprint) | ❌ component / ⚠️ data | No component exists. Data: following endpoint computes per-type counts internally but only returns `topMediaTypes` (top-3 **names**, no proportions) — see §3, Q2. |
| MemberBadge / tier / avatar / timeAgo / StarRow | ✅ reuse | all present in the page / `member-badge.tsx`. |
| Bottom tab nav | ✅ | global BottomNav (Phase 0). |

## 3. Data confirmation (the crux)

- **Activity feed surfaces NO threading.** `/api/activity` returns flat entries
  (`helpfulCount`, `score`, `text`, item, user, `createdAt`). No reply count, no nested
  replies, no `voteScore`/`myVote`.
- **Threading fully exists — on the item-review system, keyed by `itemId`:**
  `GET /api/reviews?itemId=` returns top-level reviews with nested `replies[]`
  (`parentId`, `depth` ≤ 3, `voteScore`, `myVote` up/down). `POST /api/reviews` with
  `parentId` creates a reply (functional, with notifications). `POST /api/reviews/helpful`
  persists up/down votes. So threading is a **surfacing gap in the feed, not a missing
  data model.**
- **Type-mix proportional data is computed but discarded.** `/api/users/me/following`
  builds `typeCounts` per user, then returns only `topMediaTypes` (3 names). Exposing
  `typeCounts` is a **tiny additive change** (data already computed) — no new query.
- **Similarity % isn't exposed.** `/api/users/similar` computes a `similarity` score
  internally but returns only `sharedRatings` (count).

## 4. Reuse vs. new components

**Reuse:** `MemberBadge`/`getMemberTier`, `avatarStyle`, `timeAgo`, `StarRow`,
`/api/*` endpoints, the search/similar/following data flow, Phase-1 `BottomSheet` (only
if a filter sheet is needed — likely not here). Desktop two-column layout untouched.

**New (mobile):**
- Mobile activity entry (re-compose `ActivityCard` to the compact mockup layout, gated ≤640 — Phase 3b pattern).
- **`<TypeMixBar segments={…} />`** — a small shared component, built to be reused by Public Profile later (per instruction: do not fork).
- Reply-thread renderer for the feed — **only if Q1 chooses functional threading.**
- Mobile reviewer/following card (re-skin with rank + type-mix bar + horizontal scroll).
- Recent/Top pill toggle restyle; mobile "Show 4 more" wrapper.

## 5. Decidable questions (please rule on before 5b)

**Q1 — Threaded replies: how far in Phase 5? (central decision)**
The data model + endpoints exist, but the *feed* API surfaces none of it. Matching the
mockup's "2 replies / 4 replies" badge requires at minimum a reply **count** per entry,
which `/api/activity` does not return. Options:
- **A. Display-only / deferred (zero data-flow):** ship the compact feed entry +
  up/down/Reply controls visually, but **omit the "N replies" badge and thread
  expansion** (no reply data in the feed). Honest-labeling: no fake counts. Threading
  lands in a later pass.
- **B. Count + lazy-expand (small additive API change) — recommended:** add `replyCount`
  to `/api/activity` entries (additive). Show the "N replies" badge; on tap, lazy-load
  the thread via existing `GET /api/reviews?itemId=` (locate this review's node, render
  its `replies[]`). Posting replies reuses existing `POST /api/reviews`. One additive
  field; reuses all existing endpoints.
- **C. Full embed:** embed shallow replies directly in `/api/activity` (bigger feed
  payload + more query work).

**Q2 — Type-mix bar data.** Expose `typeCounts` from `/api/users/me/following` (tiny
additive change, data already computed) so the proportional bar is real — **recommended**;
or defer the bar (ship following cards without it). Same exposure later wanted on
`/api/users/similar` + search for the shared component; in-scope now only for Following.

**Q3 — Vote persistence in the feed.** Wire real up/down via `/api/reviews/helpful` for
review entries (endpoint exists; reviewId available from the `review-<id>` activity id) —
or keep the current **display-only local** votes (matches current desktop behaviour,
zero data-flow). Rating-only entries have no review → no vote/reply controls (matches
mockup).

**Q4 — Similar-taste threshold + %.** Adopt the mockup's **<10-ratings** empty-state
rule? And the similarity **%** isn't exposed — show **"N shared ratings"** (current data)
instead of a %, or derive a % client-side? Recommend: adopt threshold, keep "N shared
ratings" (no new metric). Low priority — empty for the sole-user case anyway.

**Q5 — Show-more.** Mobile shows 4 entries, "Show 4 more" expands client-side over the
loaded page (triggering the existing server "load more" when the loaded set is exhausted);
desktop keeps "Load more". OK?

## 6. Proposed 5b commit plan (after approval, isolated commits)

1. Mobile re-stack: single column, Activity first, desktop two-column preserved >640.
2. Mobile activity entry re-skin (compact rows, stars, action line, controls).
3. Recent/Top pill toggle + mobile "Show 4 more".
4. `<TypeMixBar>` shared component + Following row re-skin (rank + bar + h-scroll).
   *(+ expose `typeCounts` if Q2 = yes — its own small commit.)*
5. Find-reviewers search + Similar-taste empty state/threshold re-skin.
6. Threaded replies — **only per Q1's choice** (count field + lazy-expand, or deferred).

**Constraints honored:** class-driven CSS + `<style>` blocks (no Tailwind utilities);
desktop untouched >640; no forked shared components; hide-don't-placeholder; data-flow
changes only where a question above approves them.

**Verification plan:** tsc + build clean; 380px (mobile) + 1280px (desktop unchanged);
verify threaded-reply expansion + type-mix bar render. The populated feed/threads/type-mix
are auth+data-gated, so — as with Library — those get a signed-in production pass; the
mobile layout + empty/sign-in states are verifiable logged-out.
