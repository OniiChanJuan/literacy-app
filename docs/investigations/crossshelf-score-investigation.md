# CrossShelf Score — Read-Only Investigation

**Date:** 2026-06-08
**Scope:** Survey of existing scoring code and data readiness for the Aggregate CrossShelf Score. Read-only — no code changes, no migrations, no commits. DB access was SELECT-only (the orphan re-enrichment run in your terminal was not disturbed).

---

## Section 1 — What scores exist on items today?

### Columns on `items` ([prisma/schema.prisma:94-164](prisma/schema.prisma))

| Field | Type | What it holds | Source | Scale |
|---|---|---|---|---|
| `voteCount` (line 125) | Int | **External** vote/sample count (TMDB votes, MAL members, Google ratingsCount, NYT weeks-on-list for new books). **NOT community-rating count.** | each ingestion path | raw count |
| `popularityScore` (line 124) | Float | popularity signal; scale varies wildly by type (TV/manga in millions from MAL members; NYT books 0–5000 from the bestseller formula; movies ~0–1600) | ingestion + NYT formula | inconsistent per type |
| `ext` (line 106) | Json | per-source score map (below) | wrappers + populate scripts | per-key |
| `hypeScore` / `wantCount` (111-112) | Int? | upcoming-items only | — | 0-100 / count |
| `externalScores` relation → `external_scores` table (167-180) | rows | normalized copy of scores with explicit `maxScore`, `scoreType`, `label` | `fetch-external-scores.ts`, `sync-omdb-scores.ts`, `sync-steam-reviews.ts`, populate scripts | row-declared `maxScore` |

There is **no `qualityScore` column on items** and **no cached community average**. (`cross_connections.quality_score` exists but is connection-level — the cross-media edge quality decayed nightly by `/api/cron/cleanup` — unrelated to item scoring.)

### `ext` keys observed in production (per-type frequency, live query)

```
movie:   tmdb(4867) imdb(440) rt_critics(67) metacritic(66) mal(58)
tv:      tmdb(2176) mal(1675) imdb(218) rt_critics(4)
book:    nyt(7585·object!) google_books(2074) pages(16)
game:    igdb(3247) igdb_count(3048) igdb_critics(2402) igdb_critics_count(2401) steam(1758) steam_label(1758) metacritic(170)
manga:   mal(1912)
music:   pitchfork(3)
podcast: spotify_popularity(118)
comic:   (none at all)
```

Scales by key, as the code assumes them ([ranking.ts:24-32](src/lib/ranking.ts:24), [format-ext-score.ts:63-76](src/lib/format-ext-score.ts:63)): `tmdb/imdb/mal/pitchfork` 0-10 · `igdb/igdb_critics/metacritic/rt_*/steam/spotify_popularity/anilist/aoty/opencritic` 0-100 · `google_books/comicvine/rym/letterboxd` 0-5. Non-score keys: `igdb_count`, `igdb_critics_count`, `steam_label` (display helpers, in `HIDDEN_KEYS`), and `ext.nyt` (a **structured object** `{peakRank, totalWeeks, lists}` — the reason for the recent NaN guard in search).

---

## Section 2 — What's currently displayed on cards?

All in [card.tsx](src/components/card.tsx). The card picks the **single best external score** and fabricates both numbers from it:

```ts
// card.tsx:32-44
const bestScore = getBestExtScore(item.ext, item.voteCount ?? 0);
const numericScore = bestScore && bestScore.kind === "numeric"
  ? { normalized10: (bestScore.value / bestScore.max) * 10, ... } : null;

// CrossShelf score derived from external score until real community ratings are available
const literacyScore = numericScore ? Math.min(5, numericScore.normalized10 * 0.55).toFixed(1) : null;
const recPct = numericScore ? Math.min(99, Math.round(numericScore.normalized10 * 10.5)) : null;
```

