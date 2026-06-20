# Session handoff — 2026-06-20 (fingerprints + what's next: CrossShelf Score)

Audience: a fresh Claude Code session. Branch **`main`**, **HEAD == origin/main == `11001d1`**,
working tree **clean** (everything below is committed + pushed). Repo:
`github.com/OniiChanJuan/literacy-app`. Root: `C:\Users\juang\OneDrive\Desktop\claud md`.

## ⭐ Start here
1. Read this doc, then `CLAUDE.md`. Prior handoffs: `docs/handoffs/` (esp.
   `connection-corpus-schema-proposal-2026-06-14.md`, `catalog-expansion-reconciliation-2026-06-14.md`,
   `mobile-signed-in-verification-checklist.md`) and the vision `docs/vision/layer-2-collective-learning.md`.
2. **Next task = CrossShelf Score + scoring-honesty audit (§3).** Locked design is captured there.
   It starts **READ-ONLY** (map what each surface computes vs displays); owner will send the
   investigation prompt. Don't build before that investigation.
3. **Open verification debt (§4):** desktop People threading (`task_58550134`) is UNVERIFIED on main.
4. **House rules** (unchanged): verify (tsc + build + runtime where possible) before committing; the
   deferred items in §2/§3 are explicitly NOT to be built yet; capture-and-restore any test DB data;
   desktop unchanged >640px unless fixing the same bug (flag it); gate private data at the API;
   null-gated re-dimensioning needs SQL NULL first (§2).

---

## 1. What shipped this session — the deterministic fingerprint pass (steps 1+2)

Goal: fix near-degenerate book fingerprints (and game/manga/anime gaps) using **deterministic,
structured signals only** — NO description-text extraction, NO creator propagation. Commit
**`11001d1`** (`feat(dimensions): structured-signal fingerprint backfill`).

**Code changes:**
- `src/lib/taste-dimensions.ts` — the fingerprint model:
  - **Genre-map hygiene:** `"biography & autobiography"` (BISAC full-form; was failing the bare
    `"biography"` match) → SERIOUS + REALIST (~960 books). IGDB game genres added:
    `shooter, fighting, hack and slash/beat 'em up` → **violence**;
    `strategy, turn-based strategy (tbs), real time strategy (rts), tactical, puzzle,
    point-and-click, visual novel` → new **COMPLEX_GENRES** → complex axis;
    `role-playing (rpg), rpg` → world-building.
  - **`adventure` → world-building was DROPPED per owner review** (too broad/high-frequency a tag
    to reliably imply world-building) — kept rpg only.
  - **Demographic priors (manga/anime)** — `DEMOGRAPHIC_PRIORS` applied as conservative additive
    per-axis nudges in `calculateItemDimensions`: `shounen/shonen` (violence +0.10, faster −0.10,
    plot −0.05), `seinen` (violence +0.15, dark +0.10, complex +0.10), `josei` (emotional +0.10,
    character +0.10), `shoujo/shojo` (emotional +0.12, character +0.10, lighter −0.05).
  - **Deliberate honest no-ops:** juvenile/YA fiction (audience, not tone) and music genres (music
    already 99% vibed; genre→tone subjective) left untouched.
- `src/lib/google-books.ts` — **exported the existing `deriveVibes`** (genre→vibe) for reuse;
  the backfill calls `deriveVibes(genre, "")` = **genre-only** (no description text).
- `scripts/backfill-structured-fingerprints.ts` — scope-guarded backfill. Loads only
  book/manga/game/anime(tv subtype); for each computes the NEW fingerprint and **only touches items
  whose fingerprint actually changes** — writes genre-derived vibes (books) AND
  `item_dimensions = Prisma.DbNull` (SQL NULL) in the same update (mirrors `reenrich-orphans.ts`).
  `--dry-run` reports scope without writing.

**The run (already executed against prod Supabase):**
```
npx tsx scripts/backfill-structured-fingerprints.ts --dry-run   # scope preview
npx tsx scripts/backfill-structured-fingerprints.ts             # write vibes + re-null
npx tsx scripts/calculate-dimensions.ts                         # re-vector the now-NULL items
```
- **Scope re-nulled + re-vectored: 5,277 items** — book 1,112 (146 got new vibes), game 2,813,
  manga 957, anime 395. (Note: the dry-run *before* the `adventure`-drop showed 5,877; the **final
  committed run after dropping `adventure` was 5,277**.) `calculate-dimensions` processed exactly
  5,277 → clean, no collateral.
- **Reversibility:** the 5,277 ids are in `backfill-structured-ids.json` (committed).

