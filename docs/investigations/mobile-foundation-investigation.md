# Mobile Foundation — Read-Only Investigation & Implementation Plan

**Date:** 2026-06-12
**Scope:** Read-only. No code changes, no migrations. Frontend audit only; the daily re-enrichment job (items-table writes) is untouched and unaffected.
**Mockups:** the 9 mobile mockup HTML files are not in the repo — confirmed by search. Fine for this phase; the implementation sessions will need them supplied (recommend committing them under `design/mobile/` as durable references).

---

## Section 1 — Current responsive setup

- **Viewport meta:** no explicit `export const viewport` in [layout.tsx](src/app/layout.tsx) — Next.js App Router injects the default `width=device-width, initial-scale=1` automatically. Adequate; an explicit export is only needed if we want `viewport-fit=cover` for notch handling (we will — see §7).
- **Existing breakpoints (inconsistent set):** globals.css uses **480 / 640 / 768**; per-component `<style>` blocks add **639 / 1023 / 1024 / 1920** (cross-your-shelf, taste-identity-card, whats-happening, _page-impl). So the de-facto system is ~`640/768/1024` with off-by-one drift (639 vs 640, 1023 vs 1024). No tokens; every component hardcodes its own numbers.
- **Behavior at 380px today:** *partially* responsive, not just shrunk desktop. Real treatments exist: nav collapses to hamburger + slide-out ≤640 ([nav.tsx:43-54](src/components/nav.tsx:43)), item hero stacks vertically ≤768 with 80px cover ([globals.css:155-168](src/app/globals.css), [_page-impl.tsx:509-519](src/app/item/_page-impl.tsx:509)), For You's taste filter bar stacks ([page.tsx:544-560](src/app/page.tsx:544)), cross-your-shelf/picked-for-you/taste-card/whats-happening have ≤639/≤1023 rules, content padding drops to 16px. But **Explore, Library, People, and the user profile have zero media queries in-page** — they survive on flex-wrap behavior alone.
- **Mobile-specific components/routes:** none. One mobile-conditional behavior: hover-preview disables itself under 640px ([hover-preview.tsx:29](src/components/hover-preview.tsx:29)).
- **Dead mobile CSS (gotcha):** globals.css defines `.card-mobile`, `.touch-target`, `.explore-type-grid`, `.explore-genre-pill`, `.explore-vibe-pill` — **referenced by zero components**. Leftovers from an earlier mobile pass; misleading when auditing what's actually applied.

## Section 2 — Component inventory (what mobile work touches)

| Component | Location | Current responsive behavior | Mobile-mockup change needed |
|---|---|---|---|
| `Card` (the universal item card) | [card.tsx](src/components/card.tsx) | Fixed `flex: 0 0 150px`, 210px cover, inline styles; the `.card-mobile` class that would shrink it to 130px is **never applied** | Needs the mockups' card size(s); decide token-driven width vs the dead class. Used by every row everywhere — change once, affects all |
| `SkeletonCard`/`SkeletonRow` | [skeleton-card.tsx](src/components/skeleton-card.tsx) | Fixed 150px to match Card | Must track Card's mobile dimensions |
| `ItemPageSkeleton` | [item-page-skeleton.tsx](src/components/item-page-skeleton.tsx) | Inherits `.hero-layout`/`.hero-cover` global rules (cover squeezes to 80px ≤768) | Re-shape to the mobile detail mockup once the real page changes |
| Library card | inline in [library/page.tsx:55-95](src/app/library/page.tsx:55) (not a shared component) | flex-wrap only | Mockup's library row/grid; consider extracting a real component while touching it |
| `PickedForYouGrid` | picked-for-you-grid.tsx | own ≤768/≤639 rules (raw `<img>`) | Align to mockup grid |
| `CrossYourShelf` | cross-your-shelf.tsx | own ≤639/≤1023/≥1920 rules; three-mode framing logic | Mockup has a dedicated mobile treatment; logic untouched, layout only |
| Status pills / type badges | scattered: `status-tracker.tsx`, badge markup inline in Card, `rec-tag.tsx`, `item-sub-banner.tsx` | none | Mockups' pill/badge spec; **duplicated badge-rendering in Card vs upcoming-card vs library row is consolidation-worthy** |
| Filter UI | `TasteFilterBar` (inline in page.tsx), Explore's filter pills (inline in explore/page.tsx), Library per-section pills (inline) | For You bar stacks ≤768; Explore/Library none | Mockups use bottom-sheet filters on mobile → new shared component; the three inline filter implementations are the consolidation opportunity |
| Header/nav | [nav.tsx](src/components/nav.tsx) | ≤640: tabs hidden, hamburger + right slide-out panel | **Replaced by bottom tab bar on mobile** (§4) |
| Tabs (Library status sections, Explore modes) | inline per page | none | Mockup treatments per page |
| `GlobalSearch` | global-search.tsx | dropdown width hack ≤768 (`calc(100vw - 32px)`, `right: -60px`) | Mockups likely want full-screen search overlay on mobile |
| `HoverPreview` | hover-preview.tsx | disabled <640 | Correct behavior; keep |
| `ScrollRow` | scroll-row.tsx | none (horizontal scroll works on touch natively) | Probably fine; check snap behavior vs mockups |

