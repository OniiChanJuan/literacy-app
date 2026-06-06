/**
 * Unit tests for src/lib/connection-affinity.ts.
 *
 * Pure-function tests on synthetic users + connections. No DB.
 *
 * Run: npx tsx scripts/_test-connection-affinity.ts
 */
import {
  computeConnectionAffinity,
  computeDimMatch,
  computeTagMatch,
  computeSourceAffinity,
  buildHighRatedTagBag,
  selectPersonalizedSlate,
  AFFINITY_NEUTRAL,
  AFFINITY_MIN,
  AFFINITY_MAX,
  type AffinityRecItem,
  type AffinityConnection,
  type AffinityUser,
  type PersonalizedCandidate,
} from "../src/lib/connection-affinity";
import { neutralDimensions, type TasteDimensions } from "../src/lib/taste-dimensions";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  — ${detail}` : ""}`);
}

function near(a: number, b: number, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}
function inRange(v: number, lo: number, hi: number) {
  return v >= lo && v <= hi;
}

// ── Synthetic data ──────────────────────────────────────────────────────

function darkProfile(): TasteDimensions {
  return {
    ...neutralDimensions(),
    dark_vs_light: 0.95,
    serious_vs_fun: 0.85,
    violence_tolerance: 0.85,
  };
}
function lightProfile(): TasteDimensions {
  return {
    ...neutralDimensions(),
    dark_vs_light: 0.05,
    serious_vs_fun: 0.15,
    violence_tolerance: 0.10,
  };
}
function darkRecDims(): TasteDimensions {
  return {
    ...neutralDimensions(),
    dark_vs_light: 0.90,
    serious_vs_fun: 0.85,
    violence_tolerance: 0.80,
  };
}
function lightRecDims(): TasteDimensions {
  return {
    ...neutralDimensions(),
    dark_vs_light: 0.10,
    serious_vs_fun: 0.15,
    violence_tolerance: 0.10,
  };
}

function makeRec(opts: { dims?: TasteDimensions | null; genre?: string[]; vibes?: string[] }): AffinityRecItem {
  return {
    id: Math.floor(Math.random() * 1e9),
    itemDimensions: opts.dims ?? null,
    genre: opts.genre ?? [],
    vibes: opts.vibes ?? [],
  };
}

function makeConn(themeTags: string[], recs: AffinityRecItem[]): AffinityConnection {
  return { themeTags, recommendedItems: recs };
}

// ── Tests ───────────────────────────────────────────────────────────────

console.log("\n=== Unit tests: computeSourceAffinity ===\n");
{
  record("source.no-rating → 0.5",        computeSourceAffinity(null) === 0.5);
  record("source.score 5 → 1.0",          computeSourceAffinity({ score: 5, recommendTag: null }) === 1.0);
  record("source.score 4 → 0.8",          computeSourceAffinity({ score: 4, recommendTag: null }) === 0.8);
  record("source.score 3 → 0.5",          computeSourceAffinity({ score: 3, recommendTag: null }) === 0.5);
  record("source.score 2 → 0.2",          computeSourceAffinity({ score: 2, recommendTag: null }) === 0.2);
  record("source.score 1 → 0.2",          computeSourceAffinity({ score: 1, recommendTag: null }) === 0.2);
  record("source.recommendTag=recommend → 1.0 (overrides score)",
    computeSourceAffinity({ score: 3, recommendTag: "recommend" }) === 1.0);
  record("source.recommendTag=skip → 0.2 (overrides score)",
    computeSourceAffinity({ score: 4, recommendTag: "skip" }) === 0.2);
  record("source.recommendTag=mixed → falls through to score",
    computeSourceAffinity({ score: 4, recommendTag: "mixed" }) === 0.8);
}

