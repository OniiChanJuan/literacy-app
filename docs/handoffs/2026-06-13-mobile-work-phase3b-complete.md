# Mobile work — handoff at Phase 3b completion (2026-06-13)

Audience: a future Claude Code session continuing the CrossShelf mobile redesign.
You have the repo, the git log, and Anthropic-side memories — but **not** this
session's chat history. This document is the bridge.

## Commit hash reference (run `git show <hash>` for context)

Mobile foundation + pages (newest first within each phase):
```
Phase 3b — Item detail mobile
  aea41e0  fix(mobile): show detail score/external pills regardless of voteCount gate
  7c1c585  feat(mobile): item-detail smart-hide action bar
  810cdf0  feat(mobile): item-detail cross-shelf/related card sizing + hide franchise universe
  4844639  feat(mobile): item-detail About + People sections
  f90206c  feat(mobile): item-detail Your activity card / Rate prompt
  6f724ff  feat(mobile): item-detail rating distribution (resurrected, >=10 gate)
  d844107  feat(mobile): item-detail contributing-score pills + recCount in aggregate
  431085f  feat(mobile): item-detail franchise/series strip (new element)
  848d003  feat(mobile): item-detail CrossShelf score row + gate ItemSubBanner desktop-only
  9d31226  feat(mobile): useIsMobile gate + item-detail mobile header/hero shell

Phase 2b — For You mobile
  efb35f8  feat(mobile): curated row card sizing + Cross-above-Picked order swap
  aadbf91  feat(mobile): compress What's happening to single-line activity rows
  4532d8c  feat(mobile): Picked for you compact rows + status pill + show-more
  97baac2  feat(mobile): re-skin Cross your shelf to mockup source-row layout
  3b5970e  feat(mobile): collapse For You filter bar into a pill + BottomSheet
  9c1a1ca  feat(mobile): restyle identity card to mockup strip on mobile
  2e6f98b  feat(mobile): remove hamburger menu, polish header for mobile mockup

Phase 1 — primitives
  1ddc47a  refactor(cards): drive Card and SkeletonCard dimensions from layout tokens
  2cdd6ca  feat(mobile): add shared BottomSheet component
  5cd583b  feat(mobile): add useScrollDirection hook for smart-hide bars

Phase 0 — foundation
  fb9641c  feat(mobile): add fixed bottom tab nav at the mobile breakpoint
  b5bc958  feat(mobile): add mobile layout design tokens
  47441e4  feat(mobile): add viewport-fit=cover and safe-area inset variables
  92129f5  chore(css): remove dead mobile classes from abandoned earlier pass
  c499901  refactor(responsive): standardize breakpoints on 640/768/1024

Fixes shipped alongside the mobile work
  47ee47c  fix(cross-connections): filter rated recs per-item, not whole connection
  49233db  fix(mobile): use user gradient avatar in What's happening
  031069c  fix(mobile): keep "View profile →" visible when vibe pills overflow
  d6a006c  fix(mobile): align BottomNav active state to teal accent
  aeb44d8  fix(csp): allow static01.nyt.com for NYT bestseller covers
```

Investigation reports also live in the repo root (uncommitted or committed):
`mobile-foundation-investigation.md`, `for-you-caching-and-smoothness-investigation.md`,
`crossshelf-score-investigation.md`.

---

## 1. Where we are

### The initiative
A responsive mobile redesign of CrossShelf (Next.js App Router, Supabase/Prisma,
deployed at crossshelf.app). Desktop is the existing product; we are adding a
mobile (<=640px) layout **without changing desktop**. The canonical visual specs
are 8 hand-built HTML mockup files in **`design/mobile/`** (committed) representing
9 page states:

```
crossshelf-mobile-for-you-signed-in.html      ← Phase 2b (done)
crossshelf-mobile-item-detail.html            ← Phase 3b (done, rich state)
crossshelf-mobile-item-detail-sparse.html     ← Phase 3b (done, sparse/empty-state spec)
crossshelf-mobile-cross-your-shelf.html       ← (reference; the For You section has a fuller standalone spec here)
crossshelf-mobile-library.html                ← Phase 4 (NEXT)
crossshelf-mobile-explore.html                ← later
crossshelf-mobile-people.html                 ← later
crossshelf-mobile-public-profile.html         ← later (contains BOTH public + private profile states)
```
Each mockup has a "design decisions baked in" / notes card at the bottom of its
body — **read it**; it encodes thresholds and decisions not obvious from the visual.

### Foundation completed
- **Phase 0** (`c499901`→`fb9641c`): standardized breakpoints to inclusive
  **640 / 768 / 1024** (documented in `src/app/globals.css`; don't reintroduce
  639/767/1023 drift); `viewport-fit=cover` + `--safe-top`/`--safe-bottom`
  vars; **BottomNav** (`src/components/bottom-nav.tsx`, global, fixed, <=640px,
  shares `src/lib/nav-tabs.ts` with desktop nav; active state teal); removed dead
  mobile CSS; added layout tokens (`--card-w`, `--card-cover-h`, `--bottom-nav-h`,
  `--touch-target` in globals.css).
