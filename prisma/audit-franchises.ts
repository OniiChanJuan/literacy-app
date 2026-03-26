import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DB_URL = "postgresql://postgres:Baylorlawsucks2021@db.shlyuoeabdaifketvaeo.supabase.co:5432/postgres";
const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const franchises = await prisma.franchise.findMany({
    include: {
      items: { include: { item: { select: { id: true, title: true, type: true, year: true } } } },
      parentFranchise: { select: { id: true, name: true } },
      childFranchises: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  console.log(`=== FRANCHISE AUDIT ===`);
  console.log(`Total franchises: ${franchises.length}\n`);

  let parentCount = 0, childCount = 0;
  for (const f of franchises) {
    if (f.childFranchises.length > 0) parentCount++;
    if (f.parentFranchiseId) childCount++;
    const types = [...new Set(f.items.map(i => i.item.type))];
    const p2 = f.parentFranchise ? ` [child of: ${f.parentFranchise.name}]` : "";
    const c2 = f.childFranchises.length > 0 ? ` [parent: ${f.childFranchises.length} children]` : "";
    console.log(`${f.id}. ${f.name} | ${f.items.length} items (${types.join(", ")})${p2}${c2}`);
  }

  console.log(`\nParent universes: ${parentCount}`);
  console.log(`Child franchises: ${childCount}`);

  console.log(`\n=== FRANCHISES WITH 1-3 ITEMS ===`);
  for (const f of franchises.filter(f => f.items.length <= 3 && f.items.length > 0)) {
    console.log(`  ${f.name}: ${f.items.map(i => `${i.item.title} [${i.item.type}]`).join(", ")}`);
  }

  const empty = franchises.filter(f => f.items.length === 0);
  if (empty.length > 0) {
    console.log(`\n=== EMPTY FRANCHISES ===`);
    for (const f of empty) console.log(`  ${f.id}. ${f.name}`);
  }

  const total = await prisma.item.count({ where: { parentItemId: null, isUpcoming: false } });
  const distinctLinked = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT item_id) as count FROM franchise_items`;
  const linkedCount = Number(distinctLinked[0].count);
  console.log(`\nTotal items: ${total}`);
  console.log(`Items in franchises: ${linkedCount}`);
  console.log(`Items NOT in any franchise: ${total - linkedCount}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
