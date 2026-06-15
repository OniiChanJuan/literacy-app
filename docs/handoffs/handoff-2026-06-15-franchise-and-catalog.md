# Session handoff — 2026-06-15 (franchise unification + what's next)

Audience: a fresh Claude Code session. Everything below is current as of this handoff.
Branch: **`main`**. All this session's work is **committed and pushed** (`HEAD == origin/main`).
Repo: `github.com/OniiChanJuan/literacy-app`. Project root: `C:\Users\juang\OneDrive\Desktop\claud md`.

---

## 1. What shipped this session — Franchise data-source unification (the "LOTR strip not showing" bug)

**Bug:** the mobile item-detail franchise strip (and desktop `FranchiseBadge`) read only the
static `src/lib/franchises.ts` (6 hardcoded franchises) and linked `/franchise/[slug]`. But the
franchise page API (`/api/franchise/[id]`) is **numeric-id only** (`parseInt` + `findUnique by id`),
so static slug links were dead (`/api/franchise/dune` → 400) AND every DB-only franchise item
(~3,988 items, e.g. *LOTR: The Return of the King*) got no strip at all.

**Fix (no migration, no slugs):** both components now use a shared hook pointed at the DB.

**Commits (newest first):**
```
67bacc8  docs: franchise unification investigation + mark resolved in checklist
9cb4d3e  chore(franchise): remove vestigial static lib/franchises.ts
f7a38c9  fix(franchise): desktop FranchiseBadge uses DB source + numeric link
28fe446  fix(franchise): mobile strip uses DB source + numeric link
8d80b03  feat(franchise): shared useItemFranchise hook (DB source of truth)
```

**What changed:**
- **New** `src/lib/use-item-franchise.ts` — `useItemFranchise(itemId)` hook: fetches
  `GET /api/franchises?itemId=<n>`, returns `{ id, name, icon, color, totalItems } | null`.
  Single source of truth for both consumers.