console.log("\n=== Unit tests: computeDimMatch ===\n");
{
  record("dim.null user → null", computeDimMatch(null, [makeRec({ dims: darkRecDims() })]) === null);
  record("dim.no recs with dims → null",
    computeDimMatch(darkProfile(), [makeRec({}), makeRec({})]) === null);
  const m1 = computeDimMatch(darkProfile(), [makeRec({ dims: darkRecDims() })]);
  record("dim.dark user + dark rec → high (>0.6)", m1 !== null && m1 > 0.6, `value=${m1?.toFixed(3)}`);
  const m2 = computeDimMatch(darkProfile(), [makeRec({ dims: lightRecDims() })]);
  record("dim.dark user + light rec → low (<0.5)", m2 !== null && m2 < 0.5, `value=${m2?.toFixed(3)}`);
  const m3a = computeDimMatch(neutralDimensions(), [makeRec({ dims: neutralDimensions() })]);
  record("dim.neutral user + neutral rec → 1.0",
    m3a !== null && near(m3a, 1.0, 1e-9), `value=${m3a?.toFixed(3)}`);
  const m3b = computeDimMatch(neutralDimensions(), [makeRec({ dims: darkRecDims() })]);
  // Neutral user has no preference strengths, so weights are floored at
  // 0.1 across all dims (per tasteSimilarity); the metric becomes plain
  // Euclidean distance. Dark rec vs. neutral user → distance is real,
  // similarity ~0.8 (NOT 1.0 — neutral does not mean "indifferent").
  record("dim.neutral user + extreme rec → meaningful distance (~0.8, not 1.0)",
    m3b !== null && inRange(m3b, 0.7, 0.9), `value=${m3b?.toFixed(3)}`);
  const m4 = computeDimMatch(
    darkProfile(),
    [makeRec({ dims: darkRecDims() }), makeRec({ dims: lightRecDims() }), makeRec({})],
  );
  record("dim.mean over recs that have dims", m4 !== null && m4 > 0.4 && m4 < 0.7, `value=${m4?.toFixed(3)} (mean of dark+light)`);
}

console.log("\n=== Unit tests: computeTagMatch ===\n");
{
  const userTags = new Set(["horror", "dark", "atmospheric"]);
  {
    const conn = makeConn(["horror"], [makeRec({ genre: ["horror"], vibes: ["dark"] })]);
    const t = computeTagMatch(conn, userTags);
    // bag = {horror, dark}, userTags = {horror, dark, atmospheric}
    // intersection = 2, union = 3
    record("tag.partial overlap → 2/3", near(t, 2 / 3, 1e-9), `value=${t.toFixed(4)}`);
  }
  {
    const conn = makeConn([], [makeRec({ genre: ["comedy"], vibes: ["wholesome"] })]);
    const t = computeTagMatch(conn, userTags);
    record("tag.zero overlap → 0", t === 0);
  }
  {
    const t = computeTagMatch(makeConn(["horror"], []), new Set<string>());
    record("tag.empty user bag → 0", t === 0);
  }
  {
    const t = computeTagMatch(makeConn([], [makeRec({})]), userTags);
    record("tag.empty conn bag → 0", t === 0);
  }
  {
    const conn = makeConn(["horror", "dark", "atmospheric"], [makeRec({ genre: ["horror"], vibes: ["dark"] })]);
    const t = computeTagMatch(conn, userTags);
    record("tag.full overlap → 1.0", near(t, 1.0, 1e-9), `value=${t.toFixed(4)}`);
  }
  {
    // Case-insensitive + trim
    const conn = makeConn(["  HORROR  "], [makeRec({ genre: ["Horror"], vibes: ["DARK"] })]);
    const t = computeTagMatch(conn, new Set(["horror", "dark"]));
    record("tag.case-insensitive + trim → 1.0", near(t, 1.0, 1e-9), `value=${t.toFixed(4)}`);
  }
}

console.log("\n=== Unit tests: buildHighRatedTagBag ===\n");
{
  const bag = buildHighRatedTagBag([
    { score: 5, item: { genre: ["Horror", "Thriller"], vibes: ["Dark", "Atmospheric"] } },
    { score: 4, item: { genre: ["Sci-Fi"], vibes: ["Mind-Bending"] } },
    { score: 3, item: { genre: ["Comedy"], vibes: ["Wholesome"] } },   // excluded
    { score: 1, item: { genre: ["Drama"], vibes: ["Sad"] } },           // excluded
  ]);
  record("bag.only ≥4 ratings contribute", bag.size === 6 && !bag.has("comedy") && !bag.has("drama"),
    `bag=${[...bag].sort().join(",")}`);
  record("bag.lowercased", bag.has("horror") && bag.has("dark") && bag.has("mind-bending"));
}

