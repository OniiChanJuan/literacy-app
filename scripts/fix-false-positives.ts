import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // 1. Remove 'Twilight of the Warriors: Walled In' from Twilight franchise
  const twilight = await prisma.item.findFirst({
    where: { title: { contains: 'Walled In', mode: 'insensitive' } },
  });
  if (twilight) {
    const r = await prisma.franchiseItem.deleteMany({ where: { itemId: twilight.id } });
    console.log(`✅ Removed "${twilight.title}" (#${twilight.id}) from ${r.count} franchise(s)`);
  } else {
    console.log('⏭  Twilight of the Warriors not found / already unlinked');
  }

  // 2. Remove 'X-Men and Philosophy' from X-Men franchise
  const xmen = await prisma.item.findFirst({ where: { title: 'X-Men and Philosophy' } });
  if (xmen) {
    const r = await prisma.franchiseItem.deleteMany({ where: { itemId: xmen.id } });
    console.log(`✅ Removed "${xmen.title}" (#${xmen.id}) from ${r.count} franchise(s)`);
  } else {
    console.log('⏭  X-Men and Philosophy not found / already unlinked');
  }

  // Final count
  const [total, unlinked] = await Promise.all([
    prisma.item.count({ where: { isUpcoming: false } }),
    prisma.item.count({ where: { franchiseItems: { none: {} }, isUpcoming: false } }),
  ]);
  const linked = total - unlinked;
  console.log(`\nCurrent: ${linked}/${total} items with franchise (${((linked/total)*100).toFixed(1)}%)`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
