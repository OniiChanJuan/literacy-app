/**
 * Fix franchise items with missing cover images by fetching from Open Library.
 * Run: npx tsx scripts/fix-missing-covers.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractColorsFromUrl } from "../src/lib/color-extract";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchOpenLibrary(title: string): Promise<string | null> {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(title)}&limit=3`);
    if (!res.ok) return null;
    const data = await res.json();
    for (const doc of data.docs || []) {
      if (doc.cover_i) {
        return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const items = await prisma.item.findMany({
    where: {
      cover: "",
      franchiseItems: { some: {} },
    },
    select: { id: true, title: true, type: true },
  });

  console.log(`Found ${items.length} franchise items with empty covers.\n`);

  let fixed = 0;
  for (const item of items) {
    console.log(`  Searching for: ${item.title}...`);
    const coverUrl = await searchOpenLibrary(item.title);

    if (coverUrl) {
      const colors = await extractColorsFromUrl(coverUrl).catch(() => null);
      await prisma.item.update({
        where: { id: item.id },
        data: {
          cover: coverUrl,
          ...(colors ? { primaryColor: colors.primary, secondaryColor: colors.secondary } : {}),
        },
      });
      console.log(`    ✓ Fixed with cover + colors`);
      fixed++;
    } else {
      console.log(`    ✗ No cover found`);
    }

    await sleep(1000);
  }

  console.log(`\nDone! Fixed ${fixed}/${items.length} items.`);
  await prisma.$disconnect();
}

main().catch(console.error);