**Styling idiom across all of these:** inline `style={{}}` objects + small per-component `<style>` tags with `!important` overrides. There is no styled-system or Tailwind usage in components (Tailwind is installed and configured with token-mapped colors but essentially unused in markup). Mobile work must either continue the `<style>`-tag pattern or introduce a small set of global utility classes — **not** per-element Tailwind, which would clash with the codebase idiom.

## Section 3 — Global styles

- **Color tokens** ([globals.css:7-49](src/app/globals.css)): complete and healthy — `--bg-page/card/elevated`, `--accent`, 8 `--media-*` colors, 3 `--score-*`, `--surface-1..5` (white-alpha ramp), `--border`, `--text-primary/secondary/muted/faint`. Mobile work should need **zero new colors**.
- **Spacing/typography tokens:** none — all spacing/font sizes are hardcoded inline. Mockup-matching will be by-hand values; introducing spacing tokens is optional, not required.
- **Utility classes:** `.content-width` (1800px cap, 24px→16px padding), `.scrollbar-hide`, `.skeleton-shimmer` + `.skeleton-pulse`, `.fade-in`, focus-visible rules, plus the **dead** mobile classes (§1).
- **Skeleton pattern:** `.skeleton-shimmer` (the one loading.tsx uses) — established and mobile-compatible as-is.
- **Fonts:** `next/font/google` for Playfair Display (`--font-serif`) + DM Sans (`--font-sans`) with CSS-variable wiring — already optimal, self-hosted, no FOUT concerns on mobile.

## Section 4 — Navigation architecture

- **Today:** sticky top header = logo row + tab row (For You/Explore/Library/People). ≤640px the tab row hides and a **hamburger → right slide-out panel** appears. Tabs carry refresh-on-active-tap behavior (`literacy:refresh-foryou` / `literacy:refresh-explore` events) — **the bottom nav must preserve these**, and the For You snapshot work will later repurpose that same event.
- **Recommended architecture: one new `BottomNav` component + CSS-only switching.** Keep `Nav` as-is (it already hides its tabs ≤640); add `BottomNav` rendered in `layout.tsx`, `display: none` above the breakpoint, `position: fixed; bottom: 0` below it. Don't merge into one mega-component — the two navs share only the 4-item tab list (extract `tabs[]` to a tiny shared module) and have totally different layouts. The hamburger slide-out then becomes redundant for primary nav (keep it briefly, or reduce it to secondary links — settings/profile — per the mockups).
- **Breakpoint:** **640px**, because nav already switches there — making bottom-nav appear exactly where top-tabs disappear gives no dead zone. (Standardize the system on `640 / 768 / 1024` and fix the 639/1023 stragglers opportunistically.)
- **Required side effects:** global bottom padding on `<body>`/main content below 640 so fixed bottom nav doesn't cover content; `env(safe-area-inset-bottom)` padding (nothing in the codebase handles safe areas today); z-index coordination (header is z-50, mobile panel z-200).