- **The 0-5 number + teal bar** ([card.tsx:213-231](src/components/card.tsx:213)): `min(5, best_ext_on_10 × 0.55)`. An 8.0/10 IMDb → "4.4". The `0.55` is a magic constant (a 9.1+ pins at 5.0).
- **The percentage** ([card.tsx:232-238](src/components/card.tsx:232)): `min(99, round(best_ext_on_10 × 10.5))`. The same 8.0 IMDb → "84%". Pure linear restyling of the same single source, capped at 99.
- **The star row** ([card.tsx:265-271](src/components/card.tsx:265)): `Stars` bound to the *current user's own rating* via `useRatings()` — an input control, not an aggregate.
- Steam-only games show the text label instead ([card.tsx:240-246](src/components/card.tsx:240)); no score → year fallback.

`getBestExtScore` ([format-ext-score.ts:231-234](src/lib/format-ext-score.ts:231)) walks `COMPACT_PRIORITY` (imdb → tmdb → mal → igdb_critics → igdb → google_books → rt_critics → …, lines 79-95) and applies display thresholds via `scorePassesThreshold`.

**Bottom line: neither card number involves community ratings or recommend tags at all.** The code comment admits it ("until real community ratings are available"). They are *brand-styled external scores*.

---

## Section 3 — What's currently displayed on detail pages?

Detail page = [src/app/item/_page-impl.tsx](src/app/item/_page-impl.tsx) (shared by `/[type]/[slug]` and `/item/[id]`). Score UI lives in **[item-sub-banner.tsx](src/components/item-sub-banner.tsx)**, which fetches two endpoints in parallel ([item-sub-banner.tsx:105-115](src/components/item-sub-banner.tsx:105)):

1. **`/api/scores?itemId=`** ([api/scores/route.ts](src/app/api/scores/route.ts)) — all `external_scores` rows; falls back to numeric `ext` entries if no DB rows ([item-sub-banner.tsx:124-141](src/components/item-sub-banner.tsx:124)); both paths filtered by `scorePassesThreshold`. Rendered as per-source badges using the row's own `maxScore` for color/format.
2. **`/api/items/[id]/aggregate`** ([route.ts](src/app/api/items/[id]/aggregate/route.ts)) — community data. Sub-banner shows it only when `count > 0` (line 112): a **"CrossShelf" badge** = plain mean of community stars on /5 ([item-sub-banner.tsx:241-257](src/components/item-sub-banner.tsx:241)) and a **"Recommend %"** badge with 70/40 color thresholds (lines 259-278).

### `aggregate-score.tsx` — documented, and it's dead code

[aggregate-score.tsx](src/components/aggregate-score.tsx) defines `ScoreBadge` (compact avg+count) and `AggregateScorePanel` (avg, count, 👍/🤷/👎 emoji at ≥70/≥40, 5→1 star distribution bars). Both fetch the same `/api/items/[id]/aggregate`. **Neither is imported anywhere** — `grep -l` matches only the defining file. The detail page renders its own version inline in the sub-banner instead. The distribution bars UI exists only in this unused component.

### The aggregate endpoint math ([aggregate/route.ts:21-57](src/app/api/items/[id]/aggregate/route.ts))

```ts
const ratings = await prisma.rating.findMany({ where: { itemId } });
const avg = (sum / ratings.length).toFixed(1);            // plain mean, no smoothing
dist[r.score - 1]++;                                       // 5-bucket histogram
const recCount = ratings.filter(r => r.recommendTag === "recommend").length;
const recPct = Math.round((recCount / ratings.length) * 100);
```

Computed per-request from raw rows; 60s CDN cache (`s-maxage=60, swr=120`). No Bayesian prior, no minimum count.

---

## Section 4 — Existing aggregation logic

### 4a. `normalizeScore` — [ranking.ts:11-71](src/lib/ranking.ts:11) ⭐ the core normalizer
- **Inputs:** `ext`, `type`, `voteCount`. **Output:** 0.0–1.0.
- Per-type **priority chains** (lines 13-22): movie `imdb→tmdb→rt_critics→metacritic`; game `igdb_critics→igdb→metacritic→opencritic→steam`; book `google_books` only; music `pitchfork→spotify_popularity→aoty→rym`; etc.
- **`maxScales`** per source (lines 24-32) normalize to a common 0-1.
- **Picks the first qualifying source, not a blend** — it's "best available," not aggregation.
- RT special case: critics/audience gap > 30 → average them (lines 45-51).
- Thresholds (next section) gate community sources; editorial fallback ignores votes (lines 63-68).
- Computed **on-the-fly**, never stored. Consumers: catalog route, for-you, recommendations.

