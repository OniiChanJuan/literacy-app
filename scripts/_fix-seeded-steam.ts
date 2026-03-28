import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Known Steam app IDs for games that were manually seeded without them
const KNOWN_STEAM_IDS: Record<number, number> = {
  9: 292030,    // The Witcher 3: Wild Hunt
  4: 1091500,   // Cyberpunk 2077
  30: 367520,   // Hollow Knight
  22: 504230,   // Celeste
  14: 1145360,  // Hades
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchSteamReviews(appId: number) {
  const url = `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const data = await res.json();
  const qs = data?.query_summary;
  if (!qs) return null;
  const pos = qs.total_positive ?? 0;
  const neg = qs.total_negative ?? 0;
  const total = pos + neg;
  if (total < 10) return null;
  return {
    score: Math.round((pos / total) * 100),
    label: qs.review_score_desc ?? '',
    totalReviews: total,
  };
}

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  for (const [itemIdStr, steamAppId] of Object.entries(KNOWN_STEAM_IDS)) {
    const itemId = parseInt(itemIdStr);
    const item: any = await prisma.item.findUnique({ where: { id: itemId }, select: { id: true, title: true, ext: true } });
    if (!item) { console.log(`Item ${itemId} not found`); continue; }

    // Set steam_app_id
    await prisma.item.update({ where: { id: itemId }, data: { steamAppId } });

    // Fetch label from Steam
    const result = await fetchSteamReviews(steamAppId);
    if (result) {
      console.log(`✓ [${itemId}] "${item.title}" → ${result.score}% "${result.label}" (${result.totalReviews.toLocaleString()} reviews)`);
      // Update ExternalScore
      await prisma.externalScore.upsert({
        where: { itemId_source: { itemId, source: 'steam' } },
        update: { score: result.score, maxScore: 100, scoreType: 'community', label: result.label, updatedAt: new Date() },
        create: { itemId, source: 'steam', score: result.score, maxScore: 100, scoreType: 'community', label: result.label },
      });
      // Update ext JSON
      const ext = (item.ext as Record<string, any>) || {};
      await prisma.item.update({
        where: { id: itemId },
        data: { ext: { ...ext, steam: result.score, steam_label: result.label } as any },
      });
    } else {
      console.log(`✗ [${itemId}] "${item.title}" — no Steam review data`);
    }
    await sleep(1000);
  }

  await prisma.$disconnect();
}
main().catch(console.error);
