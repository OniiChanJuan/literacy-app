# For You Caching & Smoothness — Read-Only Investigation

**Date:** 2026-06-10
**Scope:** Read-only. No code changes, no migrations, no scripts run (one SELECT-only timing query against the candidate pool; the re-enrichment job was untouched).

---

## Section 1 — Current For You content generation

The page is composed of **many independently-fetched rows**, all funneling through two API routes:

- [api/for-you/route.ts](src/app/api/for-you/route.ts) — `?section=personalPicks` / `?section=discoverAcrossMedia` (+ a legacy combined shape, and a lightweight `/api/for-you/profile`)
- [api/catalog/route.ts](src/app/api/catalog/route.ts) — `?curated=top_rated|popular|hidden_gems` and 9 per-type `?type=X&forYou=1` lazy rows

**Where the variability comes from:** a `Math.random()` Fisher-Yates `shuffleAndPick` applied **server-side on every request**, in both routes ([for-you:8-16](src/app/api/for-you/route.ts:8), [catalog:11-21](src/app/api/catalog/route.ts:11)). It is *not* `ORDER BY RANDOM()` and *not* date-seeded — the underlying pool is deterministic (score-sorted), and the shuffle is pure per-request noise:

- `personalPicks`: top-80 taste-scored pool (max 25%/type) → shuffle → pick `limit` with 20%/type cap ([for-you:277-316](src/app/api/for-you/route.ts:277))
- `discoverAcrossMedia`: pool of 120 weighted to unexplored types → shuffle → pick with 35%/type cap ([for-you:323-398](src/app/api/for-you/route.ts:323))
- catalog `top_rated`/`popular`/`hidden_gems` and every per-type lazy row: same pattern — build quality pool, shuffle on `offset === 0` ([catalog:236](src/app/api/catalog/route.ts:236), [290](src/app/api/catalog/route.ts:290), [442](src/app/api/catalog/route.ts:442), [521](src/app/api/catalog/route.ts:521))

**Per-user vs global:** the *scoring* is per-user (tasteProfile × itemDimensions at 60/40 with quality, exclusion of rated/dismissed items). The *shuffle* is per-request. So two loads by the same user differ purely from request-level randomness — the worst of both worlds for caching: personalized enough that you can't share a cache across users, random enough that you can't even cache per user.

**Caching today:**
- An **in-memory candidate-pool cache** (top-3,000 items, TTL 120s, with in-flight dedup) shared across users ([for-you:48-79](src/app/api/for-you/route.ts:48)). Caveat: it's per-serverless-instance memory — on Vercel every cold start or parallel instance re-fetches.
- Response headers: section responses are **`private, no-store`** (explicitly uncacheable, [for-you:270,318,400](src/app/api/for-you/route.ts:318)); catalog's randomized rows use `jsonResponseNoCache` ([catalog:21](src/app/api/catalog/route.ts:21)). The legacy combined shape allows `max-age=60` browser cache.
- No Redis/Upstash/KV anywhere; no Next.js route caching (all client-side `fetch` of API routes).

