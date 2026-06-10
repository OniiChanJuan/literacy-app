# Catalog Expansion — Phase 1 Investigation Report

**Date:** 2026-06-06
**Scope:** Read-only survey. No code changes, no migrations, no ingestion runs, no commits.
**DB queried:** Supabase production (`shlyuoeabdaifketvaeo`) via pooler `DATABASE_URL` (the `.env.local` value — see note in §3).

---

## TL;DR

- The catalog is **22,473 items**, but the distribution is lopsided: movies/books/tv/games are large (3.6k–6k each), while **music (203), comic (238), and podcast (475) are near-empty**, and **anime does not exist as its own type at all** (anime is ingested as `type=tv`).
- **Music and podcast are the most urgent.** Music has proven, present infrastructure (Spotify) that was simply never run to completion. Podcasts are full of junk because Spotify's show search is a poor catalog source, and the *intended* podcast source (Podcast Index) has no API keys and no code.
- **Books are large but shallow on modern hits** — confirms the Babel finding (R.F. Kuang, Sanderson, Emily Henry, Rebecca Yarros all absent).
- **No automated sync exists.** The only Vercel cron is `/api/cron/cleanup`. The "TMDB every 6h / IGDB every 12h" sync in CLAUDE.md is aspirational. All population is manual via `scripts/populate-catalog.ts`.
- **Recommended Phase 2 starting point: Music** (weakest + most feasible). Books is the close runner-up on user-visible value.

---

## Section 1 — Current catalog size by media type

```
type      total   top_level  with_dims         pop>0           years
movie      5969       5969    448  (7.5%)    455  (7.6%)     1894..2028
book       5137       5137    274  (5.3%)     30  (0.6%)        0..2026
tv         4916       4807    342  (7.0%)    346  (7.0%)        0..2026
game       3609       3433    553 (15.3%)    271  (7.5%)        0..2026
manga      1926       1920    158  (8.2%)    157  (8.2%)        0..2026
podcast     475        475    475 (100.0%)     0  (0.0%)        0..2020
comic       238        238    149 (62.6%)      0  (0.0%)     1938..2024
music       203        201    202 (99.5%)    187 (92.1%)     1957..2026
-------------------------------------------------------------------------
TOTAL     22473              2601 (11.6%)
```

Notes:
- **`itemDimensions` coverage is 11.6% overall** — matches the ~12% Stage-4 headroom figure. But it's inversely correlated with catalog size: the tiny types (podcast 100%, music 99.5%, comic 62.6%) are fully dimensioned because `calculate-dimensions.ts` cleared the small backlog, while the big types sit at 5–8%. Any expansion of music/comic/podcast will *dilute* their high dims coverage, and any book/movie/tv expansion adds to an already-large undimensioned backlog. **Dimension computation must be budgeted as part of any expansion** (see Risks).
- **`anime` is not in this table** — it is 0 rows. Anime is ingested as `type=tv` (Jikan → `tv`) and `type=manga`. The "8 media types" in product copy collapse to 8 *labels* but only 8 DB `type` values, of which `anime` is not one. This is a taxonomy decision, not a gap — but it means "expand anime" is really "expand the anime slice of `tv`."
- **`pop>0` (popularityScore) is broken or absent for whole types**: podcast 0%, comic 0%, book 0.6%. These types have no usable popularity signal at all (see §2 and §5).

---

## Section 2 — Catalog quality spot-check per type

### 2a — Top-5 by popularityScore (sanity of the popularity signal)

| Type | Verdict | Top items observed |
|---|---|---|
| book | OK-but-shallow | Harry Potter editions (2015) + LOTR. Recognizable but old; pop maxes at 311. |
| movie | Signal OK | Avatar: Fire and Ash, Project Hail Mary — recent/recognizable. Note pop scale ~1000s. |
| tv | Signal OK (anime-dominated) | Attack on Titan, Death Note, FMA:B — but pop values are in the **millions** (MAL member counts), not comparable to movie's ~1000s. |
| game | Signal OK | Batman: Arkham, Shadow of Mordor, Cyberpunk 2077. |
| anime | **EMPTY** | 0 rows. |
| manga | Signal OK | Berserk, Chainsaw Man, AoT, One-Punch Man — pop in 100k–800k range (MAL). |
| music | Thin | DAMN., OK Computer, IGOR — fine but only a handful; pop maxes at 200. |
| podcast | **Broken signal** | All top-5 have pop=0; titles are junk ("The Joe Rogan Experience Experience", "herrdirektoa"). |
| comic | **Broken signal** | All top-5 have pop=0; Saga/Revival/Immortal Hulk present but unranked. |

