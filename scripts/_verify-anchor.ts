import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const BASE: Record<string, number> = { tight: 1.5, medium: 1.0, attenuated: 0.6 };
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL! });
  const prisma = new PrismaClient({ adapter });
  for (const name of ["Disco Elysium", "Red Dead Redemption 2"]) {
    const anchor = await prisma.item.findFirst({ where: { title: { equals: name, mode: "insensitive" }, type: "game" }, select: { id: true, title: true } });
    if (!anchor) { console.log(`!! ${name} not found`); continue; }
    const cards = await prisma.crossConnection.findMany({
      where: { sourceItemId: anchor.id, createdBy: "import" },
      include: { cluster: true, recs: { include: { recItem: { select: { title: true, type: true } }, pendingTitle: true } } },
      orderBy: { position: "asc" },
    });
    console.log(`\n#### ${anchor.title} (#${anchor.id}) — ${cards.length} clusters ####`);
    for (const c of cards) {
      const sorted = [...c.recs].sort((a, b) => (BASE[b.curatedStrength] - BASE[a.curatedStrength]) || a.position - b.position);
      console.log(`\n  ▸ [${c.cluster?.label}] spans=${c.cluster?.spans.join("/")}`);
      console.log(`    blurb: "${c.reason}"`);
      for (const r of sorted) {
        const t = r.recItem ? `${r.recItem.title} (${r.recItem.type})` : `PENDING:${r.pendingTitle?.titleAuthored} (${r.pendingTitle?.mediaAuthored})`;
        console.log(`      ${r.curatedStrength.padEnd(10)} → ${t}  ·threads: ${r.sharedThreads.slice(0,3).join(", ")}`);
      }
    }
  }
  // totals
  const [clusters, cards, recs, pending] = await Promise.all([
    prisma.connectionCluster.count(), prisma.crossConnection.count({ where: { createdBy: "import" } }),
    prisma.connectionRec.count(), prisma.connectionPendingTitle.count(),
  ]);
  console.log(`\n\nTOTALS: clusters=${clusters} import-cards=${cards} recs=${recs} pendingTitles=${pending}`);
  const byStrength = await prisma.connectionRec.groupBy({ by: ["curatedStrength"], _count: { _all: true } });
  console.log("recs by curated_strength:", byStrength.map(b => `${b.curatedStrength}:${b._count._all}`).join("  "));
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
