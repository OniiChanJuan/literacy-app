# Cross-shelf thumbs up/down audit — 2026-06-14 (READ-ONLY, nothing changed)

**Question:** what do the thumbs up/down buttons on the "Cross your shelf" cards do —
(a) stored, (b) stored-but-unused, or (c) dead no-op? And if not captured, what's the
minimal capture-only change?

**Answer: none of (a/b/c) as framed. The votes ARE stored *and* actively consumed — they
auto-mutate the curated connection strength.** The buttons aren't dead; they're *too live*
for the current pre-launch phase. The capture the owner wants already exists; what conflicts
with the deferred-Layer-2 rules is the mutation wired on top of it.

---

## Trace

1. **Click** → `ConnectionCard.submitVote()` in [cross-your-shelf.tsx:255](src/components/cross-your-shelf.tsx:255)
   → `POST /api/cross-connections/[id]/vote` with `{ vote: 1 | -1 | 0 }` (toggle: re-click clears).

2. **Stored?** YES. [vote/route.ts:56](src/app/api/cross-connections/[id]/vote/route.ts:56) upserts
   into **`cross_connection_votes`** — model `CrossConnectionVote`:
   `@@id([userId, connectionId])`, `vote Int` (+1/-1), **`createdAt DateTime @default(now())`**.
   `vote: 0` deletes the row. **So vote + user + connection + timestamp are already captured** —
   exactly the signal the owner asked to record.

3. **Also mutates curated strength.** The same handler then runs
   [vote/route.ts:65-72](src/app/api/cross-connections/[id]/vote/route.ts:65):
   ```sql
   UPDATE cross_connections
   SET quality_score = LEAST(2.0, GREATEST(0.0, quality_score + $delta))
   WHERE id = $connectionId
   ```
   `delta = (next − prev) × SCORE_DELTAS.voteUp` = ±0.1 per vote ([connection-score.ts:16](src/lib/connection-score.ts:16)).

4. **Consumed?** The mutated `quality_score` is the **primary live ranking + visibility signal**
   in [cross-connections/route.ts](src/app/api/cross-connections/route.ts):
   - **Hidden** everywhere if `quality_score < 0.3` (gte 0.3 filter, all three modes). ~7 downvotes
     from default 1.0 can bury a curated connection.
   - **Personalized** mode: `orderBy qualityScore desc` selects the candidate pool, then
     `finalScore = qualityScore × personalAffinity` ranks the slate; the serendipity slot is the
     highest **raw** qualityScore leftover.
   - **Trending** mode: `fetchEditorialFill(..., "top_quality")` → `ORDER BY quality_score DESC`.
   - The raw vote rows themselves are read back only to set `userVote` (pre-selected thumb state, display).

**Conclusion:** votes today **do** affect recommendation strength, ordering, and visibility — the
opposite of the desired deferred state ("record the signal, don't act on it").

---

## The bigger structural issue (material to Task A schema)

`cross_connections` has **one** score column, `quality_score` (default 1.0, clamp [0,2]). There is
**no separate immutable "curated editorial strength" column.** The editorial grade and the
community-adjusted score are the *same field*, mutated in place. **Four** live writers touch it:

| Writer | Delta | File |
|---|---|---|
| Thumbs vote | ±0.1 | [vote/route.ts:65](src/app/api/cross-connections/[id]/vote/route.ts:65) |
| Connection dismiss | −0.15 | [dismiss/route.ts:53](src/app/api/cross-connections/[id]/dismiss/route.ts:53) |
| Downstream signals (cover-click / library-add / rating tiers) | +0.02 … +0.40 / −0.30 | [connection-credit.ts:126](src/lib/connection-credit.ts:126) |
| Cron decay-to-mean | `q + (1.0 − q) × 0.05` | [cron/cleanup/route.ts:48](src/app/api/cron/cleanup/route.ts:48) |

So once the hand-authored corpus (Task A) is imported with graded strengths
(tight/medium/attenuated) **into `quality_score`**, every vote/dismiss/click/rating/cron-tick will
**irreversibly overwrite the editorial grade** — there's no original to recover. This violates the
owner's rule: *"curated connection strengths must never be auto-mutated by votes."*

---

## Recommendation (capture-only; do NOT implement yet — deferred Layer-2, owner review)

The capture is **already done** — no new table needed. The fix is **subtractive + architectural**,
not additive:

1. **Decouple capture from mutation (minimal, votes-only).** Remove the `quality_score` UPDATE block
   from [vote/route.ts:63-72](src/app/api/cross-connections/[id]/vote/route.ts:63). The vote row
   (with timestamp) still records; `userVote` read-back still drives the pre-selected thumb state.
   Net effect: the thumbs become **capture-only** — signal recorded, recommendation untouched.
   *(Behavior change: votes will no longer visibly move cards. That's the intended deferred state.)*

2. **Recommended, and it dovetails with Task A's schema:** split the single column into
   **`curated_strength`** (immutable editorial grade — the corpus's tight/medium/attenuated) and a
   **separate, optional, currently-unused community signal** (e.g. `community_score`, default null/neutral).
   Read-side ordering uses `curated_strength` only until vote-weighting is switched on (50+ users).
   Votes/dismisses/clicks accrue into the community lane (or just sit as raw rows) and **never** touch
   the curated grade. This is the clean home for Layer-2 weighting when it's time.

3. **Scope flag (out of thumbs scope, same principle):** dismiss, downstream-credit, and the cron
   decay also auto-mutate `quality_score`. If the rule is "curated strengths are immutable pre-launch,"
   all four writers should target the community lane, not the curated column. Worth a decision during
   the Task A schema review — calling it out so the schema is designed with the separation from day one.

**Status: reported, nothing changed. Awaiting owner direction before any code change.**