- `src/components/mobile-item-detail.tsx` — strip now `useItemFranchise(item.id)`, links
  `/franchise/${franchise.id}`, position label uses the **"N entries"** form (API doesn't return
  the current item's index).
- `src/components/franchise-badge.tsx` — rewritten as a **client component**, takes `itemId`,
  same hook, links `/franchise/${id}`. (Render site `src/app/item/_page-impl.tsx:218` now passes
  `itemId={item.id}` instead of `routeId`.)
- **Deleted** `src/lib/franchises.ts` (vestigial after both consumers rewired; no other importers).

**Verification (public pages, logged-out, dev preview):**
- LOTR ROTK (item `1353`) mobile 380px → strip renders: "Part of **Middle-earth** · 23 entries · 2003"
  → **`/franchise/575`** (resolves 200). Desktop 1280px badge → "Part of the Middle-earth universe →"
  → `/franchise/575`. **Was absent before.**
- Dune (item `10`, previously static-lib) → strip "Part of **Dune** · 8 entries" → **`/franchise/391`**
  (richer than the old static 2-item version, working link).
- `tsc --noEmit` clean; `next build` clean (exit 0); no overflow at 380 or 1280.

**Open question I flagged — and its resolution:** the strip/badge became a **client fetch** (was a
sync lookup), so they now insert after `/api/franchises?itemId=` resolves → a small layout shift in
normal flow. The endpoint is **CDN-cached** (`s-maxage=300`); on a warm cache the strip was present
by the time the page was interactive (no visible gap measured). This matches the page's existing
pattern (it already client-fetches `/api/items/[id]/aggregate`). **Resolution: no skeleton added** —
judged unnecessary (fast, small, below hero, consistent with existing behavior). Left for the owner
to judge on a cold-load signed-in pass; add a reserved-height placeholder only if a jarring shift
shows up on prod.

**Desktop impact (approved, expected):** the badge now appears on far more item pages (any
DB-franchise item) with working links — a correctness fix, not a redesign. Spot-check it reads as
intentional.

---

## 2. Mobile redesign — status

**All 7 phases complete and pushed.** The initiative added a `<=640px` mobile layout without
changing desktop (CSS `.X-mobile`/`.X-desktop` toggles, no useIsMobile flash where avoidable).

| Phase | Page | Status |
|---|---|---|
| 0–1 | Foundation (BottomNav, breakpoints, tokens, `BottomSheet`, `useScrollDirection`, Card tokenization) | ✅ pushed |
| 2b | For You (`/`) | ✅ pushed (prior session) |
| 3b | Item Detail | ✅ pushed (prior session) |
| 4b | Library (`/library`) | ✅ pushed — incl. the Dorian-Gray horizontal-overflow fix (`14f95e6`) |
| 5b | People (`/people`) | ✅ pushed |
| 6b | Public Profile (`/user/[id]`) | ✅ pushed — incl. privacy Gap-A fix (reviewsCount gated) |
| 7b | Explore (`/explore`) | ✅ pushed (`99476ff..29d5cac`) — 9-chip row, FILTERS+sort `BottomSheet`, 110px rows, 2-col type grid, search restyle |

**Consolidated signed-in verification checklist EXISTS** at
**`docs/handoffs/mobile-signed-in-verification-checklist.md`** (the single source for every
"needs signed-in pass" item + deferred follow-ups, organized by page with what/viewport/expected).
The owner runs it on `https://crossshelf.app` signed in. Franchise unification is now marked
**Resolved** there.

Per-phase investigation notes live in `docs/investigations/` (people-, public-profile-,
explore-, franchise-unification-, library-mobile-).

---

## 3. Open tracked follow-up chips

> **Update (this session, WIP triage):** the two chips below had pre-existing uncommitted
> implementations in the working tree. **`task_86be861b` is now DONE + verified + committed
> (`2bca4ed`, pushed)** — closeable. **`task_58550134` is HELD uncommitted** in
> `src/app/people/page.tsx` — see §3a.

- **`task_58550134` — Desktop People feed threading.** ⏸ **HELD (code complete, unverified).** A
  full implementation sits **uncommitted** in `src/app/people/page.tsx` (~245 lines:
  `DesktopReplyNode`, `ReplyComposer` `variant:"desktop"`, lazy-thread state on the desktop
  `ActivityCard`; reuses `VoteButtons`/`useReviewVote`/`/api/reviews`). **Verified:** tsc + build
  clean; mobile People unaffected (`ReplyComposer` defaults to `variant:"mobile"` → original path);
  desktop renders without errors; the `ActivityCard` is fully wired to the thread. **NOT verified
  (needs signed-in):** thread expand/collapse, lazy reply load, vote persist — all require an
  authenticated People feed with followed-user reviews that have replies, which the logged-out dev
  preview can't provide. **Do not commit until a signed-in pass confirms the 3 interactive
  criteria.** The diff is intact in the working tree (`git diff src/app/people/page.tsx`).
- **`task_86be861b` — ✅ DONE (committed `2bca4ed`, pushed).** Profile cards now show the OWNER's
  read-only rating (new `Card.ownerScore` prop) and the mobile profile sort gained a Rating mode
  (Default → Rating → A–Z). `GET /api/users/[id]` returns owner `score` per library entry, gated by
  `showRatings`. **Privacy verified** (flipped a real account private → no `score` leaks anywhere in
  the response; restored). This chip is **closeable**.

### 3a. Why Feature 2 was held (do not lose this)
The owner-score work (`task_86be861b`) was publicly verifiable logged-out and shipped. The desktop
threading (`task_58550134`) is **auth-gated** — its acceptance criteria are interactive behaviors on
the activity feed that can't be exercised without a signed-in account + followed reviews. Per the
"commit only what passes / don't commit because it looks complete" rule, it stays uncommitted.
**Next session OR a signed-in run:** verify the 3 interactive criteria on prod/locally signed-in,
then `git add src/app/people/page.tsx && git commit` (single commit, ref `task_58550134`).

No new chips opened this session.

---

## 4. Pre-launch infrastructure backlog (NOT started)

- **Supabase legacy key migration.** Move `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`
  (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) off the legacy key system onto Supabase's new publishable/secret
  key system, then **disable the legacy keys**. Touches `.env.local`/`.env`, Vercel env vars, and
  `src/lib/supabase/*`. Coordinate so nothing breaks mid-rotation.
- **`platform_clicks` schema additions** — add columns `source`, `session_id`,
  `referrer_connection_id` (affiliate/click attribution). Will need a Prisma model change + raw-SQL
  migration script (repo convention: `scripts/migrate-*.ts` using `pg.Client` + `DIRECT_URL`,
  transactional + idempotent — see `scripts/migrate-add-library-created-at.ts` as the template).
- Carryover infra items already in the checklist §4: localhost OAuth redirect (Supabase dashboard
  Redirect URLs need `http://localhost:3000/**`), ~59 GCS-hosted book covers still CSP-blocked,
  Vercel Analytics not enabled, and the app-layer-privacy → RLS/SECURITY DEFINER follow-up.

---

## 5. Incoming work the next session should expect — catalog-expansion reconciliation

A **catalog-expansion reconciliation task is queued**: a spreadsheet of **~460 candidate titles**
referenced by the **connection corpus** (the cross-media recommendation graph) needs to be verified
against the **real catalog** — i.e. split into **confirmed-missing** vs **already-present** — *before*
any ingestion. Do not ingest blindly. The next session should expect this and plan a
verify-first pass (match by title/type/year/external-id against `items`, flag true gaps) before
populating. Relevant tooling: `scripts/populate-catalog.ts` (idempotent, dedupes by external id) and
the per-source sync scripts documented in `CLAUDE.md`.

---

## 6. Mid-flight / working-tree state (read before committing anything)

- **TRIAGED + RESOLVED (update).** The pre-existing uncommitted WIP turned out to be the two open
  chips' implementations. Outcome:
  - `task_86be861b` (owner-stars + Rating sort) — verified incl. privacy, **committed `2bca4ed`, pushed.**
  - The investigation notes + Session-2d privacy/RLS scripts + `public_user_profiles.sql` view —
    **committed** (`e35711d`, `3044b5e`), two root docs relocated into `docs/investigations/`.
  - `.claude-handoff.md` — **discarded** (stale).
- **One file remains intentionally uncommitted:** `src/app/people/page.tsx` — the **held** desktop
  threading WIP (`task_58550134`, see §3/§3a). `git diff src/app/people/page.tsx` shows it. **Do not
  commit until the 3 interactive criteria are verified signed-in.**
- **`git log origin/main..HEAD` is empty** (all committed work pushed). Tree is clean **except** the
  one held file above (expected).
- **No open branches** other than `main`. No decisions made-but-unimplemented beyond what's listed in
  §3/§4/§5.
- A dev preview server was running during this session (Claude Preview, port 3000); it can be
  restarted with `preview_start` (`.claude/launch.json` → `dev`). DB access for probes:
  `npx dotenv-cli -e .env.local -- npx tsx scripts/<x>.ts` (uses `DIRECT_URL` = production Supabase
  `db.shlyuoeabdaifketvaeo.supabase.co`). **Capture-and-restore any test data you mutate** (this
  session flipped a user's `is_private` to verify privacy and restored it).
