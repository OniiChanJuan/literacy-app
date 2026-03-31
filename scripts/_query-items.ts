import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const titles = [
    "Career Development in Bioengineering",
    "Swimming to Catalina",
    "Trailer Park King",
    "Dr. Berg's Healthy Keto",
    "The Rich Eisen Show",
    "WSJ What's News",
    "OK Computer",
  ];

  console.log("=== QUERY 1: Specific items ===\n");

  for (const title of titles) {
    const items = await prisma.item.findMany({
      where: { title: { contains: title, mode: 'insensitive' } },
      include: { externalScores: true },
    });

    if (items.length === 0) {
      console.log(`"${title}" — NOT FOUND`);
      console.log();
    } else {
      for (const item of items) {
        const scores = item.externalScores.map(
          (s) => `${s.source}: ${s.score}/${s.maxScore}`
        ).join(', ');
        const hasDims = item.itemDimensions !== null && item.itemDimensions !== undefined;
        const dimsPreview = hasDims
          ? JSON.stringify(item.itemDimensions).slice(0, 150)
          : 'NULL';
        console.log(`"${item.title}" (id=${item.id}, type=${item.type})`);
        console.log(`  voteCount: ${item.voteCount}`);
        console.log(`  externalScores: ${scores || 'none'}`);
        console.log(`  itemDimensions: ${dimsPreview}`);
        console.log();
      }
    }
  }

  console.log("=== QUERY 2: Items with null/empty itemDimensions ===\n");

  const totalItems = await prisma.item.count();
  const nullDims = await prisma.item.count({
    where: { itemDimensions: { equals: null } },
  });

  // Check for empty object or 'null' string
  const emptyDimsResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM items
    WHERE item_dimensions IS NOT NULL
    AND (item_dimensions::text = '{}' OR item_dimensions::text = 'null')
  `;
  const emptyDims = Number(emptyDimsResult[0].count);

  console.log(`Total items: ${totalItems}`);
  console.log(`Items with NULL itemDimensions: ${nullDims}`);
  console.log(`Items with empty ({} or 'null') itemDimensions: ${emptyDims}`);
  console.log(`Items with valid itemDimensions: ${totalItems - nullDims - emptyDims}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
