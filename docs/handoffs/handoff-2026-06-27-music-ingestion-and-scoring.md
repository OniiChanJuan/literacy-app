# Session handoff — 2026-06-27 (CrossShelf Score + search fixes + music ingestion)

Audience: a fresh Claude Code session. Branch **`main`**, **HEAD == origin/main == `d32eb84`**,
working tree **clean** (everything below is committed + pushed). Repo:
`github.com/OniiChanJuan/literacy-app`. Root: `C:\Users\juang\OneDrive\Desktop\claud md`.

## ⭐ Start here
1. Read this doc, then `CLAUDE.md`. Key prior docs: `docs/investigations/crossshelf-score-investigation.md`,
   `design/mockups/crossshelf-score-mockup-v2.html` (locked score design), `docs/handoffs/handoff-2026-06-20-fingerprints-and-scoring.md`.
2. **Next task = genre-specific music ingestion (§2).** Decisions are locked; owner sends the prompt.
   It starts **READ-ONLY** (Step 0: sourcing scope). Don't build/ingest before that.
3. **House rules** (unchanged): `tsc --noEmit` + `next build` + preview-verify before committing;
   commit in clean logical units; keep `HEAD == origin/main`; capture-and-restore test data;
   desktop >640px unchanged unless flagged; report honestly (improved ≠ fixed).
4. **DB access for scripts:** `npx tsx scripts/<x>.ts` — they `dotenv.config({ path: '.env.local' })`
   and use `process.env.DATABASE_URL` (the Supabase **pooler**). `DIRECT_URL` (session) auth-fails from
   this machine; always use the pooler. `pg_trgm` is installed.

---

## 1. What shipped this session (all committed + pushed)

### 1a. CrossShelf Score + scoring-honesty build — 3 phases
The blended 0–10 score is now the single most prominent number on every surface; raw external scores are
subordinate; everything labeled; honest dashes where there's no real data.

- **Module — `src/lib/crossshelf-score.ts`** (`8205d27`). `computeCrossShelfScore(item, communityAgg)`:
  - Formula **external 50% + community 35% + recommend 15%**, **auto-renormalized over present legs**.
  - Community gated **≥10 ratings**; recommend gated **≥5 *tagged* ratings** (tagged-only denominator).
  - External leg = **equal-weighted average of every qualifying source** normalized to 0–10
    (`SOURCE_SCALE` + `EXTERNAL_SOURCES` canonical tables). **`spotify_popularity` excluded** (popularity≠quality).
    **Comics / no-input → `null` → dash.** Returns leg breakdown + `composition` (for the segmented bar) + `pending` flags.
  - Canonical `SOURCE_SCALE` is now also imported by `ranking.ts` + `format-ext-score.ts` (scale-table dedup, behaviour-preserving).
- **recPct denominator fix** (`f2afaef`) — `src/app/api/items/[id]/aggregate/route.ts`: recPct = recommend ÷ **tagged** (was ÷ all). Exposes `taggedCount`. (Slightly changes the existing live recommend-% pill — intended.)
- **Book-scale live-bug fix** (`1734143`) — `external_scores.google_books` rows were 0–5 while `ext.google_books` is 0–10, so the desktop book pill showed half value. **Re-synced 1,998 rows** to 0–10 via `scripts/fix-gbooks-score-scale.ts` (idempotent, reversible).
- **Phase 2 — detail surfaces** (`bbaa2b5` + `5e0a2e6`):
  - New **`src/components/crossshelf-hero.tsx`** (desktop + mobile variants): teal "CrossShelf" wordmark + 0–10 number, **segmented composition bar** (External teal / Community violet / Recommend gold), **"what goes into this"** pills, **progressive disclosure** ("How this score works" → weights + explanation + distribution).
  - **`src/components/aggregate-score.tsx`** resurrected as `RatingDistribution` (5★→1★ gold bars, gated ≥10, "Opens at 10 community ratings" empty state).
  - Wired into `src/app/item/_page-impl.tsx` ZONE 2; `item-sub-banner.tsx` stripped to rating/track only; `mobile-item-detail.tsx` hero swapped off the old fabricated proxy. **`voteCount` threaded into `dbItemToItem`** so the score's threshold gate works on detail pages. **Fixed a pre-existing Rules-of-Hooks violation** in `MobileItemTop` (`useItemFranchise` was after the `isMobile` early-return).
- **Phase 3 — cards** (`f002662` + `a782e92`):
  - New shared **`src/components/card-score.tsx`** (CrossShelf wordmark + 0–10 + fill bar, **external-only** — list payloads have no community; comics/no-data → dash). Used by `card.tsx` + `picked-for-you-grid.tsx`. **Deleted the `0.55`/`10.5` magic constants + the fabricated unlabeled `%`.**
  - Gold ★ **"You"** corner badge = the viewer's own rating (distinct from the teal score by colour+position); unrated → rate-stars.
  - `a782e92`: `EditorialCard` meta height 80/60 → **84/72** (the taller 2-line CardScore was clipping the genre).
