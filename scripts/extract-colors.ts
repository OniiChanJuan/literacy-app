/**
 * Extract dominant colors from all item cover images and store in DB.
 * Run: npx tsx scripts/extract-colors.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractColorsFromUrl } from "../src/lib/color-extract";

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const items = await prisma.item.findMany({
    where: { primaryColor: null },
    select: { id: true, title: true, cover: true },
  });

  console.log(`Found ${items.length} items without colors. Processing in batches of 20...\n`);

  let success = 0;
  let failed = 0;
  const BATCH_SIZE = 20;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        if (!item.cover || !item.cover.startsWith("http")) {
          return { id: item.id, title: item.title, colors: null };
        }
        const colors = await extractColorsFromUrl(item.cover);
        return { id: item.id, title: item.title, colors };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.colors) {
        await prisma.item.update({
          where: { id: result.value.id },
          data: {
            primaryColor: result.value.colors.primary,
            secondaryColor: result.value.colors.secondary,
          },
        });
        success++;
      } else {
        failed++;
        const title = result.status === "fulfilled" ? result.value.title : "unknown";
        console.log(`  ✗ Failed: ${title}`);
      }
    }

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);
    console.log(`  Batch ${batchNum}/${totalBatches} — ${success} success, ${failed} failed`);
  }

  console.log(`\nDone! ${success} items got colors extracted, ${failed} failed/no cover.`);
  await prisma.$disconnect();
}

main().catch(console.error);