**Cross-type popularityScore scales are wildly inconsistent** (tv/manga in millions, movie/game in thousands, music/book in hundreds, podcast/comic at zero). This is a pre-existing normalization problem, not in scope to fix here, but it means popularityScore cannot be compared across types for any future "trending across all media" surface. Flagging only.

### 2b — Most recently added (ingestion recency, by `id` desc — there is no `created_at` column)

- Highest IDs (~22500) are **books** (Kitchen Confidential, Dawnshard), one-off **movies** (Matrix/Animatrix, id 22518–22519), a **comic** (Le Petit Prince, 22520), **games** (Warhammer batch, 22346–22350 from `populate-warhammer.ts`), and **music** (WARHAMMER soundtrack, 22283).
- **Music's most recent *real* ingest before that one-off is id ~1209** — i.e. music has not been meaningfully populated since the original `seed-catalog.ts` era. Same story for podcasts (top id 2500) and the bulk of comics.
- Conclusion: **bulk ingestion stalled long ago.** Recent activity is manual one-offs (Warhammer franchise, a few books/movies), not systematic expansion.

### 2c — Targeted "should this be here?" presence checks

| Type | Present (as that type) | Missing | Notes |
|---|---|---|---|
| **book** | **1/5** | R.F. Kuang, Brandon Sanderson, Emily Henry, Rebecca Yarros | Only Sally Rooney, as a box-set listing. **Confirms the Babel gap.** |
| **music** | **1/5** | Bad Bunny, Sabrina Carpenter, Phoebe Bridgers | "Kendrick Lamar" match is a seeded placeholder ("New Album", 2026, pop=10). Taylor Swift only as a concert *film* (type=movie). |
| **podcast** | 3/5 nominal, **~0/5 real** | Conan, Maintenance Phase | "Serial"→*Serialously*, "This American Life"→*…Partners*, "The Daily"→*The Daily Show* (TV). None of the actual flagship podcasts are present. |
| **comic** | **2/5** | Monstress; Saga/Sandman only cross-type | Watchmen + Paper Girls present (pop=0). |
| **game** | **4/5** | Baldur's Gate 3 | Elden Ring, Hollow Knight, Stardew Valley, Hades all present. |
| **anime** | **0/5** | — | All five found, but as `manga`/`tv`. Confirms anime≠its own type. |
| **manga** | **5/5** | — | Healthiest type by this measure. |
| **movie** | **4/5** | Dune Part Two (only as "Dune" variants) | EEAAO, Past Lives, Anora, The Substance present. |
| **tv** | **4/5** | Shōgun (only "Shadow Tactics: …Shogun" game) | Severance, The Bear, Succession, House of the Dragon present. |

Quality of present items: covers and descriptions are essentially always present (cov=Y, desc=Y across all samples). The problem is **coverage and popularity signal**, not per-row completeness.

---

## Section 3 — Env var audit

Two env files exist with **different DATABASE_URL passwords**: `.env` (loaded by `dotenv/config`) has a **stale password** that fails auth (`28P01`); `.env.local` (what Next.js actually loads) has the working one. Scripts that do `import "dotenv/config"` and rely on `DATABASE_URL`/`DIRECT_URL` from `.env` **will fail against prod** unless they explicitly load `.env.local`. `DIRECT_URL` (the `postgres@db.<ref>.supabase.co:5432` direct host) failed auth in both files — likely the deprecated Supabase direct host. *(Operational note, not a catalog issue — flagged for whoever runs ingestion scripts.)*

| Env var | Present in `.env`/`.env.local` | Referenced in code | Status |
|---|---|---|---|
| `TMDB_API_KEY` | ✅ both | 25 files | **Active** (search + populate). |
| `IGDB_CLIENT_ID` / `_SECRET` | ✅ both | 23 files | **Active** (games). |
| `GOOGLE_BOOKS_API_KEY` | ✅ both | 13 files | **Active** (books). |
| `SPOTIFY_CLIENT_ID` / `_SECRET` | ✅ both | 9 files | **Active** (music + podcast). |
| `OMDB_API_KEY` | ✅ both | 2 files | Active (score sync only). |
| `COMICVINE_API_KEY` | ✅ both | 5 files | **Active** (comics). Note name is `COMICVINE_`, **not** `COMIC_VINE_`. |
| `LASTFM_API_KEY` | ❌ **absent** | 0 files | **Not integrated.** No key, no code. |
| `PODCAST_INDEX_KEY` / `_SECRET` | ❌ **absent** | 0 files | **Not integrated.** No key, no code. |
| MusicBrainz | ❌ absent | 0 files | **Not integrated.** (No key needed, but no wrapper/code either.) |
| TasteDive / RAWG / Hardcover.app | ❌ absent | 0 files | Never actioned. (`rawG`/`hardcover` string hits are false positives — a camelCase var and the book-format word.) |
| AniList | ❌ no key | display-only | `anilist` appears as a **score-display key** in `format-ext-score.ts` / `external-scores.tsx` / `ranking.ts`, but is **never fetched**. `fetch-external-scores.ts:316` literally logs `"AniList (has GraphQL API — add later)"`. Dead placeholder plumbing. |