**Before → after meaningful-fingerprint counts** (binary `hasMeaningfulDimensions` is saturated and
the wrong yardstick — moved only where genre maps added real signal; `excl-novelty` column):

| type | before (excl-nov) | after (excl-nov) | Δ |
|---|---|---|---|
| game | 2,967 | **3,421** | +454 |
| tv (anime subset) | 4,484 | 4,517 | +33 |
| book | 12,368 | 12,382 | +14 |
| manga | 1,897 | 1,903 | +6 |
| movie / music / podcast / comic | unchanged | unchanged | 0 |

**Spread check (the real metric — varied, NOT a new constant pattern):** manga 82% distinct vectors
(top 1%, avg 5.91/9 tone-axes firing), anime 67% (top 3%, 5.08), game 21% (top 5%, 2.49), book 14%
(top vector 20% = the ~960 biographies legitimately sharing *serious+realistic* — correct uniformity,
not false degeneracy; the 146 genre-vibe books + rest spread out).

**Honesty confirmations:**
- **~7,000 "Fiction-only" neutral tail untouched** — Fiction doesn't map → `deriveVibes` returns
  fallback → fingerprint unchanged → never re-nulled → stays honest-neutral 0.5. (11,444 of 12,556
  books were not in the changed set.)
- **Well-tagged catalog untouched** — movies (5,978), music (203), podcasts (475), comics (238) and
  non-anime TV have identical before/after counts; never loaded or written. Only the 4 target
  populations were touched, and within them only items whose fingerprint actually changed.

---

## 2. The dimensional model — current state (don't re-investigate)

- **Storage:** `items.item_dimensions` (JSONB, nullable). Shape = `TasteDimensions` in
  `src/lib/taste-dimensions.ts` — **10 bipolar axes, each `number` [0.0–1.0], centered 0.5**:
  dark_vs_light, serious_vs_fun, slow_vs_fast, complex_vs_simple, realistic_vs_fantastical,
  violence_tolerance, emotional_intensity, world_building_preference, character_vs_plot,
  novelty_vs_familiar.
- **Derivation:** `calculateItemDimensions(genres, vibes, description, totalEp, voteCount)`. **Vibes
  drive most expressive (tone) axes; genres a few; description is a weak secondary nudge (×0.2–0.3);
  metadata** (length→world-building, low votes→novelty). Plus the new genre-map + demographic-prior
  logic from §1.
- **Null-gated recompute:** `scripts/calculate-dimensions.ts` only processes
  `item_dimensions IS NULL` (SQL NULL) — **no `--force`**. Re-dimensioning ANY item requires setting
  its `item_dimensions` to `Prisma.DbNull` first (JS `null`/JSON-null is NOT picked up). Catalog is
  currently **0 null dims** (fully dimensioned).
- **Real-vs-default detector:** `hasMeaningfulDimensions(dims) = any axis >0.05 from 0.5` (used in
  `for-you/route.ts` ranking + `recalc-taste-profile.ts`). It's a whole-vector heuristic — there is
  **no per-axis real/default flag** (a `0.5` is ambiguous: balanced vs unknown).
- **Cross-media:** the axes are medium-agnostic tone/structure qualities (comparable across media),
  but only as good as genre/vibe coverage. **Honest floor:** ~7,000 thin Fiction-only books, plus
  music (no usable signal beyond artist) and comics (no writer/artist role — publisher only), stay
  **neutral by design**. A wrong fingerprint is worse than an honest-neutral one.

**Deferred fingerprint work — NOT this session, gated to the authoring-tool / Mechanism-1 era:**
- **Creator-prior propagation** (books: author 99.7% pop; games: developer ~86%) — feasibility
  proven: reaches ~27% of thin books, ~62% of thin games; high inherit-and-deviate risk for
  wide-range creators (King/Atwood) → must be a *weak* prior + propose→confirm, never auto-apply.
  Also feeds the corpus's creator/lineage connection axis. (movies/TV creator data too sparse: 7%/2.5%.)
- **Award/curated-list membership confidence-boost** — only NYT provenance (`ext.nyt`) exists today;
  `awards` is empty catalog-wide; no Criterion/Booker/Pitchfork markers (would need new ingestion).
- **Scoped description-extraction** (the only path to the Fiction-only tail) — **proposal-only**,
  high false-positive risk on prose; scope to corpus-referenced/high-leverage items, never broad.
- **Signals we DON'T store** (would need new external ingestion, flagged honest): content/age
  ratings (MPAA/ESRB/TV/anime — none stored), music audio features (not on Spotify).

---

