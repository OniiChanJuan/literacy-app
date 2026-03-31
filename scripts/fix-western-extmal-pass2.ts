/**
 * Pass 2: clean up remaining Western animation false positives.
 * Removes ext.mal from the 8 "unknown" items (all confirmed Western animation)
 * and verifies Rick and Morty is fully clean.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! }) });

const REMAINING_WESTERN: Record<number, string> = {
  324:  "Invincible — Amazon/Skybound, American",
  1330: "Star Wars: The Clone Wars — Lucasfilm/Disney",
  363:  "Batman: The Animated Series — WB Animation",
  421:  "Teen Titans Go! — Cartoon Network",
  322:  "Regular Show — Cartoon Network",
  317:  "Primal — Cartoon Network (Genndy Tartakovsky)",
  1389: "LEGO Jurassic World — Universal/LEGO",
  1418: "Annabelle's Wish — Classic American animation",
  305:  "Rick and Morty — Adult Swim (also verify Anime genre removed)",
  81:   "The Lion King — verify clean",
};

async function main() {
  console.log("=== Pass 2: clean remaining Western animation false positives ===\n");
  let extMalRemoved = 0; let alreadyClean = 0;

  for (const [idStr, reason] of Object.entries(REMAINING_WESTERN)) {
    const id = Number(idStr);
    const item = await prisma.item.findUnique({
      where: { id },
      select: { id: true, title: true, ext: true, genre: true },
    });
    if (!item) { console.log(`  [${id}] NOT FOUND`); continue; }
    const ext = item.ext as Record<string, any> | null;

    const hasAnimeGenre = item.genre.includes("Anime");
    const hasMalScore = ext?.mal != null;

    if (!hasMalScore && !hasAnimeGenre) {
      console.log(`  ✓ clean  [${id}] ${item.title}`);
      alreadyClean++;
      continue;
    }

    let updated = false;
    const updates: any = {};

    if (hasMalScore) {
      const { mal, ...restExt } = ext!;
      updates.ext = restExt;
      console.log(`  Removed ext.mal=${mal} from [${id}] ${item.title} (${reason})`);
      extMalRemoved++;
      updated = true;
    }
    if (hasAnimeGenre) {
      updates.genre = item.genre.filter((g) => g !== "Anime");
      console.log(`  Removed 'Anime' genre from [${id}] ${item.title}`);
      updated = true;
    }
    if (updated) {
      await prisma.item.update({ where: { id }, data: updates });
    }
  }

  console.log(`\n  ext.mal removed: ${extMalRemoved}, already clean: ${alreadyClean}`);

  // Verify: show all remaining items with ext.mal but no Anime genre
  const remaining = await prisma.$queryRaw<any[]>`
    SELECT id, title, type, genre, mal_id, (ext->>'mal') as mal_score
    FROM items
    WHERE type IN ('tv','movie')
    AND (ext->>'mal') IS NOT NULL
    AND NOT ('Anime' = ANY(genre))
    AND parent_item_id IS NULL
    ORDER BY vote_count DESC NULLS LAST
  `;
  if (remaining.length === 0) {
    console.log("\n✓ No more items with ext.mal but no Anime genre");
  } else {
    console.log(`\n⚠ Still ${remaining.length} items with ext.mal but no Anime genre:`);
    remaining.forEach((i: any) => console.log(`  [${i.id}] ${i.title} (${i.type}) | malId=${i.mal_id} | ext.mal=${i.mal_score} | genres: ${JSON.stringify(i.genre)}`));
  }

  const finalAnime = await prisma.item.count({ where: { type: { in: ["tv","movie"] }, genre: { has: "Anime" }, parentItemId: null } });
  const finalExtMal = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count FROM items WHERE type IN ('tv','movie') AND (ext->>'mal') IS NOT NULL AND parent_item_id IS NULL
  `;
  console.log(`\n  Final: ${finalAnime} items with Anime genre, ${finalExtMal[0].count} with ext.mal`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
