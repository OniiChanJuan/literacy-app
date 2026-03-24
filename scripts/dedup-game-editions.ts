/**
 * Find and fix game editions that should be child items of their base games.
 * Run with: npx tsx scripts/dedup-game-editions.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

interface EditionMatch {
  edId: number;
  edTitle: string;
  baseTitle: string;
}

/**
 * Try to extract a base title from an edition title.
 * Returns null if the title doesn't look like an edition.
 */
function extractBaseTitle(title: string): string | null {
  // Order matters — try most specific first

  // "Game - Deluxe Edition", "Game - GOTY Edition"
  const dashEdition = title.match(
    /^(.+?)\s+-\s+(?:Game\s+of\s+the\s+Year|GOTY|Definitive|Complete|Ultimate|Legendary|Premium|Gold|Deluxe|Enhanced|Special|Collector'?s|Anniversary|Standard)\s*(?:Edition)?$/i
  );
  if (dashEdition) return dashEdition[1].trim();

  // "Game - Remastered", "Game - Remake"
  const dashRemaster = title.match(
    /^(.+?)\s+-\s+(?:Remastered|HD\s+Remaster|Remake|Director'?s\s+Cut|Final\s+Cut)$/i
  );
  if (dashRemaster) return dashRemaster[1].trim();

  // "Game: Complete Edition", "Game: Definitive Edition"
  // But NOT "Disco Elysium: The Final Cut" (colon is part of the real title)
  const colonEdition = title.match(
    /^(.+?):\s+(?:Game\s+of\s+the\s+Year|GOTY|Definitive|Complete|Ultimate|Legendary|Premium|Gold|Deluxe|Enhanced|Special|Collector'?s|Anniversary)\s*(?:Edition)?$/i
  );
  if (colonEdition) return colonEdition[1].trim();

  // "Game: Director's Cut", "Game: Final Cut"
  const colonCut = title.match(
    /^(.+?):\s+(?:Director'?s\s+Cut|Final\s+Cut)$/i
  );
  if (colonCut) return colonCut[1].trim();

  // "Game Remastered" (no separator)
  const suffixRemaster = title.match(/^(.+?)\s+Remastered$/);
  if (suffixRemaster) return suffixRemaster[1].trim();

  // "Game Remake"
  const suffixRemake = title.match(/^(.+?)\s+Remake$/);
  if (suffixRemake) return suffixRemake[1].trim();

  // "Game Anniversary" (standalone, not "Anniversary Edition")
  const suffixAnniv = title.match(/^(.+?)\s+Anniversary$/i);
  if (suffixAnniv) return suffixAnniv[1].trim();

  // "(Edition)" in parens at end
  const parenEdition = title.match(
    /^(.+?)\s*\((?:Game\s+of\s+the\s+Year|GOTY|Definitive|Complete|Ultimate|Legendary|Deluxe|Enhanced|Special|Collector'?s|Remastered|Remake)\s*(?:Edition)?\)$/i
  );
  if (parenEdition) return parenEdition[1].trim();

  return null;
}

// Known false positives — these are standalone games, not editions
const FALSE_POSITIVES = new Set([
  "Superfighters Deluxe", // Different game from Superfighters
  "Heroes of Might and Magic III: Complete", // No base in DB
]);

async function main() {
  console.log("🎮 Game Edition Deduplication\n");

  const games = await prisma.item.findMany({
    where: { type: "game", parentItemId: null },
    select: { id: true, title: true, year: true, voteCount: true, popularityScore: true },
    orderBy: { title: "asc" },
  });

  console.log(`Total top-level games: ${games.length}`);

  const titleMap = new Map<string, typeof games[0]>();
  for (const g of games) {
    titleMap.set(g.title.toLowerCase(), g);
  }

  const matched: { edId: number; edTitle: string; baseId: number; baseTitle: string }[] = [];
  const noBase: { edId: number; edTitle: string; wanted: string }[] = [];

  for (const g of games) {
    if (FALSE_POSITIVES.has(g.title)) continue;

    const baseTitle = extractBaseTitle(g.title);
    if (!baseTitle) continue;

    // Exact match
    const base = titleMap.get(baseTitle.toLowerCase());
    if (base && base.id !== g.id) {
      matched.push({ edId: g.id, edTitle: g.title, baseId: base.id, baseTitle: base.title });
      continue;
    }

    // Try DB search for close matches
    const candidates = await prisma.item.findMany({
      where: {
        type: "game",
        parentItemId: null,
        id: { not: g.id },
        title: { contains: baseTitle.split(":")[0].trim(), mode: "insensitive" },
      },
      select: { id: true, title: true },
      take: 10,
    });

    const dbMatch = candidates.find(
      (c) => c.title.toLowerCase() === baseTitle.toLowerCase()
    );
    if (dbMatch) {
      matched.push({ edId: g.id, edTitle: g.title, baseId: dbMatch.id, baseTitle: dbMatch.title });
    } else {
      noBase.push({ edId: g.id, edTitle: g.title, wanted: baseTitle });
    }
  }

  // Also handle special cases manually
  // "Disco Elysium: The Final Cut" is the definitive version of "Disco Elysium"
  const discoFC = games.find((g) => g.title === "Disco Elysium: The Final Cut");
  const discoBase = games.find((g) => g.title === "Disco Elysium");
  if (discoFC && discoBase) {
    matched.push({ edId: discoFC.id, edTitle: discoFC.title, baseId: discoBase.id, baseTitle: discoBase.title });
  }

  console.log(`\n=== WILL CONVERT TO EDITIONS (${matched.length}) ===`);
  for (const m of matched) {
    console.log(`  "${m.edTitle}" (${m.edId}) → parent: "${m.baseTitle}" (${m.baseId})`);
  }

  console.log(`\n=== NO BASE GAME FOUND (${noBase.length}) ===`);
  for (const n of noBase) {
    console.log(`  "${n.edTitle}" (${n.edId}) → looked for: "${n.wanted}"`);
  }

  // Apply changes
  if (matched.length > 0) {
    console.log(`\n🔧 Applying ${matched.length} edition conversions...`);
    for (const m of matched) {
      await prisma.item.update({
        where: { id: m.edId },
        data: { parentItemId: m.baseId, itemSubtype: "edition" },
      });
      // Remove from franchise listings
      await prisma.franchiseItem.deleteMany({ where: { itemId: m.edId } });
      console.log(`  ✓ "${m.edTitle}" → edition of "${m.baseTitle}"`);
    }
    console.log(`\n✅ Done! Converted ${matched.length} games to editions.`);
  } else {
    console.log("\n✅ No new editions to convert.");
  }

  // Count remaining
  const remaining = await prisma.item.count({
    where: { type: "game", parentItemId: null },
  });
  const editions = await prisma.item.count({
    where: { type: "game", parentItemId: { not: null } },
  });
  console.log(`\nFinal state: ${remaining} top-level games, ${editions} editions/DLC`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
