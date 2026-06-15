import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const DELETE = process.argv.includes("--delete");
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const cutoff = new Date(Date.now() - 30 * 60 * 1000); // last 30 min
  const recent = await prisma.item.findMany({
    where: { createdAt: { gte: cutoff } },
    select: { id: true, title: true, type: true, year: true, createdAt: true },
    orderBy: { id: "asc" },
  });
  console.log(`Items created since ${cutoff.toISOString()}: ${recent.length}`);
  const byType: Record<string, number> = {};
  for (const r of recent) byType[r.type] = (byType[r.type] || 0) + 1;
  console.log("by type:", byType);
  for (const r of recent) console.log(`  #${r.id} [${r.type}] "${r.title}" ${r.year}`);
  if (DELETE && recent.length > 0) {
    const ids = recent.map((r) => r.id);
    await prisma.externalScore.deleteMany({ where: { itemId: { in: ids } } });
    const del = await prisma.item.deleteMany({ where: { id: { in: ids } } });
    console.log(`\nDELETED ${del.count} items (+ their external scores).`);
  } else if (recent.length > 0) {
    console.log("\n(dry — pass --delete to remove these)");
  }
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
