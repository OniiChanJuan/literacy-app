/**
 * Step 3 — bulk import the connection corpus into the new schema.
 *
 * Source: corpus-parsed.json (994 connections, 225 canonical clusters, full_mapping).
 * Applies the reconciliation corrections at import (resolver result wins over the
 * sheet's "In catalog?" flag): present titles → live recs; absent → pending queue.
 * Dedupes clusters via the consolidated library (1 canonical row reused by N anchors;
 * connections stay per-anchor). Drops the vague/non-ingestable refs.
 *
 * Legacy seed handling (owner-approved: replace-with-corpus + medium fallback):
 *   - legacy editorial cards on a corpus-covered anchor → DELETE (corpus replaces),
 *     backed up to legacy-cards-backup.json first.
 *   - legacy cards NOT covered by the corpus → backfill their JSON recs into
 *     connection_recs as curated_strength=medium (preserve, re-gradeable later).
 *
 * Idempotent: wipes prior import-created rows (createdBy='import'/'legacy') then rebuilds.
 *
 * Run: npx tsx scripts/import-corpus.ts [--dry]
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import { buildResolver, norm, type CatItem } from "./_corpus-resolver";

const DRY = process.argv.includes("--dry");
const VAGUE = new Set(["studio ghibli films", "the before trilogy", "joe abercrombie s other books", "joe abercrombies other books", "philip k dick stories"].map(norm));
type Strength = "tight" | "medium" | "attenuated";
const asStrength = (s: string | null): Strength => (s === "tight" || s === "attenuated" ? s : "medium");

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL! });
  const prisma = new PrismaClient({ adapter });
  const items: CatItem[] = await prisma.item.findMany({ select: { id: true, title: true, type: true, year: true } });
  // Seed→id aliases from Step 2 (ingest) bridge corpus series names to catalog volumes.
  const aliases: Record<string, number> = fs.existsSync("ingested-seed-aliases.json")
    ? JSON.parse(fs.readFileSync("ingested-seed-aliases.json", "utf-8")) : {};
  const { resolve } = buildResolver(items, aliases);
  const corpus = JSON.parse(fs.readFileSync("corpus-parsed.json", "utf-8"));
  const conns = corpus.connections as any[];
  const canonical = corpus.canonical_clusters as { name: string; blurb: string; spans: string[]; slug: string }[];
  const fullMap = corpus.full_mapping as Record<string, { canonical: string; canonical_slug: string; merged: string }>;

  // ── derive cluster provenance from full_mapping ──
  const anchorsByCanon = new Map<string, Set<string>>();
  const mergedFromByCanon = new Map<string, Set<string>>();
  for (const [k, v] of Object.entries(fullMap)) {
    const [, anchorN, origN] = k.split("||");
    (anchorsByCanon.get(v.canonical_slug) ?? anchorsByCanon.set(v.canonical_slug, new Set()).get(v.canonical_slug)!).add(anchorN);
    if (v.merged === "MERGED") (mergedFromByCanon.get(v.canonical_slug) ?? mergedFromByCanon.set(v.canonical_slug, new Set()).get(v.canonical_slug)!).add(origN);
  }

  const stat = { clusters: 0, cards: 0, recsLive: 0, recsPending: 0, pendingTitles: 0, dropped: 0, anchorsSkipped: new Set<string>(), legacyReplaced: 0, legacyPreservedRecs: 0 };
  const unresolvedAnchors = new Set<string>();

  if (DRY) {
    // simulate
    for (const c of conns) {
      const ar = resolve(c.anchor_title, c.anchor_cat_type);
      if (!ar) { unresolvedAnchors.add(`${c.anchor_title} (${c.anchor_cat_type})`); continue; }
      if (VAGUE.has(norm(c.rec_title))) { stat.dropped++; continue; }
      if (resolve(c.rec_title, c.rec_media || "")) stat.recsLive++; else stat.recsPending++;
    }
    console.log("DRY:", { recsLive: stat.recsLive, recsPending: stat.recsPending, dropped: stat.dropped, unresolvedAnchors: [...unresolvedAnchors] });
    await prisma.$disconnect();
    return;
  }

  // ── 0. wipe prior import-created rows (idempotent rebuild) ──
  await prisma.connectionRec.deleteMany({ where: { createdBy: { in: ["import", "legacy"] } } });
  await prisma.crossConnection.deleteMany({ where: { createdBy: "import" } });
  await prisma.connectionCluster.deleteMany({ where: { createdBy: "import" } });
  await prisma.connectionPendingTitle.deleteMany({ where: { reason: "not_in_catalog" } });

  // ── 1. canonical clusters (225) ──
  const clusterIdBySlug = new Map<string, number>();
  for (const cl of canonical) {
    const anchorCount = anchorsByCanon.get(cl.slug)?.size ?? 1;
    const row = await prisma.connectionCluster.upsert({
      where: { slug: cl.slug },
      update: { label: cl.name, blurb: cl.blurb, spans: cl.spans, isCanonical: anchorCount >= 2, mergedFrom: [...(mergedFromByCanon.get(cl.slug) ?? [])], createdBy: "import" },
      create: { slug: cl.slug, label: cl.name, blurb: cl.blurb, spans: cl.spans, isCanonical: anchorCount >= 2, mergedFrom: [...(mergedFromByCanon.get(cl.slug) ?? [])], createdBy: "import" },
    });
    clusterIdBySlug.set(cl.slug, row.id);
    stat.clusters++;
  }

  // ── 2. group connections into cards (anchor × canonical cluster) ──
  type Card = { anchorTitle: string; anchorType: string; slug: string; blurb: string; recs: any[] };
  const cards = new Map<string, Card>();
  for (const c of conns) {
    const fmKey = `${c.file_type}||${norm(c.anchor_title)}||${norm(c.cluster_label)}`;
    const slug = fullMap[fmKey]?.canonical_slug ?? norm(c.cluster_label);
    const cardKey = `${norm(c.anchor_title)}|${c.anchor_cat_type}|${slug}`;
    let card = cards.get(cardKey);
    if (!card) { card = { anchorTitle: c.anchor_title, anchorType: c.anchor_cat_type, slug, blurb: c.blurb || "", recs: [] }; cards.set(cardKey, card); }
    if (!card.blurb && c.blurb) card.blurb = c.blurb;
    card.recs.push(c);
  }

  // ── 3. create cards + recs ──
  const pendingIdByKey = new Map<string, number>();
  const coveredAnchorIds = new Set<number>();
  let cardPos = 0;
  for (const card of cards.values()) {
    const ar = resolve(card.anchorTitle, card.anchorType);
    if (!ar) { unresolvedAnchors.add(`${card.anchorTitle} (${card.anchorType})`); stat.anchorsSkipped.add(`${card.anchorTitle}`); continue; }
    const clusterId = clusterIdBySlug.get(card.slug);
    if (!clusterId) continue;
    coveredAnchorIds.add(ar.itemId);

    const cardRow = await prisma.crossConnection.upsert({
      where: { sourceItemId_clusterId: { sourceItemId: ar.itemId, clusterId } },
      update: { reason: card.blurb, createdBy: "import", position: cardPos },
      create: { sourceItemId: ar.itemId, clusterId, reason: card.blurb, recommendedItems: [], createdBy: "import", position: cardPos },
    });
    cardPos++;
    stat.cards++;

    let recPos = 0;
    for (const c of card.recs) {
      if (VAGUE.has(norm(c.rec_title))) { stat.dropped++; continue; }
      const rr = resolve(c.rec_title, c.rec_media || "");
      const strength = asStrength(c.strength);
      const threads = (c.shared_threads || []).filter((t: string) => t && t.length > 0).slice(0, 8);
      if (rr) {
        await prisma.connectionRec.upsert({
          where: { connectionId_recItemId: { connectionId: cardRow.id, recItemId: rr.itemId } },
          update: { curatedStrength: strength, sharedThreads: threads, recMediaAuthored: c.rec_media, whatItIs: c.what_it_is, position: recPos, createdBy: "import" },
          create: { connectionId: cardRow.id, recItemId: rr.itemId, curatedStrength: strength, sharedThreads: threads, recMediaAuthored: c.rec_media, whatItIs: c.what_it_is, position: recPos, createdBy: "import" },
        });
        stat.recsLive++;
      } else {
        const pkey = `${norm(c.rec_title)}|${c.rec_media}`;
        let pendingId = pendingIdByKey.get(pkey);
        if (!pendingId) {
          const p = await prisma.connectionPendingTitle.upsert({
            where: { normalizedKey_mediaAuthored: { normalizedKey: norm(c.rec_title), mediaAuthored: c.rec_media } },
            update: { titleAuthored: c.rec_title, whatItIs: c.what_it_is, reason: "not_in_catalog" },
            create: { titleAuthored: c.rec_title, mediaAuthored: c.rec_media, whatItIs: c.what_it_is, normalizedKey: norm(c.rec_title), reason: "not_in_catalog" },
          });
          pendingId = p.id; pendingIdByKey.set(pkey, pendingId); stat.pendingTitles++;
        }
        await prisma.connectionRec.create({
          data: { connectionId: cardRow.id, pendingTitleId: pendingId, curatedStrength: strength, sharedThreads: threads, recMediaAuthored: c.rec_media, whatItIs: c.what_it_is, position: recPos, createdBy: "import" },
        });
        stat.recsPending++;
      }
      recPos++;
    }
  }

  // ── 4. legacy handling (replace-with-corpus + medium fallback) ──
  const legacy = await prisma.crossConnection.findMany({
    where: { createdBy: "editorial", clusterId: null },
    select: { id: true, sourceItemId: true, reason: true, recommendedItems: true },
  });
  const toReplace = legacy.filter((l) => coveredAnchorIds.has(l.sourceItemId));
  const toPreserve = legacy.filter((l) => !coveredAnchorIds.has(l.sourceItemId));
  fs.writeFileSync("legacy-cards-backup.json", JSON.stringify(toReplace, null, 1));
  if (toReplace.length) {
    await prisma.crossConnection.deleteMany({ where: { id: { in: toReplace.map((l) => l.id) } } });
    stat.legacyReplaced = toReplace.length;
  }
  // backfill preserved legacy cards' JSON recs as medium
  const itemIds = new Set(items.map((i) => i.id));
  for (const l of toPreserve) {
    const recs = Array.isArray(l.recommendedItems) ? (l.recommendedItems as any[]) : [];
    let pos = 0;
    for (const r of recs) {
      const recItemId = Number(r.item_id);
      if (!itemIds.has(recItemId)) continue;
      await prisma.connectionRec.upsert({
        where: { connectionId_recItemId: { connectionId: l.id, recItemId } },
        update: { curatedStrength: "medium", createdBy: "legacy", position: pos },
        create: { connectionId: l.id, recItemId, curatedStrength: "medium", createdBy: "legacy", position: pos },
      });
      stat.legacyPreservedRecs++; pos++;
    }
  }

  console.log("\n=== IMPORT COMPLETE ===");
  console.log(`  clusters:        ${stat.clusters}`);
  console.log(`  cards:           ${stat.cards}`);
  console.log(`  recs live:       ${stat.recsLive}`);
  console.log(`  recs pending:    ${stat.recsPending}  (distinct pending titles: ${stat.pendingTitles})`);
  console.log(`  vague dropped:   ${stat.dropped}`);
  console.log(`  anchors skipped: ${stat.anchorsSkipped.size} -> ${[...unresolvedAnchors].join(", ")}`);
  console.log(`  legacy replaced: ${stat.legacyReplaced} (backup: legacy-cards-backup.json)`);
  console.log(`  legacy preserved recs (medium): ${stat.legacyPreservedRecs} on ${toPreserve.length} cards`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
