import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { qualityRank, meetsQualityFloor, normalizeScore, interleaveByType } from '../src/lib/ranking';

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

const ITEM_SELECT = {
  id: true, title: true, type: true, genre: true, vibes: true,
  year: true, cover: true, description: true, people: true,
  awards: true, platforms: true, ext: true, totalEp: true,
  popularityScore: true, voteCount: true,
} as const;

async function testTopRated() {
  console.log('\n=== TEST: curated=top_rated (cross-media) ===');
  const baseWhere: any = { isUpcoming: false, parentItemId: null };
  const typeQuotas = [
    { t: 'movie',   quota: 10, minVotes: 50 },
    { t: 'tv',      quota: 10, minVotes: 50 },
    { t: 'game',    quota: 5,  minVotes: 10 },
    { t: 'manga',   quota: 5,  minVotes: 50 },
    { t: 'book',    quota: 3,  minVotes: 5  },
    { t: 'music',   quota: 2,  minVotes: 0  },
    { t: 'comic',   quota: 2,  minVotes: 0  },
    { t: 'podcast', quota: 2,  minVotes: 0  },
  ];

  const perTypeItems = await Promise.all(
    typeQuotas.map(async ({ t, quota, minVotes }) => {
      const typeWhere: any = { ...baseWhere, type: t };
      if (minVotes > 0) typeWhere.voteCount = { gte: minVotes };

      const pool = await prisma.item.findMany({
        where: typeWhere,
        orderBy: { voteCount: 'desc' },
        take: quota * 6,
        select: ITEM_SELECT,
      });

      const filtered = pool.filter(i => meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }));
      const ranked = filtered
        .map(i => ({ ...i, rank: qualityRank({ ext: i.ext as any, type: i.type, year: i.year, voteCount: i.voteCount || 0 }) }))
        .sort((a, b) => b.rank - a.rank)
        .slice(0, quota);

      console.log(`  ${t}: pool=${pool.length} filtered=${filtered.length} returning=${ranked.length}`);
      return ranked;
    })
  );

  const merged = perTypeItems.flat().sort((a: any, b: any) => b.rank - a.rank);
  const interleaved = interleaveByType(merged);
  const page = interleaved.slice(0, 30);
  console.log(`  merged=${merged.length} interleaved=${interleaved.length} page=${page.length}`);
  console.log(`  Result is array: ${Array.isArray(page)}`);
  if (page.length > 0) console.log(`  First item: ${page[0].title} (${page[0].type})`);
  return page;
}

async function testHiddenGems() {
  console.log('\n=== TEST: curated=hidden_gems (cross-media) ===');
  const baseWhere: any = { isUpcoming: false, parentItemId: null };
  const SCORE_THRESHOLD = 0.65;
  const gemTypes = [
    { t: 'movie',  quota: 6 },
    { t: 'tv',     quota: 6 },
    { t: 'game',   quota: 5 },
    { t: 'manga',  quota: 5 },
    { t: 'book',   quota: 5 },
  ];

  const perTypeGems = await Promise.all(
    gemTypes.map(async ({ t, quota }) => {
      const pool = await prisma.item.findMany({
        where: { ...baseWhere, type: t, voteCount: { gte: 10, lt: 5000 } },
        orderBy: { year: 'desc' },
        take: quota * 8,
        select: ITEM_SELECT,
      });

      const filtered = pool.filter(i =>
        meetsQualityFloor({ ...i, ext: (i.ext || {}) as Record<string, number> }) &&
        normalizeScore(i.ext as any, i.type) >= SCORE_THRESHOLD
      );
      const ranked = filtered
        .map(i => {
          const norm = normalizeScore(i.ext as any, i.type);
          const gemScore = norm / Math.log10(Math.max(i.voteCount || 1, 10));
          return { ...i, gemScore };
        })
        .sort((a: any, b: any) => b.gemScore - a.gemScore)
        .slice(0, quota);

      console.log(`  ${t}: pool=${pool.length} filtered=${filtered.length} returning=${ranked.length}`);
      return ranked;
    })
  );

  const merged = perTypeGems.flat().sort((a: any, b: any) => b.gemScore - a.gemScore);
  const interleaved = interleaveByType(merged);
  const page = interleaved.slice(0, 30);
  console.log(`  merged=${merged.length} interleaved=${interleaved.length} page=${page.length}`);
  console.log(`  Result is array: ${Array.isArray(page)}`);
  if (page.length > 0) console.log(`  First item: ${page[0].title} (${page[0].type})`);
  return page;
}

async function main() {
  try {
    await testTopRated();
    await testHiddenGems();
    console.log('\n✅ Both queries succeeded — API should return valid arrays');
  } catch(e: any) {
    console.error('\n❌ ERROR:', e.message);
    console.error(e.stack?.slice(0, 800));
  }
  await prisma.$disconnect();
}

main().catch(console.error);
