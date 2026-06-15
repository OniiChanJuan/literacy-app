import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import { buildResolver, type CatItem } from "./_corpus-resolver";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL! });
  const prisma = new PrismaClient({ adapter });
  const items: CatItem[] = await prisma.item.findMany({ select: { id: true, title: true, type: true, year: true } });
  const { resolve } = buildResolver(items);

  const corpus = JSON.parse(fs.readFileSync("corpus-parsed.json", "utf-8"));
  const anchorPairs: { title: string; type: string }[] = Array.from(
    new Map(corpus.connections.map((c: any) => [`${c.anchor_title}|${c.anchor_cat_type}`, { title: c.anchor_title, type: c.anchor_cat_type }])).values()
  ) as any;

  const resolvedAnchorIds = new Set<number>();
  const unresolved: { title: string; type: string }[] = [];
  for (const a of anchorPairs) {
    const r = resolve(a.title, a.type);
    if (r) resolvedAnchorIds.add(r.itemId);
    else unresolved.push(a);
  }
  console.log(`Corpus anchors: ${anchorPairs.length}  resolved: ${resolvedAnchorIds.size}  unresolved: ${unresolved.length}`);
  if (unresolved.length) { console.log("UNRESOLVED anchors:"); unresolved.forEach((u) => console.log(`   [${u.type}] ${u.title}`)); }

  // legacy seed anchors
  const legacy = await prisma.crossConnection.findMany({ select: { id: true, sourceItemId: true } });
  const legacyAnchorIds = new Set(legacy.map((l) => l.sourceItemId));
  const covered = [...legacyAnchorIds].filter((id) => resolvedAnchorIds.has(id));
  const notCovered = [...legacyAnchorIds].filter((id) => !resolvedAnchorIds.has(id));

  // connection-level: how many of the 92 legacy rows belong to a covered anchor
  const coveredRows = legacy.filter((l) => resolvedAnchorIds.has(l.sourceItemId)).length;

  console.log(`\nLEGACY anchors: ${legacyAnchorIds.size}  covered-by-corpus: ${covered.length}  NOT-covered: ${notCovered.length}`);
  console.log(`LEGACY connection rows: ${legacy.length}  on covered anchors (→replace): ${coveredRows}  on NOT-covered anchors (→preserve as medium): ${legacy.length - coveredRows}`);
  if (notCovered.length) {
    const titles = await prisma.item.findMany({ where: { id: { in: notCovered } }, select: { id: true, title: true, type: true } });
    console.log("NOT-covered legacy anchors (their connections would be preserved, neutral medium):");
    titles.forEach((t) => console.log(`   #${t.id} [${t.type}] ${t.title}`));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