- **Locked design:** `design/mockups/crossshelf-score-mockup-v2.html` (`b095e56`).
- **Result:** music + comics (no critic score) **dash** — correct/honest. Verified live across types (Dark Knight 9.0, Harry Potter 8.4 post-fix, DAMN. 9.2 via Pitchfork, comic/podcast dash).

### 1b. Search fixes (the gate before ingestion)
- **`2779903`** — `pg_trgm` GIN index **`items_title_trgm_idx`** on `(title gin_trgm_ops)`. Created via `scripts/add-title-trgm-index.ts` (idempotent raw DDL — project uses `db push`, no migrations dir); declared in `prisma/schema.prisma` `@@index([title(ops: raw("gin_trgm_ops"))], type: Gin, ...)` so push keeps it. `EXPLAIN` now shows a Bitmap Heap Scan (was a ~30k-row seq scan).
- **`e4b3afb`** — **non-blocking external + ranking**. `src/app/api/search/route.ts` takes `scope=local|external|all` (default all, backward-compat). Clients (`global-search.tsx`, `explore/page.tsx`) fetch `scope=local` (instant, indexed) then merge `scope=external` via **`src/lib/search-merge.ts`**. Ranking: per-type `POP_CEILING` (MAL counts no longer dwarf TMDB), titleScore coverage bonus, **external relevance filter** (drops popular-but-irrelevant API noise), groups ordered by relevance, Jikan-anime no longer fired on every query, fuzzy uses the `%` operator (index).
- **Verified:** "dark knight" → **The Dark Knight** (was an obscure manga); "the overstory" → no Haikyu noise; time-to-first-result **5.7s → ~0.5s** (local), external streams in. **Key consequence: catalog expansion now *helps* search — every ingested title is an instant local hit.**

### 1c. Music catalog ingestion — **202 → 1,011 items**, four batches
Pipeline (locked policy): **MusicBrainz primary** (UA header `CrossShelf/1.0 ( hello@crossshelf.app )`, **~1 req/s**, 503 backoff, **no API key**); **Cover Art Archive** covers (`coverartarchive.org/release-group/{mbid}/front-500`, ~96–99% coverage); **NO Spotify** (licensing); **Last.fm** skipped (no `LASTFM_API_KEY`). New items insert with `item_dimensions = NULL`; after each batch run `npx tsx scripts/calculate-dimensions.ts`. New music carries **no critic score → CrossShelf Score dashes** (honest).

| Batch | Commit | Net-new | Seed file | Created-ids |
|---|---|---|---|---|
| pilot (curated 50) | `3fd7aca` | 48 | (inline in `scripts/populate-music-canon.ts`) | `scripts/music-canon-created-ids.json` |
| RS500 (2003) | `68971d3` | 439 | `scripts/seeds/rolling-stone-500.json` | `scripts/rs500-created-ids.json` |
| RS500 (2020) | `f89afe9` | ~157 | `scripts/seeds/rolling-stone-500-2020.json` | `scripts/rs500-2020-created-ids.json` |
| Pitchfork 200 (2010s) | `d32eb84` | 164 | `scripts/seeds/pitchfork-200-2010s.json` | `scripts/pitchfork-200-created-ids.json` |

