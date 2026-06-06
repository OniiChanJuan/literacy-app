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
  AFFINITY_NEUTRAL,
  AFFINITY_MIN,
  AFFINITY_MAX,
  type AffinityRecItem,
  type AffinityConnection,
  type AffinityUser,
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

console.log("\n=== Results ===\n");
const failed = results.filter((r) => !r.ok);
console.log(`  ${results.length - failed.length} / ${results.length} passed`);
if (failed.length > 0) {
  console.log("\n  Failures:");
  for (const f of failed) console.log(`    ❌ ${f.name}: ${f.detail ?? ""}`);
  process.exit(1);
}
console.log("\n✅ ALL AFFINITY TESTS PASSED\n");