### 4b. `qualityRank` — [ranking.ts:74-98](src/lib/ranking.ts:74) (used by catalog route)
`rank = norm×0.5 + log10(votes+1)×0.25 + recencyBonus×0.1`, vote-weight halved for current-year items, ×0.7 penalty when `norm>0.9 && votes<100`. On-the-fly.

### 4c. For You blend — [for-you/route.ts:180-203](src/app/api/for-you/route.ts:180)
`score = dimScore×0.6 + adjustedQuality×0.4` when item has meaningful taste dimensions (any dim >0.05 from neutral), else `adjustedQuality×0.2`. Quality = `normalizeScore` with default 0.5 if no score, halved when `norm≥0.99 && votes<500` or `norm>0.9 && votes<100`. On-the-fly.

### 4d. Search rank — [search/route.ts:57-76](src/app/api/search/route.ts:57)
`titleScore×50 + creatorScore×25 + popNorm×30 + qualityNorm×20` where qualityNorm = `max(numeric ext values)/10` (recently guarded against non-numeric `ext.nyt`). Note: it takes the **max across differently-scaled keys** without per-key normalization — a 0-100 metacritic will always beat a 0-10 imdb and saturate the /10 division. Crude but bounded.

### 4e. Card fabrication — §2 above. **Nothing anywhere blends external + community + recommend%.** The CrossShelf Score would be the first true aggregate.

---

## Section 5 — Bayesian smoothing / threshold logic

**No Bayesian smoothing exists anywhere.** The community average is a raw mean of however many ratings exist (even 1). What exists is **minimum-count gating**, in two parallel tables:

| Source | Display gate `SCORE_THRESHOLDS` ([score-thresholds.ts:14-34](src/lib/score-thresholds.ts:14)) | Ranking gate `rankThresholds` ([ranking.ts:36-40](src/lib/ranking.ts:36)) |
|---|---|---|
| tmdb | 20 | 20 |
| mal | 50 | 50 |
| igdb / igdb_critics | 20 / 5 | 20 / 5 |
| google_books | 10 | 10 |
| steam | **0** (sync pre-filters ≥50) | **50** |
| anilist / opencritic / aoty / rym / letterboxd | 20 / 5 / 5 / 5 / 10 | same |
| editorial (imdb, rt_*, metacritic, pitchfork, spotify_popularity, ign, comicvine) | 0 | absent (no gate) |

Count source: `item.voteCount`, except IGDB which uses `ext.igdb_count`/`ext.igdb_critics_count` ([score-thresholds.ts:40-43](src/lib/score-thresholds.ts:40)); missing count ⇒ show (assume pending backfill, line 63). Other thresholdy logic: `meetsQualityFloor` per-type floors ([ranking.ts:101-144](src/lib/ranking.ts:101)) and the for-you false-positive penalties (§4c).

**The two tables are hand-duplicated and have already drifted (steam: 0 vs 50).** A CrossShelf Score should consume ONE canonical table.

---

## Section 6 — Recommend tag math

- **Storage:** `ratings.recommendTag` — `"recommend" | "mixed" | "skip" | null` ([schema.prisma Rating model](prisma/schema.prisma), write path [api/ratings/route.ts:93-94](src/app/api/ratings/route.ts:93) upsert).
- **Computation:** at request time in the aggregate endpoint (§3): `recPct = recommend_count / ALL ratings`. **Not stored anywhere.**
- **Formula quirk:** the denominator is *all* ratings, including null-tag ones — a user who stars without tagging silently counts as "not recommended." Live data: 18 of 22 ratings have tags, so today's recPct values are deflated by up to ~18%.
- Display thresholds 70/40 (emoji + color) appear in the sub-banner (line 270) and the dead aggregate-score component (lines 71-72), matching the CLAUDE.md spec (👍 ≥70, 🤷 40-69, 👎 <40).
- The card's "%" (§2) is **not** this number — same visual language, completely different semantics.

