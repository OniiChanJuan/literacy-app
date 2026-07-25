# Session handoff — 2026-07-23 (music arc complete → provenance/awards next)

Audience: a fresh Claude Code session. Branch **`main`**, **HEAD == origin/main == `ab2dae8`**,
tracked tree **clean** (only untracked local diagnostic scripts remain: `scripts/_diag-*.ts`,
`scripts/_probe-mixtape-gate.ts`, `scripts/_calibrate-hiphop.ts` — working artifacts, intentionally
uncommitted). Repo root: `C:\Users\juang\OneDrive\Desktop\claud md`. Read `CLAUDE.md` too.

## ⭐ Start here
1. **The music arc is DONE.** Don't re-run ingestion. Catalog is at **9,617 music items** (39,331 total).
2. **Next workstream = provenance + age-ratings + awards** (§5) — the owner sends a scoped prompt in a
   new window. It's *mostly marking existing items*, not new ingestion. Starts by building an
   `Awards` table + backfill; the age-ratings piece is a `taste-dimensions.ts` model change → re-null
   + re-vector affected types (the one non-trivial cost).
3. **House rules** (unchanged): `tsc --noEmit` + `next build` before committing; commit in clean
   logical units; keep `HEAD == origin/main`; capture-and-restore test data; report honestly.
4. **DB for scripts:** `npx tsx scripts/<x>.ts` — they `dotenv.config({ path: '.env.local' })` and use
   `process.env.DATABASE_URL` (Supabase **pooler**). `DIRECT_URL` auth-fails from this machine.
5. **Owner action pending (blocks nightly cron):** set `CRON_SECRET` in Vercel (§3).

---

## 1. Music arc — DONE (1,011 → 9,617)

Two phases, both complete, every batch committed + pushed, **0 wrong-artist and 0 duplicate MBIDs across all batches**.

**Phase A — genre canons** (curated "best of" lists, MusicBrainz + Cover Art Archive):
metal `2b14b1a`, country `d9d5ecd`, jazz `348b123`, electronic `c08a869`; genre→vibe fingerprint
enrichment `c779f38`; pre-war-jazz manual recovery `c8436a8`. (Filled the thin genres; ~1,011 → ~1,570.)

**Phase B — discography depth** (`scripts/discography-depth.ts` — walk each catalog artist's full
studio discography). Per-batch created-ids JSON for reversibility. Commits + net-new:

| Batch | Commit | +Net-new | Shape |
|---|---|---|---|
| Metal (calibration slice, 20 artists) | `313b914` | 212 | gate design |
| Jazz | `9b0ae64` | 2,361 | prolific outlier (21.3/artist) |
| Rock (scale test, 312 artists) | `1d72f16` | 2,675 | well-behaved (8.6/artist) |
| Country | `68e8169` | 1,622 | classic-era prolific |
| Soul | `6ec1887` | 748 | convergence begins |
| Funk | `cbe41ef` | 160 | **160 vs 2,499 dedup — converged** |
| Hip-hop batch + A−B delta emit | `7295c16` | 457 | hybrid gate |
| Hip-hop curated delta recovery | `ab2dae8` | 25 | 18 canonical + 7 minor |

**The pipeline that made it work** (all in `scripts/discography-depth.ts`):
- **Release-group walk** — reissues/remasters collapse to one RG → sidesteps the reissue swamp.
- **MBID artist-identity** — each artist resolved from an existing catalog album's stored RG-MBID
  (authoritative; never walks the wrong artist) + artist-name-variant dedup (Jay-Z / Jaÿ-Z).
- **Notability gate** (pluggable): studio-albumhood + at most ONE definitive live album/artist
  (highest MB-rated, votes≥3). Exclusions: comp/remix/demo/soundtrack, split/future-date, reissue-title.
- **Official-status filter** — a studio/mixtape RG needs ≥1 `status=Official` release. This killed the
  hip-hop bootleg/fan-made/scrapped-"Album" pollution (Kanye +35 → +6) that require-cover couldn't catch.
- **require-cover** — drops peripheral no-cover livestreams/outtakes MB mislabels as Album.
- **Per-album genre re-derivation** — genre pulled from the album's own MB genres/tags (not inherited
  from the artist), so a Sinatra pop LP under a "Jazz"-tagged artist reads Pop. De-bleeds crossover artists.
- **Hybrid mixtape gate** (hip-hop): `Mixtape/Street` qualifies iff **MB votes≥1** (MusicBrainz community
  ratings — NOT CrossShelf votes; no circularity) + official + cover. Blanket-exclude lost canon
  (Coloring Book); blanket-include admitted DJ-blend junk. Zero-vote tapes → a `mixtape-novotes` bucket,
  emitted as the **A−B delta** (`--emit-delta` → `scripts/hiphop-delta.json`) for curated hand-recovery.