## 3. NEXT TASK (queued) — CrossShelf Score + scoring-honesty audit

**Status: queued. Owner will send a READ-ONLY investigation prompt first. Do not build before it.**

**The problem (from owner screenshots):** the detail page shows a **RAW external score** as the
headline (desktop LOTR = "8.4/10 IMDb"; mobile Avatar = "4.8" with IMDb below) — the **designed
CrossShelf Score is not actually displayed anywhere**; scale is inconsistent across surfaces (8.4/10
on detail vs 4.x/5 on cards); and cards show an **unexplained, unlabeled percentage**. Rules: every
number must be labeled; only real/available data may feed the score; the CrossShelf Score must be
the most prominent number.

**LOCKED design (do not relitigate — implement this):**
- **Formula (locked June 2026):** `external 50% + community 35% + recommend 15%`,
  **auto-renormalize when an input is missing**. **Community component gated at a 10-rating minimum**
  (renormalizes out below that — i.e. ~every title right now at 2 users). **Comics show a dash.**
- **Display (locked):** scale **0–10**; small **teal "CrossShelf" wordmark** above the number; the
  CrossShelf Score is the **prominent hero** on the detail page; contributing raw scores (IMDb, RT,
  etc.) shown **subordinate** as "what goes into this"; rating-distribution bars from
  `aggregate-score.tsx`; fill bar kept on cards.
- **Cards (owner decision):** a card shows the **CrossShelf Score AND the user's own rating** if
  they've rated it — but the two must be **visually distinct and unambiguous at a glance** (not two
  bare numbers in one slot).

**Approach the next session should take:** READ-ONLY investigation FIRST — map, per surface (card /
desktop detail / mobile detail), what each currently **computes vs displays** for scores; whether the
50/35/15 CrossShelf Score is computed anywhere today; what the card percentage actually is; where
`aggregate-score.tsx` fits. Then **propose the unified implementation before building.** Likely
relevant files: `src/components/card.tsx`, the item-detail impl (`src/app/item/_page-impl.tsx`,
`src/components/mobile-item-detail.tsx`), `src/components/aggregate-score.tsx`,
`src/lib/format-ext-score.ts`, `src/lib/ranking.ts` (score-key priorities). Score-key conventions are
documented in `CLAUDE.md`.

> Related deferred note (from the mobile checklist §3): "CrossShelf Score wordmark / scale" — mobile
> cards currently omit the wordmark/`/10` scale pending exactly this work. This task closes it.

---

## 4. Open verification debt (resurface until confirmed)

- **`task_58550134` — Desktop People feed threading.** ⚠️ **UNVERIFIED on main** (committed
  `c5bd3c9`, in `src/app/people/page.tsx`). Three interactive criteria need a **signed-in** pass:
  thread expand/collapse, lazy reply load, vote persistence. **Fix forward if broken.** Logged in
  `docs/handoffs/mobile-signed-in-verification-checklist.md` §2.
- **Cross-shelf per-rec votes (mobile)** — shipped this session (`eedf6b6`), capture-only, auth-gated.
  Worth a signed-in confirm that a per-rec thumb persists across reload (writes `connection_rec_votes`).
- **The broader mobile signed-in checklist** (`docs/handoffs/mobile-signed-in-verification-checklist.md`)
  still has outstanding signed-in items across For You / Item Detail / Library / People / Profile / Explore.

---

## 5. Mid-flight / uncommitted state

- **Working tree clean. HEAD == origin/main == `11001d1`. All session work committed + pushed.**
- This session's commits (newest first): `11001d1` fingerprint backfill · `12c7418` cross-shelf fixed
  count · `e49982a` mobile 3-across grid · `eedf6b6` per-rec votes · `333dff7` corpus docs ·
  `dd54fcb` corpus import · `af448ec` ingest 51 missing · `1bf436f` reconciliation script ·
  `80ea4a8` read corpus from connection_recs · `135c56d` connection-corpus schema · `bf05fc8` votes
  capture-only decoupling.
- **No open branches** other than `main`. **No uncommitted decisions/code.**
- DB note: the connection corpus is **live** (225 clusters, 316 cards, ~1,094 recs); 3 pending titles
  + 2 unresolved anchors (*Won't You Be My Neighbor?*, *Gone Girl* the book) remain from the import —
  documented, not blocking. Catalog is fully dimensioned (0 null).
- DB access for probes: `npx tsx scripts/<x>.ts` (loads `.env.local` → `DATABASE_URL` pooler;
  migrations use `DIRECT_URL`). **Capture-and-restore any test data you mutate.**
