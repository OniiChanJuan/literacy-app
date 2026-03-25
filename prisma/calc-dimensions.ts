/**
 * Calculate taste dimensions for items that don't have them.
 * Run: npx tsx prisma/calc-dimensions.ts
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calculateItemDimensions } from "../src/lib/taste-dimensions";

const DB_URL = "postgresql://postgres:Baylorlawsucks2021@db.shlyuoeabdaifketvaeo.supabase.co:5432/postgres";
const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find items where item_dimensions is SQL NULL
  const itemIds = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM items WHERE item_dimensions IS NULL
  `;

  const items = await prisma.item.findMany({
    where: { id: { in: itemIds.map(i => i.id) } },
    select: { id: true, genre: true, vibes: true, description: true, totalEp: true, voteCount: true, type: true },
  });

  console.log(`Calculating dimensions for ${items.length} items...`);
  let updated = 0;

  for (const item of items) {
    const dims = calculateItemDimensions(
      item.genre,
      item.vibes,
      item.description,
      item.totalEp,
      item.voteCount,
    );

    await prisma.item.update({
      where: { id: item.id },
      data: { itemDimensions: dims as any },
    });
    updated++;

    if (updated % 100 === 0) console.log(`  ${updated}/${items.length}`);
  }

  console.log(`✅ Updated ${updated} items with taste dimensions`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