## Section 5 — Page-by-page mobile readiness

| Route | Rendering | Current responsive state | Structural change for mockup | Complexity |
|---|---|---|---|---|
| `/` For You | Client | Best-covered page: taste bar stacks, cross-shelf/picked-grid/whats-happening have rules; rows scroll horizontally (touch-friendly) | Mostly **tuning to mockup**: card sizes, section spacing, bottom-nav clearance; identity card mobile layout | **Medium** (volume, not difficulty — 933 lines + 5 subcomponents) |
| `/[type]/[slug]` detail | **Server** | Hero stacks ≤768 (80px cover), sub-banner stacks; right panel wraps | Mockups (full + sparse states) likely re-order hero → score strip → actions; smart-hide action bar (§6); skeleton must follow | **Large** (the richest page: hero, scores, where-to, reviews, recommendations, franchise, DLC) |
| `/item/[id]` legacy | Server | Same impl | Inherits slug-route work + skeleton | Small (free rider) |
| `/library` | Client | flex-wrap only; `.library-grid` gap tweak; inline card markup | Mockup grid/rows, status tabs, per-section filter pills → bottom sheet; good moment to extract the inline card | **Medium-large** |
| `/explore` | Client | **No in-page rules**; auto-fill grid `minmax(140px,1fr)` accidentally works at 380px (2 cols); dead `.explore-*` classes | Four browse modes + filter bar → mockup treatment, bottom-sheet filters, search affordance | **Large** (1,148 lines, most distinct UI modes) |
| `/people` | Client | **None** | Search-first layout, activity feed cards per mockup | **Medium** |
| `/user/[id]` public profile | Client | **None** | Public + private states per mockups (2 of the 9), stats header, library-by-status | **Medium** |
| Cross your shelf | component on `/` (no dedicated route) | own ≤639 rules | Mockup's mobile treatment of the connection card | Small-medium (within For You scope) |

## Section 6 — Cross-cutting new work the mockups require

1. **`BottomNav`** — new global component (§4) + body clearance + safe-area. **Small-medium.**
2. **Breakpoint standardization** — pick `640/768/1024`, fix 639/1023 drift, delete dead mobile classes, optionally expose as CSS custom media/comment block. **Small.**
3. **Smart-hide-on-scroll hook** — `useScrollDirection` (hide action bar on scroll-down, reveal on scroll-up); new `src/lib/` hook; consumers: detail-page action bar, possibly bottom nav. **Small.**
4. **Bottom-sheet component** — shared sheet (backdrop, drag-handle, snap-close) for Explore/Library filters; the codebase has a precedent pattern in nav's slide-out panel (fixed + backdrop, z-200). **Medium** (gesture polish is where scope hides).
5. **Viewport/safe-area** — explicit `export const viewport` with `viewportFit: "cover"` + `env(safe-area-inset-*)` paddings for bottom nav and any fixed action bars. **Small.**
6. **Icon set** — current nav/type icons are text glyphs (✦ ◎ ▤ ◉) and emoji; if mockups use different mobile icons, extract an `Icons` module; otherwise reuse. **Small/none — pending mockup check.**
7. **Mobile search overlay** — GlobalSearch's negative-offset dropdown hack won't satisfy a mockup-grade mobile search; likely a full-screen overlay variant. **Medium** (can be deferred; current hack functions).

## Section 7 — Risks and gotchas