console.log("\n=== Composition: computeConnectionAffinity ===\n");
{
  // Helper for clean assertions
  function aff(user: AffinityUser, conn: AffinityConnection) {
    return computeConnectionAffinity({ user, connection: conn });
  }

  // Case 1: dark user, dark rec, source rated 5 → high affinity
  {
    const conn = makeConn(["horror"], [makeRec({ dims: darkRecDims(), genre: ["horror"], vibes: ["dark"] })]);
    const user: AffinityUser = {
      tasteProfile: darkProfile(),
      highRatedTags: new Set(["horror", "dark"]),
      sourceRating: { score: 5, recommendTag: null },
    };
    const r = aff(user, conn);
    record("case1.dark+dark+5★ → affinity > 1.2",
      inRange(r.affinity, AFFINITY_MIN, AFFINITY_MAX) && r.affinity > 1.2, `aff=${r.affinity.toFixed(3)}`);
    record("case1.uses dim signal",  r.hasDimSignal);
  }

  // Case 2: dark user, light rec, source rated 5 → mid-low (some src boost,
  // but dim+tag drag down)
  {
    const conn = makeConn(["comedy"], [makeRec({ dims: lightRecDims(), genre: ["comedy"], vibes: ["wholesome"] })]);
    const user: AffinityUser = {
      tasteProfile: darkProfile(),
      highRatedTags: new Set(["horror", "dark"]),
      sourceRating: { score: 5, recommendTag: null },
    };
    const r = aff(user, conn);
    record("case2.dark+light+5★ → affinity < 1.0 (dim+tag drag)",
      inRange(r.affinity, AFFINITY_MIN, AFFINITY_MAX) && r.affinity < 1.0, `aff=${r.affinity.toFixed(3)}`);
  }

  // Case 3: neutral user (no profile signal yet) + dark rec → near-neutral
  // affinity. The "neutral user" doesn't mean "indifferent" — they have
  // no preference strength, so dim distance still computes against the
  // extreme rec, and tag/src are empty/neutral. Cold-start behavior.
  {
    const conn = makeConn(["horror"], [makeRec({ dims: darkRecDims(), genre: ["horror"] })]);
    const user: AffinityUser = {
      tasteProfile: neutralDimensions(),
      highRatedTags: new Set(),
      sourceRating: null,
    };
    const r = aff(user, conn);
    // dim ~= 0.807 (neutral vs extreme), tag = 0 (empty bag), src = 0.5
    // affinity = 0.5 + 0.5*0.807 + 0.3*0 + 0.2*0.5 ≈ 1.003
    record("case3.neutral user → ~1.0 (cold-start: no meaningful preference yet)",
      near(r.affinity, 1.003, 0.01), `aff=${r.affinity.toFixed(3)}`);
  }

  // Case 4: no dims anywhere on recs → falls back to tag+src with redistribution
  {
    const conn = makeConn(["horror"], [makeRec({ genre: ["horror"], vibes: ["dark"] })]);
    const user: AffinityUser = {
      tasteProfile: darkProfile(),
      highRatedTags: new Set(["horror", "dark"]),
      sourceRating: { score: 5, recommendTag: null },
    };
    const r = aff(user, conn);
    record("case4.no-dim path → hasDimSignal=false", !r.hasDimSignal);
    // tag = 1.0 (full overlap), src = 1.0
    // affinity = 0.5 + (0.60 * 1.0 + 0.40 * 1.0) = 1.5 → max
    record("case4.no-dim full match → affinity = 1.5 (max)",
      near(r.affinity, AFFINITY_MAX, 1e-9), `aff=${r.affinity.toFixed(3)}`);
  }

  // Case 5: no dims, partial tag, source rated 4
  {
    const conn = makeConn([], [makeRec({ genre: ["horror"], vibes: [] })]);
    const user: AffinityUser = {
      tasteProfile: darkProfile(),
      highRatedTags: new Set(["horror", "dark", "atmospheric"]),
      sourceRating: { score: 4, recommendTag: null },
    };
    const r = aff(user, conn);
    // tag bag = {horror}, user bag = {horror, dark, atmospheric}
    // intersect = 1, union = 3 → tag = 1/3
    // src = 0.8
    // affinity = 0.5 + (0.60 * 1/3 + 0.40 * 0.8) = 0.5 + 0.2 + 0.32 = 1.02
    record("case5.partial tag + 4★ + no dims → ~1.02",
      near(r.affinity, 1.02, 1e-9), `aff=${r.affinity.toFixed(3)}`);
  }

  // Case 6: weights sum to 1 (sanity)
  {
    const conn = makeConn(
      ["horror"],
      [makeRec({ dims: darkRecDims(), genre: ["horror"], vibes: ["dark"] })],
    );
    const user: AffinityUser = {
      tasteProfile: darkProfile(),
      highRatedTags: new Set(["horror", "dark"]),
      sourceRating: { score: 5, recommendTag: null },
    };
    const r = aff(user, conn);
    record("case6.bounded in [0.5, 1.5]",
      inRange(r.affinity, AFFINITY_MIN, AFFINITY_MAX), `aff=${r.affinity.toFixed(3)}`);
  }

  // Case 7: signed-out / no user signal at all
  {
    const conn = makeConn(["horror"], [makeRec({ dims: darkRecDims() })]);
    const user: AffinityUser = {
      tasteProfile: null,
      highRatedTags: new Set(),
      sourceRating: null,
    };
    const r = aff(user, conn);
    // dim → null (no profile), tag → 0 (empty bag), src → 0.5
    // With no-dim weights: 0.60 * 0 + 0.40 * 0.5 = 0.20 → affinity = 0.70
    record("case7.no signal → degrades to source-only",
      near(r.affinity, 0.70, 1e-9), `aff=${r.affinity.toFixed(3)}`);
    record("case7.no signal → AFFINITY_NEUTRAL only if also neutral src",
      AFFINITY_NEUTRAL === 1.0);
  }

  // Case 8: source rated 2 (skip-equivalent) flips the source affinity
  {
    const conn = makeConn(["horror"], [makeRec({ dims: darkRecDims(), genre: ["horror"], vibes: ["dark"] })]);
    const userPositive: AffinityUser = {
      tasteProfile: darkProfile(),
      highRatedTags: new Set(["horror", "dark"]),
      sourceRating: { score: 5, recommendTag: null },
    };
    const userNegative: AffinityUser = { ...userPositive, sourceRating: { score: 2, recommendTag: null } };
    const rPos = aff(userPositive, conn);
    const rNeg = aff(userNegative, conn);
    record("case8.source 2★ drags affinity below 5★ case",
      rNeg.affinity < rPos.affinity, `5★=${rPos.affinity.toFixed(3)}  2★=${rNeg.affinity.toFixed(3)}`);
    // Difference = (1.0 - 0.2) * 0.20 = 0.16
    record("case8.delta = 0.20 * (1.0 - 0.2) = 0.16",
      near(rPos.affinity - rNeg.affinity, 0.16, 1e-9), `delta=${(rPos.affinity - rNeg.affinity).toFixed(4)}`);
  }
}

