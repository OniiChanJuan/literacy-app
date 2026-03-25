/**
 * Extract cover art colors for items that don't have them.
 * Run: npx tsx prisma/extract-colors.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractColorsFromUrl } from "../src/lib/color-extract";

const DB_URL = "postgresql://postgres:Baylorlawsucks2021@db.shlyuoeabdaifketvaeo.supabase.co:5432/postgres";
const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const items = await prisma.$queryRaw<{ id: number; cover: string }[]>`
    SELECT id, cover FROM items
    WHERE primary_color IS NULL
    AND cover IS NOT NULL AND cover LIKE 'http%'
    AND type IN ('music', 'podcast', 'comic')
    LIMIT 800
  `;

  console.log(`Extracting colors for ${items.length} items...`);
  let updated = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const colors = await extractColorsFromUrl(item.cover);
      if (colors) {
        await prisma.item.update({
          where: { id: item.id },
          data: {
            primaryColor: colors.primary,
            secondaryColor: colors.secondary,
          },
        });
        updated++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    if ((updated + failed) % 50 === 0) {
      console.log(`  ${updated + failed}/${items.length} (${updated} ok, ${failed} failed)`);
    }
  }

  console.log(`✅ Extracted colors for ${updated} items (${failed} failed)`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