- **For You randomize-per-load:** does **not block** mobile foundation — layout and data are orthogonal, and rows already render from the same components. But it *interacts*: mobile users background/resume tabs constantly, so content-shift is felt even more on mobile, and the planned snapshot work will change For You's loading states. **Mitigation:** build mobile For You against current behavior, keep loading-state markup in the shared row components so the snapshot swap is invisible to mobile layout. Don't redesign For You's loading UX twice — keep that part minimal until the snapshot lands.
- **Inline-styles + `!important` override pattern:** the codebase's mobile rules work by `!important`-overriding inline styles from `<style>` tags. This is fragile at scale — ordering battles and specificity knots will surface as more mobile rules pile on. **Mitigation:** for *new* mobile work, prefer class-driven layout (className grids/flex) over inline-style-plus-override; refactor only the components being actively restyled.
- **`Card` is global blast radius:** every surface renders the same Card. A mobile resize ripples into desktop rows, skeletons, explore grid, recommendations. **Mitigation:** make Card's width a prop/CSS-var driven value with the current 150px default; change surfaces one at a time.
- **Explore is the scope sink:** 1,148 lines, 4 browse modes, filters, search results — the most likely page to blow up an estimate. Schedule it last among pages, after the bottom-sheet + patterns exist.
- **Hamburger/bottom-nav overlap ambiguity:** shipping bottom nav while the hamburger still exists creates two navigation systems ≤640. Decide the hamburger's fate (kill vs secondary menu) in the first nav PR, not later.
- **Device quirks:** no `safe-area` handling exists (iOS notch/home-indicator will overlap fixed bottom nav — must use `env(safe-area-inset-bottom)`); iOS Safari dynamic toolbar means `100vh` is unreliable (use `100dvh` if any full-height sheets are built); Android keyboard resizes the viewport under fixed bottom bars (hide bottom nav when inputs focus, or accept overlay); `position: sticky` header + fixed bottom nav both consuming z-index needs one documented scale.
- **Two For You data consumers already exist** (`/` page rows + the future snapshot). Avoid forking mobile/desktop *pages*; this must stay one responsive page per route, or the snapshot work doubles.

---

## Recommended implementation sequence

**Phase 0 — Foundation (1 session, small):**
viewport export + safe-area groundwork → breakpoint standardization (640/768/1024, fix 639/1023, delete dead classes) → `BottomNav` + body clearance + hamburger decision → shared `tabs[]` module. *Ship: the app is navigable mobile-first everywhere, nothing else changed.*

**Phase 1 — Shared primitives (1 session, small-medium):**
`useScrollDirection` hook → bottom-sheet component → Card width prop/tokenization (+ SkeletonCard parity). *Ship: building blocks exist, no page redesigned yet.*

**Phase 2 — Pages, in this order (1 session each):**
1. **For You** (medium — best existing coverage, highest traffic, validates BottomNav + Card sizing against the busiest layout; includes Cross your shelf mobile treatment)
2. **Item detail full+sparse** (large — server-rendered, includes smart-hide action bar + skeleton update; legacy `/item/[id]` rides along)
3. **Library** (medium-large — extract inline card, status tabs, bottom-sheet filters debut)
4. **People + Public profile public/private** (medium — three mockups, shared patterns)
5. **Explore** (large — last, leans on every primitive built before it)

**Phase 3 — Polish (small):** mobile search overlay, icon alignment, quirk fixes from device testing.

## Complexity summary

| Phase | Size |
|---|---|
| 0 Foundation | Small |
| 1 Primitives | Small-medium |
| 2.1 For You | Medium |
| 2.2 Item detail | Large |
| 2.3 Library | Medium-large |
| 2.4 People + profile | Medium |
| 2.5 Explore | Large |
| 3 Polish | Small |

## Is it safe to start now?

**Yes — start immediately, alongside re-enrichment.** This work is entirely frontend (components, CSS, layout files); re-enrichment writes only the `items` table and shares zero files with this workstream. The only coordination point is **For You**: its loading/refresh UX will change when the snapshot work lands, so mobile For You should style the *existing* row components without inventing new loading flows — then the snapshot drops in underneath untouched. One logistics item before Phase 2: **get the 9 mockup HTML files into the repo** (e.g. `design/mobile/`) so implementation sessions can read them directly.