**Query weight (measured cold, via pooler):** the candidate-pool query — top 3,000 items with `description`, `people`, `ext`, `itemDimensions` — took **~2.5s and serializes to ~3.5 MB** (that's Supabase→Vercel egress per uncached fetch). An ids-only variant takes 93ms, so the cost is row width, not the scan. Per request after the pool: 3 cheap per-user queries (user, ratings, dismissed).

**Response size to the browser:** well-trimmed — `slimExt`, 280-char description truncation, 3 people max ([for-you:26-46](src/app/api/for-you/route.ts:26)). A 30-item row ≈ 25-40 KB. The browser-facing payload is *not* the problem; the DB-side pool fetch is.

---

## Section 2 — Routing and caching across the app

| Route | Component model | `loading.tsx` | Data fetching |
|---|---|---|---|
| For You (`/`, [page.tsx](src/app/page.tsx), 933 lines) | **Client** (`"use client"`) | ❌ none | ~6-8 parallel client fetches on load (upcoming, profile, picked-for-you, cross-shelf, whats-happening, discover row, top_rated row) + ~11 more lazy rows via IntersectionObserver. No persistence — **all state is `useState`; navigating away discards everything, returning refetches everything and the server reshuffles** → this is the back-button surprise, precisely. |
| Explore ([explore/page.tsx](src/app/explore/page.tsx), 1,148 lines) | Client | ❌ | Client fetches of `/api/catalog` + `/api/explore/filters` |
| Library ([library/page.tsx](src/app/library/page.tsx)) | Client | ❌ | Client fetches |
| People ([people/page.tsx](src/app/people/page.tsx)) | Client | ❌ | Client fetches |
| Item detail ([\[type\]/\[slug\]/page.tsx](src/app/[type]/[slug]/page.tsx)) | **Server** + `export const revalidate = 300` (ISR ✅) | ❌ | Server-side prisma for the item; client components then fetch `/api/scores`, `/api/items/[id]/aggregate`, reviews, recommendations |

- **Navigation is healthy:** `<Link>` everywhere that matters — nav (4 Links, 0 `<a>`), cards ([card.tsx:48](src/components/card.tsx:48)). The only raw `<a href>` internal links are static legal pages (privacy/terms/do-not-sell) — harmless.
- **Zero `loading.tsx` files exist in the entire app.** For the client pages this matters less (they render shell immediately and skeleton in-component — `skeleton-card.tsx` exists and rows use their own placeholders), but the **item detail page is a server component with no loading boundary**: clicking a card blocks navigation until the server render completes. This is the single most-felt "unsmooth" moment.
- **Waterfalls:** For You's row fetches are parallel (good). Mild waterfall on detail pages (server render → then client sub-fetches for scores/aggregate/reviews). One real repeat-fetch pattern: `/api/items/[id]/aggregate` is fetched by `item-sub-banner` and would be fetched again by any other aggregate consumer; CDN's 60s cache absorbs most of it.
- **Scroll restoration is already handled** — `useScrollRestore` saves/restores window + row scroll via sessionStorage, and `experimental.scrollRestoration` is on. **The infra for "return to where you were" exists; it's the *content* that shifts under it.** Restoring scroll into a reshuffled page arguably makes the surprise worse.

## Section 3 — Image loading and bandwidth

This is in **deliberately good shape** (someone already engineered it):

- [cover-image.tsx](src/components/cover-image.tsx) is a two-tier wrapper: `optimized=true` → `next/image` (Vercel optimizer, counted against the 5,000 transformations/month quota); default `false` → plain `<img>` with `loading="lazy"` + `decoding="async"`, **served directly from the external CDNs** (TMDB/IGDB/Google/etc. — zero Vercel image bandwidth). Bulk card rows use the cheap tier; above-the-fold uses the optimizer.
- [next.config.ts](next.config.ts) has correct `remotePatterns`, webp, 31-day `minimumCacheTTL`, sensible `imageSizes`.
- Raw `<img>` usage outside the wrapper (global-search dropdown, picked-for-you-grid, cross-your-shelf, whats-happening, avatars) — all small thumbnails from external CDNs; native lazy where it matters.
- Real gotcha: **non-optimized cards load the source CDN's native resolution** (e.g. TMDB `w500` ≈ 30-60 KB for a 150px-wide card; fine) but Google Books covers with `zoom=0` can be larger. Minor, not a priority. The bigger picture: image bandwidth mostly doesn't touch Vercel at all.

## Section 4 — Prefetch behavior

- No `prefetch` props anywhere — all `<Link>`s use the App Router default ("auto").
- For **client pages** (Explore/Library/People links in nav) prefetching fetches the static shell — cheap and effective.
- For **item detail links** (cards → dynamic server route), default prefetch only preloads up to the nearest `loading.tsx` boundary — and **there are none**, so card-hover prefetch buys approximately nothing today. Adding a `loading.tsx` to the item route would make every card hover/viewport-entry prefetch the skeleton and make taps feel instant. (Flip side: hundreds of cards in viewport → prefetch chatter; the default only prefetches on hover/touch for dynamic routes, so it's contained.)

## Section 5 — Vercel / Supabase usage estimates (from code)

**Per For You load (authed, scrolled to bottom):** ~17-19 Vercel function invocations (6-8 eager + ~11 lazy rows). Each for-you section request runs 3 per-user queries + (on cache miss) the 3.5 MB pool query; each catalog row runs 1-3 queries with `take` 200-600. **Every load repeats all of it** because responses are `no-store` and the client keeps no cache.

**The #1 Supabase egress hotspot:** the 3,000-row × ~1.2 KB candidate pool (~3.5 MB) refetched on every cold/expired instance — across `for-you` instances *and* similar wide pools in `catalog` (`take: 600`/`quota*20` variants, also with `description`/`ext` selected). With even modest traffic and Vercel instance churn, this dwarfs everything else.

**#2:** repeat full-page refetches caused by the no-store + reshuffle design — including the same user bouncing back from a detail page two seconds later.

**Vercel bandwidth:** small JSON responses, images mostly external — fine. **Function invocation count** is the cost axis, and it's ~17-19× per page view where a cached design could be ~1-3×.

## Section 6 — Rate-limiting infrastructure

One mechanism exists: **`rateLimit(key, max, windowMs)` in [validation.ts:78-93](src/lib/validation.ts:78)** — a fixed-window counter in a module-level in-memory `Map`, keyed by caller-chosen strings (`for-you:${ip}`, `item-aggregate:${ip}`, etc.), used across ~20 API routes (typically 120 req/min/IP).

Properties that matter for the refresh feature: **per-serverless-instance** (resets on cold start, not shared across concurrent instances), IP-keyed (not user-keyed), no persistence, no headers beyond 429+Retry-After. Good enough as an abuse backstop; **not good enough alone for "5 refreshes per user per 24h"** — that needs a durable, user-keyed store (a small Postgres table fits fine at current scale; no need for Upstash yet).

---

## Section 7 — Design proposal: stable For You + refresh

**Core change:** move the randomness from request-time to **generation-time**, and persist the generation.

1. **Caching strategy — `for_you_snapshot` table** (per your suggestion, adapted to the row architecture):
   - Columns: `user_id`, `generated_at`, `payload` JSONB holding **ordered item-id lists per row** (`personalPicks: number[]`, `discoverAcrossMedia: number[]`, per-curated-row arrays), plus `seed`/`algo_version` for debuggability. One row per user (upsert), ~2-4 KB each. **Store ids, not item objects** — hydrate via one `WHERE id IN (...)` query at read time so covers/scores stay fresh and the snapshot stays tiny.
   - Read path: `/api/for-you` checks the snapshot; valid (<24h) → hydrate and return; missing/expired → run the existing scoring pipeline once (the shuffle happens *here*), persist, return. The existing pipeline is unchanged — only its invocation point moves.
   - Anonymous users: the page is mostly popularity rows; serve a **shared 6-hourly snapshot** (cacheable `public, s-maxage`) — anonymous loads become near-free.
   - This also fixes back-button surprise *jointly* with the existing `useScrollRestore` — stable content + restored scroll = true "you're back where you were."
   - The 120s in-memory pool cache stays (it still serves regenerations), but regenerations drop from every-request to ~1/user/day, which mostly retires the 3.5 MB egress hotspot.

2. **Refresh button:** at the top of the personalized section (near the Taste filter bar), label "↻ Refresh recommendations". Tap → optimistic spinner on the personalized rows only → `POST /api/for-you/refresh` → regenerate + persist → rows crossfade in; scroll stays put. Disabled state with tooltip when limit reached. The existing `literacy:refresh-foryou` window event ([page.tsx:601-617](src/app/page.tsx:601)) is the natural client hook — today it's wired to the nav logo and resets all rows; it would become the *only* sanctioned way content changes, now server-coordinated.

3. **Rate limiting:** 5/user/24h, enforced server-side. Simplest durable shape: an extra snapshot column (`refresh_count`, `refresh_window_start`) rather than a separate log table for *enforcement*; the *analytics* log (below) is separate. After the 5th: 429 + button disabled with "Fresh picks available tomorrow." Keep the existing IP `rateLimit()` as the burst backstop.

4. **Partial stability:** at generation time, mark the top ~35% of each personalized row (by score, pre-shuffle) as **anchors**; on refresh, keep anchors, reshuffle only the tail from the next tranche of the scored pool. Trivial to implement since the pipeline already has the full sorted `scored` array. (Note: anchors should be *positions-stable* too — keep them in their prior slots so the row visibly "keeps the good stuff.")

5. **No-button-on-fresh-content:** render the button only when `generated_at` is >4h old; before that the section header can show "Updated 2h ago" instead. Cheap — the snapshot timestamp ships with the payload.

6. **Signal capture:** insert one row per refresh into `implicit_signals` (the table already exists with a `kind` discriminator — a `refresh_foryou` kind fits; 90-day cleanup cron already prunes it). Captures user, timestamp, which anchors were kept. No new table needed.

## Section 8 — Smoothness improvements, ranked by ROI

| # | Improvement | Effort | User-visible benefit | Cost impact |
|---|---|---|---|---|
| 1 | **For You snapshot (Section 7)** — stable content per user | Medium (1 table + route refactor) | Back-button surprise gone; instant-feeling returns; page feels intentional | **Big win**: function invocations ~17-19× → ~2-3× per repeat view; retires the 3.5 MB pool refetch hotspot |
| 2 | **`loading.tsx` for `/[type]/[slug]` (item detail)** — skeleton of the detail layout | Small (one file) | Card taps respond instantly instead of blocking on server render; also unlocks Link prefetch value (§4) | Neutral |
| 3 | **Client-side response caching for row fetches** — sessionStorage-backed (or SWR-style) cache keyed by fetchUrl, honored on back-nav | Small-medium | Returning to For You/Explore renders previous data immediately (even pre-snapshot) | Fewer invocations |
| 4 | **`loading.tsx` for the four main client routes** | Tiny each | Faster perceived first paint on cold nav (shell appears during JS chunk load) | Neutral |
| 5 | **Catalog curated rows: replace shuffle with snapshot-seeded order** (folds into #1) | Folds into #1 | Rows 3-5 + 9 type rows stop reshuffling | Their `no-store` headers can become `private, max-age` |
| 6 | Cache `/api/for-you/profile` response client-side (it's refetched every visit; changes only when ratings change) | Tiny | Taste card renders instantly | Fewer invocations |
| 7 | Image polish: `sizes`/`srcset` for the few optimized images, audit Google Books `zoom=0` sizes | Small | Marginal | Marginal |

Items 1+2+3 are the package that changes how the app *feels*. 4-7 are nice-to-haves.

## Section 9 — Diagnosis and recommendation

**Is randomize-per-load the main issue? Largely yes — and it's compounding.** The per-request shuffle *forces* `no-store` everywhere, which forces full refetch chains on every navigation, which multiplies function invocations and keeps the 3.5 MB pool query hot. One design decision (request-time randomness) is upstream of (a) the UX bug, (b) the cache misses, and (c) most of the egress. The codebase is otherwise in better shape than the prompt feared: Links are right, images are deliberately cost-engineered, scroll restoration exists, the detail page already uses ISR.

**Recommended sequence:**
1. **Snapshot table + stable reads** (the enabler; ship behind the existing event hook with no UI change — content simply stops shifting)
2. **Refresh button + rate limit + partial stability** (the user-facing feature; small once #1 exists)
3. **Smoothness package** (#2-#4 above — independent, can land anytime, but the detail-page `loading.tsx` is so cheap it could ship first)

**Honest expectations:** this is **not** "twice as fast" in raw latency — API rows already return in a few hundred ms warm. What changes: repeat/back navigations go from "full refetch + content shift" to "instant and stable," item-page taps stop feeling stuck (loading boundary), and Supabase/Vercel costs drop meaningfully (fewer invocations, pool query ~daily-per-user instead of per-request-per-instance). Call it: **transformative for perceived continuity, moderate (20-40%) for measured navigation latency, significant for infra cost.** First-ever cold load: unchanged.

**Risk callouts:**
- **Recommendation freshness:** a 24h snapshot means a rating made at 9am doesn't affect recs until tomorrow (today it affects the next reload). Mitigation: invalidate the snapshot on rating/dismiss events, or accept the staleness — Spotify does.
- **Dismissed items:** today a dismiss disappears on next reload; with snapshots, hydration must filter dismissed ids or the item lingers for up to 24h.
- **Item drift:** snapshot ids can point at items later deleted/merged (dedup scripts do delete rows) — hydration must tolerate missing ids and backfill from a spare list (store ~20% extra ids).
- **The catalog rows serve double duty** — `/api/catalog?curated=` is also used by Explore; only its `forYou=1`/curated paths should become snapshot-driven, or Explore's behavior changes too.
- **Multi-device:** one snapshot per user means phone and laptop see identical rows (probably desirable; worth stating).
- **Anchors + filters interaction:** the type-filter banner re-queries with `&type=`; snapshot design must either snapshot per-filter or (simpler) keep filtered views live-computed and only stabilize the default view.