- **Phase 1** (`5cd583b`→`1ddc47a`): `src/lib/use-scroll-direction.ts`
  (rAF-throttled, momentum-bounce accumulator threshold); `src/components/bottom-sheet.tsx`
  (z-220, drag-to-close, safe-area, 85dvh); **Card tokenization** — `Card` +
  `SkeletonCard` read `var(--card-w)`/`var(--card-cover-h)` (default 150/210).

### Pages completed
- **Phase 2b — For You** (`/`, 7 commits): header polish + hamburger removed
  (BottomNav owns primary nav; secondary lives behind the avatar UserMenu);
  identity strip; filter pill → BottomSheet; Cross-your-shelf source-row reskin;
  Picked-for-you compact rows + status pill + show-more; What's-happening
  single-line rows; curated-row card sizing + Cross-above-Picked CSS `order` swap.
  Touch points: `src/app/page.tsx`, `src/components/{taste-identity-card,
  picked-for-you-grid,cross-your-shelf,whats-happening,nav}.tsx`.
- **Phase 3b — Item detail** (`/[type]/[slug]` and `/item/[id]`, 9+1 commits):
  Option C hybrid — heavy islands (reviews, recommendations, where-to) render once
  and are CSS-restyled in place; the top cluster (header→hero→score→franchise
  strip→contributing pills→distribution→your-activity→about→people) is
  re-composed in **`src/components/mobile-item-detail.tsx`** (`MobileItemTop`,
  mobile-only via `useIsMobile`); smart-hide action bar in
  **`src/components/mobile-item-action-bar.tsx`**. `ItemSubBanner` is gated
  desktop-only so `/api/items/[id]/aggregate` fetches once per breakpoint. The
  desktop hero/back-row are CSS-hidden <=640 (`.item-detail-deskhero/-deskrow`),
  FranchiseUniverse hidden <=640, recommendation cards scoped to ~100px via
  `--card-w` on `.item-detail-root`. The aggregate endpoint now returns
  `recCount` (read-only addition).

### Pages still pending (recommended order)
1. **Library** ← NEXT (Phase 4)
2. **People**
3. **Public Profile** (public + private states — one mockup file)
4. **Explore** — LAST, it's the most complex page (1,148 lines, 4 browse modes)

### Recent non-mobile-page fixes shipped in this stretch
`aeb44d8` CSP allow `static01.nyt.com` (NYT book covers were blocked catalog-wide);
`d6a006c` BottomNav active state teal (was red `--accent`); `031069c` "View profile →"
clipping in the identity strip; `49233db` What's-happening avatar = user gradient not
item cover; `47ee47c` cross-connections per-rec filtering (an entire connection was
dropped if any one rec was already rated, pushing engaged users into trending mode —
now filters individual recs, keeps the connection if >=1 rec survives).

---

## 2. What we learned / patterns to keep

- **"Card is the blast radius."** `src/components/card.tsx` renders on every
  surface (rows, grids, search, recommendations). Resize it by scoping
  `--card-w`/`--card-cover-h` on a **parent container** for the specific page
  (e.g. `.item-detail-root`, `.foryou-page`) — **never edit the Card component
  or set a global override.** Picked-for-you and cross-shelf use their own custom
  card markup (not `Card`), so they're unaffected by those tokens.
- **`useIsMobile` gate (`src/lib/use-is-mobile.ts`) — use sparingly.** It's the
  SSR-safe (`useSyncExternalStore`, server snapshot `false`) JS breakpoint gate.
  Use it **only when you must prevent a component from *mounting*** per breakpoint
  (e.g. to stop a data-fetching island double-mounting). For pure
  show/hide-after-mount, use **CSS media queries** — cheaper, no hydration cost.
  Gotcha: a gated component's hooks still run during the brief pre-hydration
  window (SSR default false), so guard any *fetch effect* on `isMobile` (and, if
  a sibling also fetches, defer its fetch one macrotask with a cancel-on-flip
  timer — see `ItemSubBanner` in `848d003`). Dev StrictMode double-invokes
  effects, so "fetch count" looks inflated in dev; reason about production.
- **Investigation phase first (Phase Na → Nb).** Every page started with a
  read-only investigation that mapped mockup sections to existing
  components/data and surfaced *decidable questions* (e.g. Option A/B/C for item
  detail, the franchise-strip data source) before writing code. Stop for owner
  approval after the investigation. This avoided mid-implementation surprises.
- **Deferred-contents pattern.** When a piece needs future work, ship the
  *container* now with current-state contents and update later in one place.
  Concretely: the CrossShelf Score row ships the current 0-5 number with **no
  wordmark, no `/10`, no "blended from N sources" text** — those land in the
  dedicated CrossShelf Score session. Same pattern was used in Phase 2b.