// ── Stage 4b: slate selection ───────────────────────────────────────────

console.log("\n=== Stage 4b: selectPersonalizedSlate ===\n");
{
  const c = (id: number, sourceItemId: number, qualityScore: number, personalAffinity: number) =>
    ({ id, sourceItemId, qualityScore, personalAffinity }) as PersonalizedCandidate;

  // Helper to verbose-print order
  const idsOf = (arr: { id: number; isSerendipity?: boolean }[]) =>
    arr.map((x) => `${x.id}${x.isSerendipity ? "*" : ""}`).join(",");

  // Case 1: simple — affinity flips order
  // 3 candidates, all distinct sources, no serendipity (pool < 6).
  {
    // Without affinity, order by quality desc would be: A, B, C
    // With affinity:
    //   A: 1.5 × 0.6 = 0.90
    //   B: 1.0 × 1.4 = 1.40   ← winner
    //   C: 1.4 × 1.0 = 1.40   ← tied with B but higher id loses
    // So final order: B, C, A
    const slate = selectPersonalizedSlate([
      c(1, 100, 1.5, 0.6),
      c(2, 200, 1.0, 1.4),
      c(3, 300, 1.4, 1.0),
    ], { totalSlots: 6, primarySlots: 5 });
    record("4b.case1.sort by final_score, id tiebreak", idsOf(slate.chosen) === "2,3,1", `chosen=${idsOf(slate.chosen)}`);
    record("4b.case1.no serendipity when pool<totalSlots", slate.serendipityId === null);
  }

  // Case 2: distinct-source diversity preferred in primary slots
  // Sources: 1 has 2 candidates, 2 has 1 candidate, 3 has 1 candidate.
  // After sort by final_score: A(src1, fin=1.4), B(src1, fin=1.3), C(src2, fin=1.2), D(src3, fin=1.0)
  // firstPass = [A (src1 first), C (src2 first), D (src3 first)]   — diversity prefers
  // secondPass = [B]
  // primary[5] = [A, C, D, B] (no serendipity because nothing left)
  {
    const slate = selectPersonalizedSlate([
      c(101, 1, 1.4, 1.0),     // A
      c(102, 1, 1.3, 1.0),     // B (same source as A)
      c(103, 2, 1.2, 1.0),     // C
      c(104, 3, 1.0, 1.0),     // D
    ], { totalSlots: 6, primarySlots: 5 });
    record("4b.case2.distinct-source diversity wins over raw final_score within primary",
      idsOf(slate.chosen) === "101,103,104,102",
      `chosen=${idsOf(slate.chosen)}`);
  }

  // Case 3: serendipity slot picks highest RAW quality from remaining
  // 6 candidates needed. Primary slots take top 5 by final_score with
  // diversity. Serendipity slot is the leftover by raw quality.
  //
  // Candidates (id, src, qs, aff, final = qs*aff):
  //   201 src=A qs=2.0 aff=0.5 final=1.0   ← high raw, low aff
  //   202 src=B qs=1.8 aff=0.9 final=1.62
  //   203 src=C qs=1.5 aff=1.2 final=1.80
  //   204 src=D qs=1.2 aff=1.4 final=1.68
  //   205 src=E qs=1.0 aff=1.5 final=1.50
  //   206 src=F qs=0.9 aff=1.5 final=1.35
  //   207 src=G qs=0.6 aff=1.5 final=0.90
  //
  // Final order: 203(1.80), 204(1.68), 202(1.62), 205(1.50), 206(1.35), 201(1.00), 207(0.90)
  // Primary 5 (all distinct sources already): 203, 204, 202, 205, 206
  // Remaining: 201, 207
  // Serendipity by raw qs: 201 (qs=2.0). Source A not in primary — pick wins.
  {
    const slate = selectPersonalizedSlate([
      c(201, 1, 2.0, 0.5),
      c(202, 2, 1.8, 0.9),
      c(203, 3, 1.5, 1.2),
      c(204, 4, 1.2, 1.4),
      c(205, 5, 1.0, 1.5),
      c(206, 6, 0.9, 1.5),
      c(207, 7, 0.6, 1.5),
    ], { totalSlots: 6, primarySlots: 5 });

    record("4b.case3.primary slots in final_score order with diversity",
      idsOf(slate.chosen).startsWith("203,204,202,205,206"),
      `chosen=${idsOf(slate.chosen)}`);
    record("4b.case3.serendipity = highest raw quality of remaining",
      slate.serendipityId === 201,
      `serendipityId=${slate.serendipityId}`);
    record("4b.case3.serendipity marked with isSerendipity flag",
      slate.chosen[5].isSerendipity === true && slate.chosen[5].id === 201);
    record("4b.case3.slate length = 6", slate.chosen.length === 6);
  }

  // Case 4: serendipity respects source diversity preference
  // 6 candidates, top 5 cover sources 1-5, remaining candidate is from
  // source 1 (already seen). When no remaining candidate has a new source,
  // the helper still picks the highest-raw-quality remaining candidate.
  {
    const slate = selectPersonalizedSlate([
      c(301, 1, 2.0, 1.5),     // primary slot 1
      c(302, 2, 1.5, 1.5),     // primary slot 2
      c(303, 3, 1.4, 1.5),     // primary slot 3
      c(304, 4, 1.3, 1.5),     // primary slot 4
      c(305, 5, 1.2, 1.5),     // primary slot 5
      c(306, 1, 1.1, 1.0),     // remaining — same source as 301
    ], { totalSlots: 6, primarySlots: 5 });

    record("4b.case4.serendipity falls back when no new source available",
      slate.serendipityId === 306,
      `serendipityId=${slate.serendipityId}`);
  }

  // Case 5: serendipity prefers a NEW source over a higher-quality
  // candidate from an already-seen source.
  // Primary 5 uses sources 1-5. Two remaining:
  //   401 src=1 (already seen) qs=1.9
  //   402 src=6 (new!)         qs=1.0
  // Helper prefers 402 even though 401 has higher quality, because
  // 402 introduces a new source. This mirrors the diversity preference.
  {
    const slate = selectPersonalizedSlate([
      c(401, 1, 1.9, 1.0),
      c(402, 6, 1.0, 1.0),
      c(403, 2, 2.0, 1.5),     // primary
      c(404, 3, 1.8, 1.5),     // primary
      c(405, 4, 1.6, 1.5),     // primary
      c(406, 5, 1.4, 1.5),     // primary
      c(407, 1, 1.5, 1.5),     // primary (covers source 1)
    ], { totalSlots: 6, primarySlots: 5 });

    record("4b.case5.serendipity prefers new-source candidate over higher-quality-but-seen-source",
      slate.serendipityId === 402,
      `serendipityId=${slate.serendipityId} (expected 402 since src6 is new)`);
  }

  // Case 6: empty input
  {
    const slate = selectPersonalizedSlate([], { totalSlots: 6, primarySlots: 5 });
    record("4b.case6.empty input → empty slate", slate.chosen.length === 0 && slate.serendipityId === null);
  }

  // Case 7: exactly TOTAL_SLOTS candidates with distinct sources — all 6 fit, slot 6 = serendipity
  {
    const slate = selectPersonalizedSlate([
      c(701, 1, 1.5, 1.0),     // 1.5
      c(702, 2, 1.4, 1.0),     // 1.4
      c(703, 3, 1.3, 1.0),     // 1.3
      c(704, 4, 1.2, 1.0),     // 1.2
      c(705, 5, 1.1, 1.0),     // 1.1
      c(706, 6, 2.0, 0.5),     // 1.0  ← lowest final, highest raw qs
    ], { totalSlots: 6, primarySlots: 5 });
    record("4b.case7.slot 6 = serendipity even when full", slate.serendipityId === 706);
    record("4b.case7.primary in final_score order", idsOf(slate.chosen).startsWith("701,702,703,704,705"));
  }

  // Case 8: invariant — no candidate appears twice
  {
    const slate = selectPersonalizedSlate([
      c(801, 1, 1.0, 1.0),
      c(802, 2, 1.0, 1.0),
      c(803, 3, 1.0, 1.0),
      c(804, 4, 1.0, 1.0),
      c(805, 5, 1.0, 1.0),
      c(806, 6, 1.0, 1.0),
    ], { totalSlots: 6, primarySlots: 5 });
    const ids = slate.chosen.map((c) => c.id);
    const unique = new Set(ids);
    record("4b.case8.no candidate appears twice", unique.size === ids.length);
  }

  // Case 9: invariant — primarySlots > totalSlots throws
  {
    let threw = false;
    try { selectPersonalizedSlate([], { totalSlots: 3, primarySlots: 5 }); }
    catch { threw = true; }
    record("4b.case9.invariant primarySlots ≤ totalSlots", threw);
  }
}

console.log("\n=== Results ===\n");
const failed = results.filter((r) => !r.ok);
console.log(`  ${results.length - failed.length} / ${results.length} passed`);
if (failed.length > 0) {
  console.log("\n  Failures:");
  for (const f of failed) console.log(`    ❌ ${f.name}: ${f.detail ?? ""}`);
  process.exit(1);
}
console.log("\n✅ ALL AFFINITY TESTS PASSED\n");
