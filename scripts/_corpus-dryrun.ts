import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import { buildResolver, norm, type CatItem } from "./_corpus-resolver";

const VAGUE = new Set(["studio ghibli films","the before trilogy","joe abercrombie s other books","joe abercrombies other books","philip k dick stories"].map(norm));

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL! });
  const prisma = new PrismaClient({ adapter });
  const items: CatItem[] = await prisma.item.findMany({ select: { id: true, title: true, type: true, year: true } });
  const { resolve } = buildResolver(items);
  const corpus = JSON.parse(fs.readFileSync("corpus-parsed.json", "utf-8"));
  const conns = corpus.connections as any[];

  // anchors
  const anchorPairs = Array.from(new Map(conns.map((c) => [`${norm(c.anchor_title)}|${c.anchor_cat_type}`, { title: c.anchor_title, type: c.anchor_cat_type }])).values()) as any[];
  const unresolvedAnchors = anchorPairs.filter((a) => !resolve(a.title, a.type));

  // recs
  let resolved = 0, pending = 0, vague = 0;
  const flagAddButPresent: any[] = [];   // §2A
  const flagInCatButPending: any[] = []; // §2B
  const pendingByMedia: Record<string, Set<string>> = {};
  for (const c of conns) {
    if (VAGUE.has(norm(c.rec_title))) { vague++; continue; }
    const r = resolve(c.rec_title, c.rec_media || "");
    const flag = (c.in_catalog_flag || "").toLowerCase();
    if (r) {
      resolved++;
      if (flag.startsWith("add")) flagAddButPresent.push(c.rec_title);
    } else {
      pending++;
      (pendingByMedia[c.rec_media] ??= new Set()).add(c.rec_title);
      if (flag.startsWith("in cat")) flagInCatButPending.push(`${c.rec_title} [${c.rec_media}]`);
    }
  }
  console.log(`CONNECTIONS: ${conns.length}`);
  console.log(`  anchors: ${anchorPairs.length}  unresolved: ${unresolvedAnchors.length} -> ${unresolvedAnchors.map(a=>`${a.title}(${a.type})`).join(", ")}`);
  console.log(`  recs resolved (→ live): ${resolved}`);
  console.log(`  recs pending  (→ queue): ${pending}`);
  console.log(`  recs vague/non-ingestable (→ drop): ${vague}`);
  console.log(`\n§2A corrections (flag 'ADD IT' but actually PRESENT → import LIVE): ${new Set(flagAddButPresent.map(norm)).size} distinct titles, ${flagAddButPresent.length} connection rows`);
  console.log(`§2B corrections (flag 'in catalog' but PENDING): ${flagInCatButPending.length} rows -> ${[...new Set(flagInCatButPending)].join(", ")}`);
  console.log(`\nPENDING distinct titles by media:`);
  for (const [m, set] of Object.entries(pendingByMedia).sort((a,b)=>b[1].size-a[1].size)) {
    console.log(`  ${m}: ${set.size}`);
  }
  // dump pending titles for review
  const pendingTitles: Record<string,string[]> = {};
  for (const [m,set] of Object.entries(pendingByMedia)) pendingTitles[m]=[...set].sort();
  fs.writeFileSync("corpus-pending-dryrun.json", JSON.stringify({ unresolvedAnchors, pendingTitles }, null, 1));
  console.log("\nwrote corpus-pending-dryrun.json");
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
