/**
 * Audit the For You API scoring logic.
 *
 * Finds the user with the most ratings, then replays the scoring pipeline
 * from src/app/api/for-you/route.ts, printing the top 15 candidates for
 * "Picked for you" and "Discover across media" with detailed columns.
 *
 * Run: npx tsx scripts/_audit-foryou.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Import ranking helpers (relative paths — tsx doesn't resolve @/ alias) ──
import { normalizeScore, meetsQualityFloor } from "../src/lib/ranking";
import {
  tasteSimilarity,
  neutralDimensions,
  type TasteDimensions,
} from "../src/lib/taste-dimensions";

// ── Prisma setup ─────────────────────────────────────────────────────────────
const connUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DIRECT_URL;
if (!connUrl) {
  console.error("No DATABASE_URL found in env");
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

const NEUTRAL = neutralDimensions();
const NEUTRAL_VALUES = Object.values(NEUTRAL);

function isAllDefaults(dims: TasteDimensions | null | undefined): boolean {
  if (!dims) return true;
  const vals = Object.values(dims) as number[];
  if (vals.length !== NEUTRAL_VALUES.length) return true;
  return vals.every((v, i) => Math.abs(v - NEUTRAL_VALUES[i]) < 0.001);
}

async function main() {
  // 1. Find user with most ratings
  const topUsers = await prisma.$queryRaw<
    { user_id: string; cnt: bigint }[]
  >`SELECT user_id, COUNT(*) as cnt FROM ratings GROUP BY user_id ORDER BY cnt DESC LIMIT 5`;

  if (!topUsers.length) {
    console.log("No users with ratings found.");
    return;
  }

  const userId = topUsers[0].user_id;
  const ratingCount = Number(topUsers[0].cnt);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, tasteProfile: true },
  });

  console.log(`\n=== User: ${user?.name || user?.email} (${userId}) ===`);
  console.log(`   Ratings: ${ratingCount}`);
  console.log(
    `   Taste profile: ${user?.tasteProfile ? "YES" : "NO (null)"}\n`
  );

  const tasteProfile =
    (user?.tasteProfile as unknown as TasteDimensions) || null;
  if (!tasteProfile) {
    console.log("User has no taste profile — cannot run scoring.");
    return;
  }

  // Print taste profile
  console.log("Taste profile dimensions:");
  for (const [k, v] of Object.entries(tasteProfile)) {
    console.log(`   ${k}: ${(v as number).toFixed(3)}`);
  }
  console.log();

  // 2. Get rated items
  const ratings = await prisma.rating.findMany({
    where: { userId },
    select: { itemId: true, score: true, item: { select: { type: true } } },
  });
  const ratedIds = new Set(ratings.map((r) => r.itemId));

  // Type counts for discover logic
  const typeCounts: Record<string, number> = {};
  for (const r of ratings) {
    typeCounts[r.item.type] = (typeCounts[r.item.type] || 0) + 1;
  }
  console.log("Rated type breakdown:");
  for (const [t, c] of Object.entries(typeCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`   ${t}: ${c}`);
  }
  console.log();

  // 3. Get dismissed items
  const dismissed = await prisma.dismissedItem.findMany({
    where: { userId },
    select: { itemId: true },
  });
  const dismissedIds = new Set(dismissed.map((d) => d.itemId));

  // 4. Fetch candidate pool (same as route)
  const candidates = await prisma.item.findMany({
    where: { isUpcoming: false, parentItemId: null },
    select: {
      id: true,
      title: true,
      type: true,
      genre: true,
      vibes: true,
      year: true,
      cover: true,
      description: true,
      people: true,
      awards: true,
      platforms: true,
      ext: true,
      totalEp: true,
      popularityScore: true,
      voteCount: true,
      itemDimensions: true,
    },
  });

  console.log(`Total candidates in DB (non-upcoming, non-DLC): ${candidates.length}`);

  // 5. Filter pool (same as route)
  const pool = candidates.filter((c) => {
    if (ratedIds.has(c.id)) return false;
    if (dismissedIds.has(c.id)) return false;
    if (!c.cover || !c.cover.startsWith("http")) return false;
    if (!c.description || c.description.length < 20) return false;
    if (
      !meetsQualityFloor({
        ...c,
        ext: (c.ext || {}) as Record<string, number>,
      })
    )
      return false;
    return true;
  });

  console.log(`After filtering (rated/dismissed/cover/desc/qualityFloor): ${pool.length}`);

  // Count items with real dimensions vs defaults
  let withRealDims = 0;
  let withDefaultDims = 0;
  let withNoDims = 0;
  for (const c of pool) {
    const dims = c.itemDimensions as unknown as TasteDimensions | null;
    if (!dims || Object.keys(dims as any).length === 0) {
      withNoDims++;
    } else if (isAllDefaults(dims)) {
      withDefaultDims++;
    } else {
      withRealDims++;
    }
  }
  console.log(`   Real dimensions: ${withRealDims}`);
  console.log(`   All-0.5 defaults: ${withDefaultDims}`);
  console.log(`   No dimensions: ${withNoDims}\n`);

  // 6. Score all candidates (same as route)
  const scored = pool.map((c) => {
    const hasDimensions = !!(
      c.itemDimensions &&
      Object.keys(c.itemDimensions as any).length > 0
    );
    let dimScore = 0;
    if (hasDimensions) {
      dimScore = tasteSimilarity(
        tasteProfile,
        c.itemDimensions as unknown as TasteDimensions
      );
    }

    const norm = normalizeScore(
      (c.ext as any) || {},
      c.type
    );
    const quality = norm > 0 ? norm : 0.5;

    const score = hasDimensions
      ? dimScore * 0.6 + quality * 0.4
      : quality * 0.2;

    return {
      item: c,
      score,
      dimScore,
      quality,
      norm,
      hasDimensions,
      isDefault: isAllDefaults(
        c.itemDimensions as unknown as TasteDimensions
      ),
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // 7. Build "Picked for you" (personalPicks) — legacy path, max 20, max 5 per type
  const usedIds = new Set<number>();
  const personalPicks: typeof scored = [];
  const typeCountsPP: Record<string, number> = {};
  const maxPerType = 5;

  for (const s of scored) {
    if (usedIds.has(s.item.id)) continue;
    const tc = typeCountsPP[s.item.type] || 0;
    if (tc >= maxPerType) continue;
    typeCountsPP[s.item.type] = tc + 1;
    personalPicks.push(s);
    usedIds.add(s.item.id);
    if (personalPicks.length >= 20) break;
  }

  // 8. Build "Discover across media"
  const topType = Object.entries(typeCounts).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];

  const unexplored = scored.filter((s) => {
    if (usedIds.has(s.item.id)) return false;
    const typeRateCount = typeCounts[s.item.type] || 0;
    return typeRateCount < 3 && s.item.type !== topType;
  });

  const discoverAcrossMedia: typeof scored = [];
  const typeCountsDAM: Record<string, number> = {};

  for (const s of unexplored) {
    const tc = typeCountsDAM[s.item.type] || 0;
    if (tc >= 4) continue;
    typeCountsDAM[s.item.type] = tc + 1;
    discoverAcrossMedia.push(s);
    usedIds.add(s.item.id);
    if (discoverAcrossMedia.length >= 15) break;
  }

  // If not enough from unexplored types, fill with high-match different types
  if (discoverAcrossMedia.length < 8) {
    for (const s of scored) {
      if (usedIds.has(s.item.id)) continue;
      if (s.item.type === topType) continue;
      const tc = typeCountsDAM[s.item.type] || 0;
      if (tc >= 4) continue;
      typeCountsDAM[s.item.type] = tc + 1;
      discoverAcrossMedia.push(s);
      usedIds.add(s.item.id);
      if (discoverAcrossMedia.length >= 15) break;
    }
  }

  // ─── Print results ─────────────────────────────────────────────────────
  const ppIds = new Set(personalPicks.map((s) => s.item.id));
  const damIds = new Set(discoverAcrossMedia.map((s) => s.item.id));

  function printRow(s: typeof scored[0], idx: number, dupMark: boolean) {
    const i = s.item;
    const dimsLabel = !s.hasDimensions
      ? "NONE"
      : s.isDefault
      ? "DEFAULT(0.5)"
      : "REAL";
    const dup = dupMark ? " ** DUP **" : "";
    console.log(
      `  ${String(idx + 1).padStart(2)}. [${i.type.padEnd(7)}] ${i.title.slice(0, 45).padEnd(46)} ` +
        `norm=${s.norm.toFixed(3)} vc=${String(i.voteCount).padStart(6)} ` +
        `dims=${dimsLabel.padEnd(12)} dimS=${s.dimScore.toFixed(3)} ` +
        `qual=${s.quality.toFixed(3)} FINAL=${s.score.toFixed(4)}${dup}`
    );
  }

  console.log("═══ PICKED FOR YOU (top 15 of 20) ═══");
  personalPicks.slice(0, 15).forEach((s, i) => {
    const isDup = damIds.has(s.item.id);
    printRow(s, i, isDup);
  });

  console.log(`\n═══ DISCOVER ACROSS MEDIA (${discoverAcrossMedia.length} items) ═══`);
  console.log(`   (top type = "${topType}", excluded from discover)`);
  discoverAcrossMedia.slice(0, 15).forEach((s, i) => {
    const isDup = ppIds.has(s.item.id);
    printRow(s, i, isDup);
  });

  // Check for duplicates between lists
  const dupes = [...ppIds].filter((id) => damIds.has(id));
  if (dupes.length > 0) {
    console.log(`\n⚠  ${dupes.length} items appear in BOTH lists: ${dupes.join(", ")}`);
  } else {
    console.log("\nNo duplicates between the two lists.");
  }

  // ─── Distribution summary ─────────────────────────────────────────────
  console.log("\n─── Personal Picks type distribution ───");
  const ppTypes: Record<string, number> = {};
  personalPicks.forEach((s) => {
    ppTypes[s.item.type] = (ppTypes[s.item.type] || 0) + 1;
  });
  for (const [t, c] of Object.entries(ppTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${t}: ${c}`);
  }

  console.log("\n─── Discover type distribution ───");
  const damTypes: Record<string, number> = {};
  discoverAcrossMedia.forEach((s) => {
    damTypes[s.item.type] = (damTypes[s.item.type] || 0) + 1;
  });
  for (const [t, c] of Object.entries(damTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${t}: ${c}`);
  }

  // ─── Score distribution overview ──────────────────────────────────────
  console.log("\n─── Score distribution in full pool (top 50) ───");
  scored.slice(0, 50).forEach((s, i) => {
    const dimsLabel = !s.hasDimensions
      ? "NONE"
      : s.isDefault
      ? "DEF"
      : "REAL";
    console.log(
      `  ${String(i + 1).padStart(3)}. ${s.score.toFixed(4)} [${s.item.type.padEnd(7)}] ${s.item.title.slice(0, 40).padEnd(41)} dims=${dimsLabel} dimS=${s.dimScore.toFixed(3)} q=${s.quality.toFixed(3)}`
    );
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
