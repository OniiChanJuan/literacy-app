# Franchise data-source unification — investigation (read-only findings)

Date: 2026-06-13. Scope: why the mobile item-detail franchise strip doesn't render for
DB-backed franchises (e.g. *LOTR: The Return of the King*), and how to unify. **No code
changed. Stop for approval before implementation.**

---

## 1. The two franchise data sources

| | **Static lib** (`src/lib/franchises.ts`) | **DB** (`Franchise` model) |
|---|---|---|
| Count | **6 hardcoded** (dune, the-witcher, attack-on-titan, the-last-of-us, cyberpunk, chainsaw-man) | **964 franchises, 4,258 links, 3,988 distinct items** |
| Key | `slug` (string, e.g. `"dune"`) | `id` (int autoincrement). **No `slug` column.** |
| Items | `items[].routeId` (e.g. `"10"`, `"tmdb-movie-438631"`) + `type` + `title` | `FranchiseItem(franchiseId, itemId)` → real `Item` rows; hierarchy via `parentFranchiseId` |
| Surfaced via | `getFranchiseForItem(routeId)` (sync lookup) | `GET /api/franchises?itemId=<n>` (returns `{id, name, icon, color, totalItems, otherItems[], parent/sibling/child}`) |
| Consumed by | **mobile strip** + **desktop `FranchiseBadge`**, both link `/franchise/${slug}` | the franchise **page** `/franchise/[slug]` → `GET /api/franchise/[id]` |

## 2. The actual bug (it's bigger than "missing slug")

The mobile strip (`mobile-item-detail.tsx:121`) and desktop `FranchiseBadge` use
`getFranchiseForItem(routeId)` — the **static lib only**. They **never query the DB**. So:

1. **They render only for the 6 static franchises** — every DB-only franchise item
   (≈3,988 items, incl. LOTR ROTK) gets no strip. ← the reported bug.
2. **Their links are also broken.** They link `/franchise/${franchise.slug}` (e.g.
   `/franchise/dune`). But the franchise page's API, `/api/franchise/[id]`, does
   `parseInt(id)` and `findUnique({ where: { id } })` — **numeric ids only.** Verified live:
   - `GET /api/franchise/dune` → **400 "Invalid ID"** (page shows "Franchise not found").
   - `GET /api/franchise/391` (Dune's DB id) → 200. `GET /api/franchise/427` (LOTR) → 200.

   So the static strip "renders" but its link is a dead end. The franchise page is already
   **fully DB-driven by numeric id** — all the page's own links use `/franchise/${id}`
   (e.g. People Following, search match, sub-universe chips).

**Concretely for LOTR ROTK** (item `1353`): not in the static lib → no strip. It *is* in DB
franchises **427 "The Lord of the Rings" (24 items)** and parent **575 "Middle-earth" (23)**.
`GET /api/franchises?itemId=1353` → 200, returns Middle-earth (575). `/franchise/427` and
`/franchise/575` both resolve. So the fix path works today with zero schema change.

## 3. Overlap (determines direction + scope)

The DB is a near-superset; **all 6 static franchises already exist in the DB**, with richer data:

| Static franchise | DB? | DB id · items (static had) |
|---|---|---|
| Dune | ✅ | 391 · 8 (2) |
| The Witcher | ✅ | 462 · 21 (2) |
| Attack on Titan | ✅ | 414 · 12 (2) |
| Chainsaw Man | ✅ | 396 · 4 (2) |
| Cyberpunk | ✅ | 533 · 3 (2) |
| The Last of Us | ✅ (different name) | 548 "The Last of Us universe" · incl. items 17/486/1459/1460/1462 |

→ **Pointing the strip at the DB loses nothing** — every static-franchise item is also in a
DB franchise. The static lib is effectively vestigial. Direction: **unify toward the DB.**

## 4. Fix options

**Option A — point the strip (and badge) at the DB API, link by numeric id. ✅ Recommended.**
No schema change, **no slug needed** (the page route already resolves numeric ids). Replace
`getFranchiseForItem(routeId)` with a fetch to `GET /api/franchises?itemId=${item.id}`; render
the strip from the response; link `/franchise/${franchise.id}`. Fixes ~3,988 items incl. LOTR
**and** fixes the broken-link bug. Minimal, correct, low-risk.

**Option B — add `slug` to DB franchises (generate/store, return from API, route by slug).**
*Unnecessary for the fix* — numeric ids already work end-to-end. It's a future nicety for
prettier URLs (`/franchise/the-lord-of-the-rings` vs `/franchise/427`) and would need a
migration (add column, backfill unique slugs for 964 rows, make `/api/franchise/[id]` resolve
slugs too). Over-scoped for this bug; can be a separate enhancement.

**Option C — keep the static lib, add slug-resolution as a fallback in `/api/franchise/[id]`.**
Rejected — doesn't fix the DB-only items (the actual bug); only patches the 6 static links.

**Recommendation: Option A.**

## 5. Desktop impact (flagged per the prompt)

The desktop **`FranchiseBadge`** (`src/components/franchise-badge.tsx`) has the **identical
bug** — same `getFranchiseForItem` + `/franchise/${slug}` broken links. Both components are
rendered from the same item page (`src/app/item/_page-impl.tsx`: `MobileItemTop` line 212,
`FranchiseBadge` line 218), and `item.id` (numeric) is available to both.

So fixing this "inherently corrects the same bug on desktop." Two choices:
- **(b, recommended) Unify both** via one shared hook → desktop badge now also renders for DB
  franchises with working links. This **is a desktop visual change** (badges appear on far more
  item pages; links start working) — but it's a **correctness fix, not a redesign**, exactly the
  case the prompt allows. **Flagging it as expected.**
- (a) Mobile strip only — leaves the desktop badge rendering for 6 franchises with dead links.
  Inconsistent; not recommended.

## 6. Minor notes / risks
- **Position label.** The strip shows "Movie 1 of 3" from the static item order.
  `/api/franchises?itemId=` returns `totalItems` + `otherItems` (excludes the current item) but
  not the current item's index → precise position isn't directly available. The strip already
  has a **"N entries" fallback** — use it for DB franchises (honest; no overclaimed position).
  A later API tweak could return position if wanted.
- **"Most specific" quirk.** `/api/franchises?itemId=` picks the smallest franchise by item
  count; for ROTK it returned the parent **Middle-earth (575, 23)** over **LOTR (427, 24)** on a
  1-item difference. Both links valid; cosmetic, not a blocker.
- **Per-item fetch.** The strip becomes a client fetch (was a sync lookup). The endpoint is
  CDN-cached (`s-maxage=300`); the item page already fires `/api/items/[id]/aggregate`, so this
  is one more cheap call. Strip appears after the fetch resolves (hide-until-known — fine).
- `src/lib/franchises.ts` becomes unused after this; can be deleted or left as dead code.

## 7. Proposed implementation plan (Nb, after approval)
1. Shared hook `useItemFranchise(itemId)` (fetch `/api/franchises?itemId=`, return franchise|null).
2. Wire the **mobile strip** to it — render from DB data, link `/franchise/${id}`, "N entries".
3. Wire the **desktop `FranchiseBadge`** to it (pass `item.id`), link `/franchise/${id}`.
   *(Desktop correctness change — flagged.)*
4. Remove the now-dead static `getFranchiseForItem`/`lib/franchises` usage (optional cleanup commit).

**No migration.** **Verification:** LOTR ROTK shows the strip on mobile (380px) linking to a
resolvable `/franchise/[id]`; a static franchise (Dune) still shows its strip; desktop badge now
renders for DB franchises; tsc + build clean. Public pages — verifiable logged-out.
