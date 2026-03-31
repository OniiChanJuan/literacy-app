import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });
async function main() {
  // Check people field format for a few known items
  const items = await prisma.item.findMany({
    where: { id: { in: [81, 1398, 295, 307, 323, 118] } },
    select: { id: true, title: true, people: true },
  });
  items.forEach(i => console.log(`[${i.id}] ${i.title}:\n  people: ${JSON.stringify(i.people)}\n`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