- **Reusable script:** `scripts/populate-music-list.ts --seed=<json> --batch=<name> [--dry-run] [--limit=N]`. Idempotent (dedup by normalized title+artist **and** MBID), resumable, writes created-ids incrementally. Long lists run in the background (~1 req/s).
- **Hardening accreted across batches** (in `populate-music-list.ts`): **year-retry** (on a >2yr mismatch vs the seed's original year, re-search constrained to that year — auto-corrects reissue picks); **diacritic-folding `norm()`** (Björk/Sinéad/João); **`albumQueryTitles()`** (parenthetical/quoted disambiguation, e.g. `Metallica (The Black Album)` → "Metallica"); `ALBUM_ALIASES` + `deMojibake`; MBID-dedup; `REISSUE_RE` penalty; matchScore = exact-title + year-bonus + reissue-penalty + earliest-date, candidate `limit=20`.
- **CSP fix** (`40fcd06`) — `src/middleware.ts` `img-src` now allows `coverartarchive.org` **and** bare `archive.org` (the CAA front URL redirects `coverartarchive.org → archive.org → *.archive.org`; the bare-domain hop was silently blocking covers — naturalWidth 0, no console error). Covers render via raw `<img>` (CoverImage defaults `optimized=false`).
- **Reissue lesson (the failure mode at scale):** a seed with **no original years (Pitchfork) disables the year-flag/year-retry guardrail** → 2 wrong-editions slipped (Bowie's "★" matched "Blackstar Radio Edits"; Jeremih "Late Nights" matched a 2023 "Slowed Down"). The **no-cover signal** caught them; both reconciled to the correct edition (ad-hoc DB updates, not committed scripts). Prefer seeds with original years; treat no-cover as a wrong-edition tell.

---

## 2. NEXT TASK — genre-specific music ingestion (locked; owner sends prompt)

**Why:** general-acclaim canon is well-covered (1,011), but the catalog is **rock/indie-heavy** and **thin on metal, jazz, country, electronic depth, hip-hop depth, R&B, classical**. Owner chose to **keep going on music, pivot to genre canons** (NOT a 5th general list, NOT the scores source yet).

**Approach:**
- **Step 0 = READ-ONLY sourcing scope:** which genres have cleanly sourceable "best of" lists, and **whether each list carries original years** (a no-year source disables the year-guardrail — the Pitchfork lesson). Report, get an agreed genre order.
- Then **one genre per batch**, same verify→review discipline, reusing `populate-music-list.ts`.
- **Each batch must report albums-by-existing-artist vs new-artist** (so the owner can later decide on a bounded, acclaim-gated discography-depth pass).

**Decided AGAINST (do not do):** "ingest all albums by every artist on the lists." Owner raised it; rejected — abandons curation (low-value deep cuts/reissues/comps), reintroduces the edition-matching swamp at scale, and aims at the wrong gap (deepens already-covered artists, not thin genres). Genre lists deepen discographies organically as popular artists recur.

**Small script tweak filed for this batch:** add `radio edit` / `slowed` / `sped` to `REISSUE_RE` in `populate-music-list.ts` (Code flagged but didn't apply — these slipped the penalty in the Pitchfork batch).

---

## 3. PLANNED step AFTER genre music — provenance + age-ratings (film/books/games)

Next ingestion phase once genre music is done. **Mostly marking existing items** (canon well-covered — 14/14 sampled present), not new ingestion.
- Build a relational **`Awards(item_id, award_name, year, result)`** table; backfill by **title+year+type** matching against curated award lists. (`items.awards` JSON exists but is empty; the `Awards` table from CLAUDE.md was never built. Only provenance today: `ext.nyt` on ~7,585 books.)
- Pull **age/content ratings** via existing keys: TMDB `release_dates`/`content_ratings`, IGDB `age_ratings`, Jikan `rating`. (Reachable; **zero stored today**.)
- ⚠ **Age-ratings feeding the fingerprint = a `src/lib/taste-dimensions.ts` model change → re-null + re-vector of affected types** (movie/tv/game/anime/manga) — the one non-trivial dimension cost.
- **Start READ-ONLY (scope), stop for owner approval before building.** Detail in the Part-1..5 investigation already delivered (see chat / the ingestion-strategy report).

---

## 4. Filed / owed (don't lose; don't action unless directed)

- **`task_52e5b19c` — 28-album miss recovery (music).** Famous albums lost to CSV-format/diacritic edge cases (White Album, Black Album, Sign 'O' the Times, Björk's *Post*, etc.). **Partially recovered, not done** — a later cleanup pass with better title/diacritic handling (re-run the seeds with the hardened script; dedup makes it safe).
- **Music critic-scores question.** All ~1,011 music items **dash** (no critic score, popularity excluded, no community ratings). A music score source (Pitchfork/Metacritic) has **no clean API; scraping is ToS-gray** → a research question, not clean ingestion. **Deferred, honest as-is.**
- **Signed-in verification (owner verifies on https://crossshelf.app — auth-gated, NOT the agent's):** gold "You" badge when rated; Picked-for-you card genre fits; **`task_58550134`** desktop People threading (3 interactive criteria); mobile per-rec cross-shelf vote persistence. (See `docs/handoffs/mobile-signed-in-verification-checklist.md`.)
- **`REISSUE_RE` "radio edit"/"slowed" tweak** — flagged, not applied (see §2).

---

## 5. Mid-flight / state
- **Working tree clean. HEAD == origin/main == `d32eb84`. All session work committed + pushed.**
- This session's commits (newest first): `d32eb84` Pitchfork 200 · `f89afe9` RS500-2020 · `68971d3` RS500-2003 · `3fd7aca` music pilot · `40fcd06` CAA CSP · `e4b3afb` search local-first+ranking · `2779903` trgm index · `a782e92` card meta-height · `f002662` cards score · `5e0a2e6` detail hero wiring · `bbaa2b5` hero+distribution · `1734143` gbooks scale · `f2afaef` recPct · `8205d27` score module · `b095e56` mockup.
- **Music catalog ≈ 1,011 items, 0 null-dim** (all vectored). Search is trgm-indexed + local-first.
- **Immediate next input:** the owner's **genre-music-ingestion prompt** (§2). Starts read-only (Step 0 sourcing scope).