**You'll need to verify these in the Vercel dashboard yourself** (I can't read prod env from the repo): whether `TMDB/IGDB/GOOGLE_BOOKS/SPOTIFY/COMICVINE/OMDB` are set in Vercel *production* (they're clearly set locally and the app works, so almost certainly yes), and confirm `LASTFM_*`, `PODCAST_INDEX_*` are **not** set anywhere (no code reads them regardless).

---

## Section 4 — Existing populate / ingestion scripts

`scripts/` holds **172 files**; there is **no `scripts/README.md`** (the canonical script docs live in `CLAUDE.md`). The catalog-relevant ones:

| Script | Sources | Run evidence | Idempotent? | Rate-limit handling |
|---|---|---|---|---|
| **`populate-catalog.ts`** (1,320 lines) | TMDB, IGDB, Google Books, OpenLibrary, Jikan, Comic Vine, Spotify | **The main tool.** Most non-Warhammer items trace to it. | ✅ Yes — preloads all external-IDs + title|type set, dedups before insert. | ✅ Good. Per-source `sleep()` (TMDB 260ms, IGDB 4s on 429, Jikan 400ms/1s, Comic Vine 1200ms, Spotify adaptive 429 backoff with a 3-strike / 5-min circuit breaker). |
| `seed-catalog.ts` | Same set (legacy) | Superseded by populate-catalog. Original source of the old low-id music/podcast rows. | Partial | Basic. |
| `populate-warhammer.ts` | IGDB (franchise-targeted) | **Recently run** (ids 22282–22350). | Yes | Yes. |
| `fetch-external-scores.ts` | Jikan + ext JSON | Run (populates `external_scores`). | Yes | Yes. Contains the AniList "add later" TODO. |
| `sync-omdb-scores.ts` | OMDb | Run periodically (movies/tv IMDb/RT/Metacritic). | Yes (`--skip-existing`) | 1,000/day OMDb cap respected. |
| `backfill-spotify-scores.ts`, `fetch-popularity.ts`, `backfill-igdb-counts.ts`, `backfill-mal-scores.ts` | Spotify/IGDB/Jikan | Run (score/popularity backfills). | Yes | Yes. |
| `cross-reference-anime.ts`, `deduplicate-anime.ts`, `link-anime-seasons.ts` | Jikan/TMDB | Run (anime cleanup). | Mixed | N/A mostly local. |
| ~150 others | — | One-shot diagnostics (`_*.ts`), franchise detection, cover/description/genre/color backfills, dedup passes. | Mostly one-shot. | N/A. |

**Cron:** `vercel.json` defines **one** cron — `/api/cron/cleanup` at 03:00 daily (deletes old signals/events, decays connection quality_score). **There is no scheduled catalog sync.** Every catalog refresh is a manual `npx tsx` invocation. This is the single biggest structural finding: "new releases appear within hours" (CLAUDE.md) is not implemented.

---

## Section 5 — External API wrapper inventory (`src/lib/*.ts`)

| Wrapper | Exports | Endpoints | Throttling in wrapper | Called from |
|---|---|---|---|---|
| `tmdb.ts` | `searchTmdb`, `searchTmdbByPerson`, `getTmdbDetails` (+id helpers) | TMDB search/discover/details | None in wrapper (relies on caller) | **Search routes only.** Bulk lives in populate-catalog. |
| `igdb.ts` | `searchIgdb`, `getIgdbDetails` | IGDB games | Token cache; none per-call | Search routes only. |
| `google-books.ts` | `searchGoogleBooks`, `searchGoogleBooksByAuthor`, `getGoogleBookDetails` | Google Books volumes | None | Search routes only. |
| `jikan.ts` | `searchJikanManga`, `searchJikanAnime`, `getJikan*Details`, `isLikelyAnime` | Jikan v4 | None | Search routes only. |
| `spotify.ts` | `searchSpotify`, `getSpotifyAlbumDetails`, `getSpotifyShowDetails` | Spotify search/album/show | Token cache; none per-call | Search routes only. |
| `comicvine.ts` | `searchComicVine`, `getComicVineDetails` | Comic Vine search/volume | None | Search routes only. |

**Key gap (directly answers the prompt):** **none of the six wrappers has a "fetch top-N popular" / bulk-list function.** Every wrapper is **search + detail-fetch only**. All bulk-listing logic (genre queries, popularity sorts, publisher sweeps) is hand-rolled inside `populate-catalog.ts`, not reusable from the wrappers. So for **music, podcast, comic** specifically: there is **no bulk-by-popularity primitive anywhere** except the bespoke code in populate-catalog:
- **Music**: `populateSpotifyMusic` sweeps 25 genre queries + ~40 artist queries via Spotify album search. Works (existing music is 92% pop-covered) but was never run to completion → 203 rows.
- **Podcast**: `populateSpotifyPodcasts` sweeps 15 categories + 14 hand-typed "known podcast" strings via Spotify `type=show` search. **Structurally weak**: Spotify show search returns fuzzy junk and **no usable popularity** (→ 475 rows, all pop=0).
- **Comic**: `populateComicVine` sweeps 10 publishers sorted by `count_of_issues`. Comic Vine returns **no popularity metric** at all (→ pop=0 for every comic). Issue-count is the only available proxy.

---

## Section 6 — Storage & egress baseline

```
DB size (whole database):        48 MB
items rows:                      22,473
items table size (incl idx/toast): 30 MB   (~1,383 bytes/row)
```

Largest tables: `items` 30 MB ≫ `external_scores` 3.9 MB ≫ `franchise_items` 688 kB ≫ everything else <400 kB.

Implications for scaling:
- At ~1.4 KB/row, **doubling the catalog to ~45k items adds ~30 MB** to `items` (+ proportional `external_scores`). Tripling → ~90 MB items, ~150 MB DB total. **Storage is a non-issue** on any Supabase paid tier; even the free tier's 500 MB has headroom for a 5–10× expansion.
- **Egress, not storage, is the real cost** — and that's driven by *reads* (search/for-you/detail traffic), which this query can't measure. Bigger catalog → larger search result sets and more cover-image proxying. **You'll need the Supabase dashboard's egress graph** to judge headroom; the repo can't tell you. The baseline to estimate from: 22k items / 48 MB today.

---

## Section 7 — Diagnosis & recommendations

### Per-type verdict

| Type | Verdict | Why |
|---|---|---|
| **manga** | **Healthy** | 5/5 targeted hits, good popularity signal (MAL), 1.9k items. Low priority. |
| **game** | **Healthy** | 4/5 hits, 3.6k items, IGDB signal works. (BG3 gap is minor.) Low priority. |
| **movie** | **Healthy** | 4/5 hits, 6k items, recent titles present. Low priority. |
| **tv** | **Healthy** | 4/5 hits, 4.9k items (incl. anime). Low priority. |
| **book** | **Weak** | 5.1k items but **shallow on modern hits** (1/5 targeted), 0.6% popularity coverage. High *visibility* (search is the front door; the Babel miss is the origin of this whole investigation). |
| **comic** | **Weak→near-empty** | 238 items, **zero popularity signal**, 2/5 hits. Comic Vine present but gives no popularity. |
| **music** | **Near-empty** | 203 items. Infra present & proven, just never run to completion. |
| **podcast** | **Near-empty / junk** | 475 items, all pop=0, flagship shows absent, Spotify is a bad source, real source (Podcast Index) not integrated. |
| **anime** | **N/A (taxonomy)** | Exists under `tv`/`manga`. Not an expansion target per se. |

### Recommended expansion priority order (weakest × most feasible)

1. **Music** — weakest real catalog *with* present, proven infrastructure. Largely "run the existing script to completion."
2. **Books** — biggest *user-visible* payoff; targeted gap-filling, infra present.
3. **Comics** — Comic Vine present but needs a popularity proxy decision.
4. **Podcasts** — highest effort: requires a new API (Podcast Index) signup + a new wrapper + a new populate path. Defer until the cheaper wins land.

### Recommended approach per weak/empty type

- **Music** — Stay on **Spotify** for v1 (keys present, album popularity works). Run `populate-catalog.ts --type=music` *to completion*, defeating the 429 circuit-breaker by re-running with escalating `--spotify-delay`. Target an initial **~3,000–5,000 albums** (the existing 25-genre × 40-artist sweep, fully drained). Consider **MusicBrainz** (no key, just a `User-Agent`) as a *breadth* supplement later — but Spotify alone gets music from 203 → multiple thousands with zero new infrastructure. Throttle: existing adaptive backoff is adequate; bump base delay to 750–1000ms to avoid the breaker.
- **Books** — Stay on **Google Books**, but shift from subject-ranked sweeps (which miss modern hits) to **curated author/title lists** via `searchGoogleBooksByAuthor` (already exists) for the bestseller cohort (Kuang, Sanderson, Rooney, Henry, Yarros, plus NYT/Goodreads "best of decade" lists). Batch: a few hundred targeted titles closes the embarrassing gaps cheaply.
- **Comics** — Extend `populateComicVine` (more publishers / deeper offsets) and **derive a popularity proxy from `count_of_issues`** since Comic Vine has no popularity field. Batch: ~1,000–2,000 across the existing 10 publishers + a few more (Fantagraphics, Drawn & Quarterly).
- **Podcasts** — **Sign up for Podcast Index** (free; HMAC-signed header auth), add a `src/lib/podcastindex.ts` wrapper with a bulk "trending/top" call, and a `populatePodcastIndex` path. This is genuinely new work — defer to a later Phase 2.

### Risks to flag

1. **Dimension backlog.** New music/comic/podcast items will arrive *without* `itemDimensions`, dragging those types' current ~100% coverage down and starving the Stage-4 personalization. `calculate-dimensions.ts` must be re-run after every expansion — budget it in.
2. **PopularityScore normalization.** Cross-type pop scales already differ by 4 orders of magnitude; comics/podcasts have *none*. Adding more comics/podcasts with pop=0 will make them invisible in any popularity-ranked surface. Decide on a per-type proxy before bulk-loading.
3. **Spotify rate limits.** Music/podcast ingestion repeatedly trips Spotify's 429 breaker — expect multiple partial runs, not one clean pass.
4. **Dedup confidence.** populate-catalog dedups by external ID + `normalizeTitle|type`. Cross-source music (Spotify + MusicBrainz) would need a stronger fuzzy match or it'll double-list albums.
5. **No automated sync.** Whatever you backfill goes stale immediately — there's no cron pulling new releases. Standing up `/api/cron/*` sync jobs is arguably a higher-leverage project than any single backfill.
6. **Egress unknown.** Storage is cheap; read-egress from a 3× catalog is not measurable from here. Check the Supabase dashboard before a large expansion.

### What you'll need to do outside the repo

- **Verify Vercel *production* env vars** (I can't read them): confirm `TMDB_API_KEY`, `IGDB_CLIENT_ID/SECRET`, `GOOGLE_BOOKS_API_KEY`, `SPOTIFY_CLIENT_ID/SECRET`, `COMICVINE_API_KEY`, `OMDB_API_KEY` are present. (They work locally, so prod is very likely fine — but ingestion is run locally anyway.)
- **Fix the local `.env` DB password** (or switch ingestion scripts to load `.env.local`) — `.env`'s `DATABASE_URL` is stale and `DIRECT_URL` fails auth on both. Whoever runs `populate-catalog.ts` will hit this. (populate-catalog reads `DATABASE_URL` after `import "dotenv/config"`, so it'll pick up the **stale** `.env` value and fail unless `.env`'s password is corrected.)
- **If/when podcasts are tackled:** sign up for a **Podcast Index** account and add `PODCAST_INDEX_KEY` / `PODCAST_INDEX_SECRET`. (Not needed for Phase 2 if we start with music.)
- **Optionally**, decide whether music breadth warrants a **Last.fm** key (`LASTFM_API_KEY`) for play-count-based popularity + genre tags. Not required to start.
- **Check Supabase egress headroom** in the dashboard against the 22k-item / 48 MB baseline before any 3×+ expansion.

---

## Recommended Phase 2 starting point: **Music**

Music is the cleanest first target on the prompt's own criteria — *weakest catalog × most feasible fix*. At **203 items it is effectively unusable** as a media type, yet the entire pipeline already exists and is proven: Spotify keys are present, `populateSpotifyMusic` works, and the existing music rows show **92% popularity coverage** (the best of any type). The gap is not missing infrastructure or a missing API — it's simply that the sweep was never run to completion because Spotify's rate limiter kept tripping the circuit breaker. Phase 2 for music is therefore low-risk and high-yield: drain the existing 25-genre / 40-artist sweep to completion (with escalating `--spotify-delay`), re-run `calculate-dimensions.ts`, and music goes from 203 → several thousand real, dimensioned, popularity-ranked albums — validating the full expansion-and-redimension playbook end to end before we spend effort on the harder types (comics' missing popularity signal, podcasts' missing API). **Books is the close runner-up** and the right *second* target, since it carries the most user-visible payoff (search is the front door, and the Babel miss that triggered this investigation lives there) — but books needs a curated-list strategy design, whereas music just needs the existing button pressed harder.
