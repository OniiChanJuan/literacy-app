/**
 * Full diagnostic for curated=hidden_gems
 * Run: npx tsx scripts/_diag-hidden-gems.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { meetsQualityFloor, normalizeScore } from '../src/lib/ranking';

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

const ITEM_SELECT = {
  id: true, title: true, type: true, genre: true, vibes: true,
  year: true, cover: true, description: true, people: true,
  awards: true, platforms: true, ext: true, totalEp: true,
  popularityScore: true, voteCount: true,
} as const;

const SCORE_THRESHOLD = 0.65;
const GEM_TYPES = ['movie', 'tv', 'game', 'manga', 'book'];

async function main() {
  console.log('='.repeat(70));
  console.log('HIDDEN GEMS DIAGNOSTIC');
  console.log('='.repeat(70));

  // ── 1. Algorithm parameters ──────────────────────────────────────────────
  console.log('\n── ALGORITHM PARAMETERS ──');
  console.log(`  voteCount range:   >= 10  AND  < 5000`);
  console.log(`  score threshold:   normalizeScore >= ${SCORE_THRESHOLD} (= ${SCORE_THRESHOLD * 100}% of max scale)`);
  console.log(`  ranking formula:   normalizeScore / log10(max(voteCount, 10))`);
  console.log(`  diversity cap:     per-type quotas (movie:6, tv:6, game:5, manga:5, book:5) — total max 27`);
  console.log(`  cross-row dedup:   clientExclude removes items already in top_rated + popular rows`);
  console.log(`  cover art filter:  meetsQualityFloor() requires cover.startsWith("http")`);
  console.log(`  quality floor:     meetsQualityFloor() — varies by type (see below)`);

  // ── 2. Per-type funnel ────────────────────────────────────────────────────
  console.log('\n── PER-TYPE FUNNEL (quota × 8 pool per type) ──');

  const baseWhere: any = { isUpcoming: false, parentItemId: null };
  const quotas: Record<string, number> = { movie: 6, tv: 6, game: 5, manga: 5, book: 5 };
  const allGems: any[] = [];

  for (const t of GEM_TYPES) {
    const quota = quotas[t];
    const pool = await prisma.item.findMany({
      where: { ...baseWhere, type: t, voteCount: { gte: 10, lt: 5000 } },
      orderBy: { year: 'desc' },
      take: quota * 8,
      select: ITEM_SELECT,
    });

    // Step-by-step filter counts
    let step_pool = pool.length;

    const step1 = pool.filter(i => !(!i.cover || !i.cover.startsWith('http')));
    const nocover = step_pool - step1.length;

    const step2 = step1.filter(i => {
      if (i.type === 'comic' || i.type === 'podcast' || i.type === 'music') return true;
      if (i.type === 'book') {
        const norm = normalizeScore((i.ext || {}) as any, i.type);
        return (i.voteCount || 0) >= 5 || norm > 0;
      }
      if (!i.description || i.description.length < 20) return false;
      return true;
    });
    const nodesc = step1.length - step2.length;

    const step3 = step2.filter(i => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }));
    const nofloor = step2.length - step3.length;

    const step4 = step3.filter(i => normalizeScore((i.ext || {}) as any, i.type) >= SCORE_THRESHOLD);
    const noscore = step3.length - step4.length;

    // Rank survivors
    const ranked = step4.map(i => {
      const norm = normalizeScore((i.ext || {}) as any, i.type);
      const gemScore = norm / Math.log10(Math.max(i.voteCount || 1, 10));
      return { ...i, norm, gemScore };
    }).sort((a, b) => b.gemScore - a.gemScore);

    const chosen = ranked.slice(0, quota);
    allGems.push(...chosen);

    console.log(`\n  ${t.toUpperCase()} (quota=${quota}, pool_size=${quota * 8}):`);
    console.log(`    Fetched from DB:         ${step_pool}`);
    console.log(`    After cover filter:      ${step1.length}  (removed ${nocover} — no/bad cover URL)`);
    console.log(`    After desc filter:       ${step2.length}  (removed ${nodesc} — no/short description)`);
    console.log(`    After quality floor:     ${step3.length}  (removed ${nofloor} — fails meetsQualityFloor)`);
    console.log(`    After score >= ${SCORE_THRESHOLD}:     ${step4.length}  (removed ${noscore} — score too low)`);
    console.log(`    Chosen (top ${quota}):         ${chosen.length}`);

    if (chosen.length < quota) {
      console.log(`    ⚠  SHORTFALL: only ${chosen.length}/${quota} slots filled`);
    }

    // Show what the quality floor is doing for this type
    if (nofloor > 0) {
      console.log(`    Quality floor breakdown for ${t}:`);
      for (const i of step2.filter(item => !meetsQualityFloor({ ...item, ext: (item.ext || {}) as Record<string, number> })).slice(0, 3)) {
        const norm = normalizeScore((i.ext || {}) as any, i.type);
        console.log(`      FAIL: "${i.title}" vc=${i.voteCount} norm=${norm.toFixed(3)} desc=${i.description?.length ?? 0}chars`);
      }
    }
    if (noscore > 0) {
      console.log(`    Low-score failures (first 3):`);
      for (const i of step3.filter(item => normalizeScore((item.ext || {}) as any, item.type) < SCORE_THRESHOLD).slice(0, 3)) {
        const norm = normalizeScore((i.ext || {}) as any, i.type);
        const extKeys = Object.keys(i.ext as any || {}).join(', ');
        console.log(`      FAIL: "${i.title}" vc=${i.voteCount} norm=${norm.toFixed(3)} ext={${extKeys}}`);
      }
    }
  }

  // ── 3. Final merged list ──────────────────────────────────────────────────
  allGems.sort((a, b) => b.gemScore - a.gemScore);
  console.log('\n' + '='.repeat(70));
  console.log(`FINAL MERGED LIST: ${allGems.length} items (max 27 if all quotas filled)`);
  console.log('='.repeat(70));
  console.log(`${'#'.padStart(3)}  ${'Title'.padEnd(42)} ${'Type'.padEnd(7)} ${'VC'.padStart(5)} ${'Norm'.padStart(6)} ${'GemScore'.padStart(9)}`);
  console.log('-'.repeat(75));
  allGems.forEach((item, i) => {
    const isBlockbuster = item.voteCount > 2000;
    const flag = isBlockbuster ? ' ⚠ HIGH-VOTES' : '';
    console.log(
      `${String(i + 1).padStart(3)}  ${item.title.slice(0, 42).padEnd(42)} ${item.type.padEnd(7)} ${String(item.voteCount).padStart(5)} ${item.norm.toFixed(3).padStart(6)} ${item.gemScore.toFixed(4).padStart(9)}${flag}`
    );
  });

  // ── 4. Blockbuster check ──────────────────────────────────────────────────
  const blockbusters = allGems.filter(i => i.voteCount > 2000);
  if (blockbusters.length > 0) {
    console.log(`\n⚠  BLOCKBUSTERS IN GEMS (voteCount > 2000): ${blockbusters.length}`);
    blockbusters.forEach(i => console.log(`   "${i.title}" vc=${i.voteCount} norm=${i.norm.toFixed(3)}`));
  } else {
    console.log('\n✓ No blockbusters (all items have voteCount < 2000)');
  }

  // ── 5. Score quality check ────────────────────────────────────────────────
  const lowScore = allGems.filter(i => i.norm < 0.65);
  if (lowScore.length > 0) {
    console.log(`\n⚠  LOW-SCORE ITEMS (norm < 0.65): ${lowScore.length}`);
    lowScore.forEach(i => console.log(`   "${i.title}" norm=${i.norm.toFixed(3)} vc=${i.voteCount}`));
  } else {
    console.log('✓ All items meet the 0.65 score threshold');
  }

  // ── 6. Missing types ──────────────────────────────────────────────────────
  const typeCounts: Record<string, number> = {};
  allGems.forEach(i => { typeCounts[i.type] = (typeCounts[i.type] || 0) + 1; });
  console.log('\n── TYPE DISTRIBUTION IN FINAL LIST ──');
  GEM_TYPES.forEach(t => {
    const count = typeCounts[t] || 0;
    const quota = quotas[t];
    const flag = count < quota ? ` ⚠ SHORT (${count}/${quota})` : ` ✓ (${count}/${quota})`;
    console.log(`  ${t.padEnd(8)}: ${count}${flag}`);
  });

  // ── 7. What would the pool look like if we expanded thresholds? ───────────
  console.log('\n── THRESHOLD EXPANSION PREVIEW ──');
  for (const t of GEM_TYPES) {
    // What if we expanded to voteCount 10-20000 and score >= 0.60?
    const expanded = await prisma.item.findMany({
      where: { ...baseWhere, type: t, voteCount: { gte: 10, lt: 20000 } },
      orderBy: { year: 'desc' },
      take: 200,
      select: { id: true, title: true, type: true, ext: true, voteCount: true, cover: true, description: true, popularityScore: true },
    });
    const pass60 = expanded.filter(i =>
      i.cover?.startsWith('http') &&
      meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }) &&
      normalizeScore((i.ext || {}) as any, i.type) >= 0.60
    );
    const pass65 = pass60.filter(i => normalizeScore((i.ext || {}) as any, i.type) >= 0.65);
    console.log(`  ${t.padEnd(8)}: vc<5000 score≥0.65 → ${pass65.length} | vc<20000 score≥0.60 → ${pass60.length} items`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