---

## Section 7 — Per-type scoring divergence (live DB, SELECT-only)

| Type | Items | ≥1 `ext` entry | ≥1 `external_scores` row | voteCount>0 | Sources that actually have data | Quirks |
|---|---|---|---|---|---|---|
| movie | 5,969 | 89% | 89% | 97% | tmdb(4.9k), imdb(440), rt_critics(67), metacritic(66) | Real IMDb/RT only on OMDb-synced subset; rest ride TMDB |
| tv | 4,916 | 81% | 81% | 98% | tmdb(2.2k), mal(1.7k anime), imdb(218) | Anime half scores via MAL; voteCounts in millions skew popNorm |
| book | 12,525 | 76% | **16%** | 81% | google_books(2.0k), **nyt object(7.6k)** | The 76% is inflated by `ext.nyt` (not a score!). Real numeric coverage ≈16-17% and **growing as your re-enrichment runs**. NYT books have voteCount = weeks-on-list (tiny, 1-830) — `google_books` threshold 10 will gate many |
| game | 3,609 | 94% | 88% | 96% | igdb(3.2k), igdb_critics(2.4k), steam(1.8k), metacritic(170) | Richest multi-source type; counts in ext, steam text labels |
| manga | 1,926 | 99% | 98% | 100% | mal(1.9k) | Single-source but excellent fill |
| music | 203 | **1%** | 1% | 92% | pitchfork(3) | **Score signal is NOT in ext** — it lives only in voteCount/popularityScore (spotify popularity stored as counts). `normalizeScore` returns 0 for ~all music. Cards show year instead of a score |
| podcast | 475 | 25% | **0%** | 0% | spotify_popularity(118, ext only) | Weak; 75% have nothing |
| comic | 238 | **0%** | **0%** | 0% | none | **Zero score inputs of any kind** |

**This is the central design constraint:** a CrossShelf Score has strong external inputs for movie/tv/game/manga, *partial* for books (improving daily via re-enrichment), and **nothing for comic, almost nothing for music/podcast**. Per the honest-labeling principle, those types need an explicit "no score yet" state, not a fabricated number.

---

## Section 8 — Community ratings data flow

1. **UI** → `Stars` on cards / `RatingPanel` on detail → `useRatings()` context → `POST /api/ratings` upsert (`@@id([userId,itemId])`, score 1-5 Int + recommendTag) — [api/ratings/route.ts:88-94](src/app/api/ratings/route.ts:88). Also emits an implicit-signal event.
2. **No cache:** nothing on `items` stores community avg/count (`voteCount` is external votes — naming trap). No trigger, no cron, no write-back on rating.
3. **Read path:** `/api/items/[id]/aggregate` computes mean/dist/recPct from raw rows per request, 60s CDN cache (§3).
4. **Reality check (live):** **22 ratings total, from 2 users, across 22 distinct items** (max 1 rating per item). The community leg of the blend is, today, statistically empty.

---

## Section 9 — Diagnosis & reuse opportunities

