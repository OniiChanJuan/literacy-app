import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function removeItem(title: string, reason: string) {
  const item = await prisma.item.findFirst({ where: { title: { contains: title, mode: 'insensitive' } } });
  if (!item) { console.log(`  ⚠  Not found: "${title}"`); return; }
  const r = await prisma.franchiseItem.deleteMany({ where: { itemId: item.id } });
  console.log(`  ✅ Removed "${item.title}" (#${item.id}) from ${r.count} franchise(s) — ${reason}`);
}

async function main() {
  console.log('Cleaning Phase 2C false positives...\n');
  await removeItem('Invincible Surmise', 'Frank Belknap Long 1936 sci-fi novel, not Invincible comic');
  await removeItem('Twilight of the Warriors: Walled In', 'Hong Kong action film, not Twilight vampire series');
  await removeItem('Tomb Raider King', 'Korean manhwa about tomb diving, not Lara Croft franchise');

  const [total, unlinked] = await Promise.all([
    prisma.item.count({ where: { isUpcoming: false } }),
    prisma.item.count({ where: { franchiseItems: { none: {} }, isUpcoming: false } }),
  ]);
  const linked = total - unlinked;
  console.log(`\nCurrent: ${linked}/${total} (${((linked/total)*100).toFixed(1)}%)`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