- **Curated delta recovery** (`scripts/recover-hiphop-delta.ts`) — owner-approved canonical/minor tiers
  recovered by MBID; ~130 junk (Chief Keef GloFiles/Leek, Waka Flocka Myers/Salute loosie dumps — the
  43% balloon) correctly left out.

Discipline throughout: dry-run/inspect on the risky batches, verify (cover %, 0 null-dim, 0 dup MBIDs,
right-edition spot-checks), stop-review after each genre.

---

## 2. Music cleanup backlog (filed, NOT urgent — one batched pass someday)

Details in memory `project_music_filed_followups.md`. None block anything:
1. **Search-alias capability** — canonical-title items don't surface under common names (Ministry stored
   as "ΚΕΦΑΛΗΞΘ" misses a "Psalm 69" search). Only ~9 fully-non-Latin titles catalog-wide; a real fix
   needs a schema `searchAliases` field + a denormalized trgm-indexed `search_text` column + ranking.
2. **28-miss recovery — `task_52e5b19c`** — famous general-canon albums lost to CSV/diacritic edge cases;
   re-run the general seeds with the hardened script (dedup-safe).
3. **2 pre-existing duplicate albums** — John Lennon/Plastic Ono Band, Parliament *Mothership Connection*
   (each twice, same MBID; from an early batch, not the discography pass). Delete one of each.
4. **Stray Classical tag** on one Lil Wayne mixtape ("The Drought Is Over 4…" → [Classical/Hip-Hop] from
   MB tag noise). Cosmetic.
5. **~20 future-dated not-yet-released albums** catalog-wide — real albums MB pre-loaded with future
   release dates (announced, not out). Tighten `split-or-future` to exclude `date > today` + a one-time sweep.

---

## 3. Security — DONE (separate window)

All critical/high/medium holes fixed + verified (recent commits on main, e.g. `dc85711` H3 admin-gate
catalog-write routes, `9c3bc9a` M1 JSON-LD XSS escape, `de0cdcd` M2 private-user count gating, `c666e6b`
M3 cron fails-closed when `CRON_SECRET` unset).
- **Deferred (hygiene, not a hole):** Supabase legacy API-key migration.
- **Owner action pending:** set **`CRON_SECRET`** in Vercel — the nightly cron **fails closed and is
  paused** until it's set (that's the intended safe default, not a bug).

---

## 4. Recommendation architecture (context for what's next)

- **Layer 1 — curated corpus** (~158 anchors / ~994 cross-media connections): **LIVE**.
- **Layer 2 — individual personalization** + taste-dimension fingerprints (`src/lib/taste-dimensions.ts`,
  10 dims, cosine/weighted-euclidean similarity): **LIVE**. NB: for **music**, fingerprints come almost
  entirely from **vibes** (the genre-based dim signals are film/book/game genres) — hence the genre→vibe
  mapping work. Vibeless music items ≈ neutral vectors.
- **Layer 3 — collective learning**: **DESIGNED / GATED**. Mechanism 1 needs the deferred authoring tool;
  Mechanism 2 needs 50+ users. Awards-as-cluster-seeds (§5) feeds this eventually.

---

## 5. NEXT workstream — provenance + age-ratings + awards

Goal: give the catalog the **pedigree-awareness it lacks**. Mostly **marks existing items** (canon is
well-covered — cheap, not new ingestion; a prior sample found ~14/14 present). Owner sends a scoped
prompt in a new window. Three payoffs:
1. **Provenance signal** — "won the Booker / Criterion / Grammy / Hugo / …". Build a relational
   **`Awards(item_id, award_name, year, result)`** table (CLAUDE.md lists it; never built — `items.awards`
   JSON exists but is empty). Backfill by **title + year + type** against curated award lists.
2. **Age/content ratings as a darkness/violence fingerprint proxy** — pull via existing keys (TMDB
   `release_dates`/`content_ratings`, IGDB `age_ratings`, Jikan `rating`; **zero stored today**). ⚠ Feeding
   these into the fingerprint = a **`src/lib/taste-dimensions.ts` model change → re-null + re-vector the
   affected types** (movie/tv/game/anime/manga) — the one non-trivial cost. Start READ-ONLY (scope), stop
   for approval before the model change.
3. **Awards-as-cluster-seeds** — feeds eventual Layer 3 collective learning.

---

## 6. State
- **HEAD == origin/main == `ab2dae8`.** Tracked tree clean (untracked `_diag-*`/`_probe`/`_calibrate`
  local scripts only). **Music = 9,617** (39,331 total items).
- Nothing running. Last commit: `ab2dae8` (hip-hop delta recovery, closes the discography pass).
- **Immediate next input:** the owner's provenance/age-ratings/awards prompt (§5). Start read-only (scope).