### Reusable as-is
- **`normalizeScore(ext, type, voteCount)`** ([ranking.ts:11](src/lib/ranking.ts:11)) — per-type priorities, scales, thresholds. The external leg of the CrossShelf Score is 80% done here. (Change needed: blend top-N sources instead of first-match, if desired.)
- **`scorePassesThreshold` + `SCORE_THRESHOLDS`** ([score-thresholds.ts](src/lib/score-thresholds.ts)) — confidence gates; should become the *single* canonical table (fold `rankThresholds` into it).
- **Aggregate endpoint math** ([aggregate/route.ts](src/app/api/items/[id]/aggregate/route.ts)) — mean/dist/recPct; needs a Bayesian prior bolted on, not a rewrite.
- **`scoreColor`/`steamLabelFor`** utilities; `qualityRank`'s log-votes + false-positive-penalty patterns; for-you's `norm≥0.99/votes<500` suspicion heuristics.
- The 70/40 recommend thresholds (already spec'd and consistently used).

### New code needed (shape only)
A single module — `src/lib/crossshelf-score.ts` — exporting something like `computeCrossShelfScore(item, communityAgg) → { score05, confidence, components, label }`:
1. External leg: `normalizeScore` (possibly blended across qualifying sources).
2. Community leg: Bayesian-smoothed mean `(C×m + Σratings)/(C + n)` with a global prior m and pseudo-count C — at 22 site-wide ratings the blend must be ~all-external for now and *gradually* hand over weight as n grows.
3. Recommend leg: recPct folded in with its own confidence (and the null-tag denominator decision fixed).
4. One canonical thresholds/scales table consumed by score, search, display.
Plus: cards need community data they currently don't have (today cards only get `ext`/`voteCount` from list payloads; per-item aggregate fetches would be N+1 — see "where it lives").

### Where should the score live?
**Recommendation: computed at render/request time in the shared lib, with the community aggregate joined in by list endpoints** (catalog/for-you/search already do per-item work; a grouped `ratings` aggregate query is cheap at current volume). **Don't add a stored column yet:** with 22 community ratings, a stored score is a stale-cache liability with no read-cost justification. Revisit a cached column + nightly cron (the `/api/cron/cleanup` pattern exists) when rating volume makes per-request aggregation measurable.

### Riskiest part — honest read
1. **The community leg is empty (22 ratings, 2 users).** Branding the number "what CrossShelf thinks" when it's 99% IMDb/IGDB restyled is exactly the overclaim the honest-labeling principle forbids. The design must define what the score *is* at n=0 and label accordingly ("Critics & community", confidence states, or showing the external blend unbranded until n≥threshold).
2. **Whole types have no inputs** (comic 0%, music ~1% ext, podcast 0 DB rows). Empty-state design is mandatory, not an edge case.
3. **Scale inconsistency on `ext.google_books` (real bug, live now):** ingestion writes it 0-5 ([google-books.ts:189](src/lib/google-books.ts:189)) but search enrichment ([google-books.ts:119](src/lib/google-books.ts:119)) and the **currently-running orphan re-enrichment** ([reenrich-orphans.ts](src/lib/reenrich-orphans.ts), per the approved "search-path shape") write `avgRating×2` → 0-10 — into a key that `normalizeScore` (scale 5) and `SOURCE_META` (max 5, "/5") treat as 0-5. Books re-enriched this week can display "8.4/5" and normalize to 1.68 (>1.0), over-ranking them. **This needs a decision + data fix before the CrossShelf Score consumes it.**

### Other inconsistencies discovered
- **Card vs detail page disagree by construction:** card "4.4 | 84%" = one external score × magic constants (0.55, 10.5, cap 99); detail "CrossShelf 3.0 | 50%" = real community mean. Same brand voice, different universes — the original complaint, confirmed in code.
- **`aggregate-score.tsx` is dead code** (both exports unimported); the only rating-distribution UI lives there.
- **Duplicated threshold tables** with drift (steam 0 vs 50) and duplicated scale maps (`maxScales` vs `SOURCE_META` vs legacy `external-scores.tsx`, itself also dead code per the Phase-2 session).
- **`voteCount` is a naming trap** (external sample size, not community votes) — any design doc should rename or alias it.
- **recPct denominator** counts untagged ratings as non-recommends (§6).
- Search's qualityNorm takes an unnormalized max across mixed scales (§4d) — pre-existing, bounded, but worth folding into the same canonical normalizer.

### Minimum clean implementation vs heavier rewrite
**Minimum (recommended):** ~1 new lib module + threshold-table consolidation + the google_books scale fix + swap card.tsx lines 41-44 and the sub-banner's CrossShelf badge to call the shared function + list endpoints include a community-agg join. No schema change, no migration, no cron. Roughly: 1 new file, 4-5 touched files, 1 data-fix script.
**Heavier rewrite (not justified yet):** stored `crossshelf_score` column + components table + nightly recompute cron + backfill. Buys read-perf and score-history we don't need at 22 ratings; adds staleness and migration risk. Defer until community volume or page-load profiling demands it.
