/**
 * Calculate taste dimensions for all items in the database.
 * Run: npx tsx scripts/calculate-dimensions.ts
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calculateItemDimensions } from "../src/lib/taste-dimensions";

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const items = await prisma.item.findMany({
    where: { itemDimensions: { equals: Prisma.DbNull } },
    select: { id: true, title: true, genre: true, vibes: true, description: true, totalEp: true, voteCount: true },
  });

  console.log(`Found ${items.length} items without dimensions. Processing...\n`);

  let count = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (item) => {
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
        count++;
      })
    );

    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)} — ${count} done`);
  }

  console.log(`\nDone! Calculated dimensions for ${count} items.`);
  await prisma.$disconnect();
}

main().catch(console.error);