- **Honest labeling — hide, don't placeholder.** Below threshold, omit the
  section entirely; never render zeros/empty bars. Item-detail thresholds:
  rating distribution >=10 ratings; Community pill >=10 ratings; Recommend% pill
  >=5 recommend tags (uses the new `recCount`); reviews >=1; where-to only with
  streaming data; cross-shelf/related only with data; your-activity vs rate-prompt
  by engagement; score row only when a score exists; score teal only when >=10
  ratings AND an external score (else neutral border).
- **Detail-page score/pills bypass the voteCount display gate** (`aea41e0`):
  `getBestExtScore`/`formatExtScores` normally hide scores below a voteCount
  threshold (anti-inflation for ranking/cards). On the detail page we want to
  show the external score transparently, so `MobileItemTop` passes a large
  voteCount sentinel. The teal-vs-neutral treatment still uses the real rating count.
- **Class-driven CSS, not Tailwind utilities in markup.** House style is inline
  `style={{}}` + per-component `<style>` blocks. Match it.
- **Commit isolation per logical chunk** so reverts are surgical.
- **Verification matrix before every push: rich state + sparse state + desktop
  unchanged.** Use the preview tools; resize 380px and 1280px. Note: the dev
  preview is **logged-out** and the live DB has sparse community data, so
  authed-only UI (your-activity card) and high-threshold UI (distribution) can't
  always be seen live — verify those by logic + flag for a signed-in pass.

---

## 3. What's next

### Immediate next phase: Phase 4 — Library mobile
- Mockup: **`design/mobile/crossshelf-mobile-library.html`** (read it + its notes
  card first). Route: `src/app/library/page.tsx` (client component, currently has
  an inline card — extracting it is fair game).
- Follow the established rhythm: **Phase 4a read-only investigation → owner
  approval → Phase 4b implementation in isolated commits → verify (rich/sparse/
  desktop) → push.**
- Reference Phase 2b (`src/app/page.tsx`) and Phase 3b
  (`src/components/mobile-item-detail.tsx`) for the patterns above.

Library-specific design decisions (from Anthropic memories — confirm against the mockup):
- Status pills: **All / Done / Going / Want / Drop**, colored variants.
  Colors: **Done teal, Going blue, Want purple, Drop red** (type-color language).
  (Library status values in code are `completed | in_progress | want_to | dropped`,
  see `src/lib/library-context.tsx`.)
- **Following section** (franchises, not users) — appears **only on own Library**,
  not on public profile.
- Type-filter pills + sort button + **search pill** (search is **Library-only**,
  not on public profile).
- Per-status sections with progressive **"Show N more"** (4 cards visible by default).

### Follow-ups queued (file separately when prioritized — NOT for the next session)
1. **(Higher priority) Franchise data-source unification.** The mobile item-detail
   franchise strip uses the static `src/lib/franchises.ts` only (so it shows only
   for items in that hardcoded set — e.g. LOTR: The Return of the King is NOT in it,
   so no strip). DB-backed franchises (`/api/franchises?itemId=`) have position
   data but **no slug** for `/franchise/[slug]` links. Unify so the strip works for
   all franchise items. (An Anthropic memory captures this.)
2. Item-detail section order: People currently precedes Where-to (mockup has
   Where-to between About and People) — cosmetic, inherent to Option C.
3. Cross-shelf/Related row labels on detail keep the desktop labels ("Across
   Media", "More X") rather than the mockup's italic "Cross your shelf" framing —
   relabeling is shared with desktop, so deferred.
4. Awards/DLC mobile sections: shown when present (accepted as correct; not in mockup).

### Pre-launch verifications that depend on mobile pages landing
- Private Library toggle enforcement at the API/DB level.
- Localhost OAuth redirect (separate auth issue: Supabase dashboard Redirect URLs
  need `http://localhost:3000/**`; in-repo `redirectTo` is already origin-relative
  and correct — `src/lib/supabase/use-session.tsx`, `src/app/auth/callback/route.ts`).
- Vercel Analytics not enabled (cosmetic warning).
- ~59 book covers on `storage.googleapis.com` still CSP-blocked (audit + re-pull;
  static01.nyt.com was already allowed in `aeb44d8`, GCS intentionally left out).

### Explicitly DO NOT
- Don't refactor the `Card` component — tokenize via CSS variables in parents.
- Don't add Tailwind utility classes in markup (match inline-style + `<style>` house style).
- Don't change desktop layouts — scope every mobile rule to `<=640px`.
- Don't render placeholder zeros for missing data — hide below threshold.
- Don't implement CrossShelf Score items (wordmark, 0-5→0-10 scale, "blended from
  N sources" formula text) — that's a future dedicated session; the score row
  container is ready for it.
