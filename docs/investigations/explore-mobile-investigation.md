# Phase 7a — Explore mobile investigation (read-only findings)

Date: 2026-06-13. Scope: map the Explore mockup
(`design/mobile/crossshelf-mobile-explore.html`) to the current Explore route, identify
reuse vs. new, flag any data-less UI. **No code written. Stop for approval before 7b.
Explore page only.** This is the largest mobile page (`src/app/explore/page.tsx`, 1,149
lines) — the plan leans on the **Option-C hybrid** (restyle heavy islands in place,
mobile-recompose only the filter controls).

Route: `src/app/explore/page.tsx` (client, `Suspense` + `ExploreContent`). Data:
`/api/catalog/counts`, `/api/explore/filters`, `/api/catalog`, `/api/search?grouped=true`,
`/api/upcoming`. **Public page — verifiable logged-out** (unlike Library).

---

## 1. What the current Explore route actually is (vs. the handoff's "4 modes")

It is **not** four tab-switched modes. It's a single storefront with two states driven by
`selectedType`:

- **SearchBar** (with a recent-searches dropdown). When the query ≥2 chars → a **grouped
  search-results view** replaces the page (franchise match, genre/vibe suggestions, "best
  match" card, per-type `ScrollRow`s).
- **Compact media-type row** — chips with counts (movies/tv/anime/books/…); tapping one sets
  `selectedType`.
- **Default storefront** (`!selectedType`): **three always-visible filter rows** (Genre /
  Vibe / Tag — each a scroll-pill strip + an "All X" dropdown panel), then **per-type
  `MediaTypeRow` horizontal scroll rows**, then **Coming Soon**.
- **Filtered view** (`selectedType` set): genre sub-pills + vibe pills + a sort `<select>`,
  then a **responsive grid** (`auto-fill minmax(140px)`) + **Load More**.

So the "modes" the brief refers to map to: **default (all type rows)** ↔ **type-selected
(one type, grid)** — already implemented via `selectedType`.

## 2. Mockup → mobile treatment, and how "mode switching" works

| Mockup element | Current | Mobile treatment |
|---|---|---|
| Prominent **search bar** | `SearchBar` exists (inline; results replace page) | Restyle in place (Option C). **Keep inline search** — the mockup's "full-screen search" is explicitly "not designed yet". |
| **9 type chips, non-scrolling**, text+count stacked, color-coded | compact chip row (horizontal scroll, icon+label+count) | **New mobile recompose:** 9 chips in one non-scrolling row (label over count), all 9 fit at 380px. Tap = `setSelectedType`; tap active = clear. |
| **"Building" markers** on Music/Podcasts | none | **New + DATA FLAG (§5 Q3).** No catalog-status field exists — purely editorial (music ~200, podcasts ~475). |
| **FILTERS button + applied-state text + sort** (one row) | three always-visible filter rows + a `<select>` sort | **New mobile recompose:** collapse the three rows into a **FILTERS button → BottomSheet** (reuse Phase-1 `BottomSheet`); show "Showing all" / "Filters: Dark, Sci-Fi" applied text; sort label on the right. |
| **Filter sheet** (Genre/Vibe/Tag multi-select) | the three desktop rows (data: `/api/explore/filters`) | **New:** move the same pills into the BottomSheet. Data already exists. |
| **Per-type sections** (header + count + "See all →" + h-row) | `MediaTypeRow` + `ScrollRow` | **Restyle in place** (Option C). Cards → ~110px (token). |
| **Type-selected → 2-col vertical grid**, others hidden | filtered `auto-fill minmax(140px)` grid | **Restyle:** 2-col grid on mobile via the card tokens (same as Library/Profile). |
| **"See all →"** → `/explore/[type]` | links to `/explore?type=X` (the filtered grid) | Keep `?type=` (works). Mockup's `/explore/movies` route doesn't exist — not needed. |
| Coming Soon | `ScrollRow` of `UpcomingCard` | Restyle in place. |

**Mode-switch model on mobile:** identical to today — tap a type chip → that type's section
becomes the 2-col grid, others hidden; tap the active chip → back to all-type rows. No new
tab bar; the BottomNav already marks Explore active.

## 3. Per-type discovery rows ("moved from For You to Explore")

**Confirmed already here.** The default storefront renders per-type `MediaTypeRow`
horizontal rows (`/api/catalog?type=…&forYou=1` shuffle when unfiltered). That earlier
decision has already landed — nothing to move; the mockup's per-type sections *are* these
rows. We just re-skin the cards.

## 4. Reuse vs. new

**Reuse:**
- `SearchBar` + the grouped search-results view (Option C: restyle, don't rebuild).
- `MediaTypeRow` / `ScrollRow` (per-type rows) — re-skin cards.
- `Card` — token-sized to ~110px rows / 2-col grid via `--card-w`/`--card-cover-h` scoped on
  an `.explore-root` parent (never edit Card; same overflow-containment fix as Library/Profile).
- **`BottomSheet`** (Phase 1) — the filters sheet. **First real use of this primitive on a page.**
- All existing APIs + the `selectedGenres/Vibe/Tag/sort` state + URL sync.
- `UpcomingCard`, `getTagDisplayName`, `VIBES`/`TYPES`/`ALL_GENRES`/`ALL_VIBES`.
- **Not** `useScrollDirection` (per the brief — the storefront doesn't need smart-hide).

**New (mobile recompose, scoped ≤640):**
- 9-chip non-scrolling type row (label-over-count) + "Building" markers.
- FILTERS button + applied-state text + sort control row.
- Filter `BottomSheet` contents (Genre / Vibe / Tag multi-select — recompose the three rows).
- 2-col grid styling for the type-selected view.
- Card down-sizing tokens for the rows.

**Option-C split:** restyle in place → search view, `MediaTypeRow`/`ScrollRow`, Coming Soon,
the grid. Mobile-recompose → the type-chip row + the FILTERS/sort controls + the sheet.
Desktop keeps its three-row filter layout untouched (the mobile controls are a separate
`.explore-mobile-controls` branch; the desktop rows get `display:none` ≤640).

## 5. Decidable questions

**Q1 — Mode model.** Confirm: default = per-type horizontal rows; tapping a type chip →
that type as a **2-col vertical grid**, others hidden (existing `selectedType`); tap active
chip → back. Re-skin the existing filtered grid to 2-col on mobile. OK?

**Q2 — Filters → BottomSheet.** Consolidate the three desktop filter rows (Genre / Vibe /
Tag, multi-select) into a Phase-1 `BottomSheet` opened by a teal **FILTERS** button, with
"Showing all" / "Filters: …" applied text on the bar. Desktop keeps its three-row layout
(≤640 only). Reuse `BottomSheet`, don't fork. OK?

**Q3 — "Building" indicator (DATA FLAG — the For-You-vibe-catch discipline).** No
catalog-status field exists; it's editorial. Options: **(a)** a small hardcoded set
`BUILDING_TYPES = {music, podcast}` (recommended — matches the mockup's explicit choice,
honest, trivial), or **(b)** a count threshold (e.g. `< 1000`), which would also flag Comics
(238). Recommend **(a)**. Either way it's a presentational marker over the real count, not
fabricated data.

**Q4 — Sort control placement on mobile.** The mockup shows a sort label ("↓ POPULAR") on
the filter bar. Put sort: **(a)** as a tappable label on the bar opening a small sheet/menu,
or **(b)** inside the FILTERS BottomSheet as one more section. Recommend **(a)** (matches the
mockup's bar placement; keeps the sheet to Genre/Vibe/Tag). The 7 existing `SORT_OPTIONS`
carry over.

**Q5 — Search behavior.** Keep the **existing inline search** (query replaces the page with
grouped results) rather than build the mockup's "full-screen search experience" (explicitly
undesigned)? Recommend **keep inline** — restyle the results view for mobile, flag full-screen
search as a future mini-mockup.

**Q6 — Card size.** Rows use ~110px cards, the type-grid 2-col. Tokenize `Card` down via
`--card-w` on `.explore-root` (rows) and `--card-w:100%` in the 2-col grid (same pattern as
Library/Profile, incl. the HoverPreview overflow-containment fix). OK?

## 6. Proposed 7b commit plan (after approval)

1. Mobile shell + type-chip row (9 chips, counts, Building markers) + `.explore-mobile`/
   `.explore-desktop` control split (desktop three-row filters hidden ≤640).
2. FILTERS button + applied-state + sort control, opening the `BottomSheet` with the
   Genre/Vibe/Tag multi-select (reuse `BottomSheet`).
3. Per-type rows re-skin (card down-sizing tokens, header/See-all styling, Coming Soon).
4. Type-selected 2-col grid (mobile) + overflow containment.
5. Search-results view mobile restyle (Option C in place).

**Constraints honored:** class-driven CSS + `<style>` blocks; desktop visually unchanged
>640; tokenized card sizing; hide-don't-placeholder; reuse `BottomSheet`/`Card`/`ScrollRow`;
no fork. **Verification:** tsc + build clean; 380 + 1280; verify each state (default rows,
type-selected grid, filters sheet, search results) vs the mockup. Explore is public, so most
is verifiable logged-out; Card's owner-stars + recent-searches need a note. I'll add any
residual signed-in items to the consolidated checklist (Deliverable A).
