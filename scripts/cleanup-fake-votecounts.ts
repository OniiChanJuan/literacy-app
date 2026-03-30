/**
 * One-time cleanup: podcast and comic voteCount was set to episode/issue count
 * during import instead of real Literacy user rating counts.
 * This script resets those to the actual count of ratings in the ratings table.
 *
 * Run: npx tsx scripts/cleanup-fake-votecounts.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("═".repeat(60));
  console.log("CLEANUP: fake voteCount values for podcast/comic/music");
  console.log("═".repeat(60));

  // ── 1. Show before state ───────────────────────────────────────
  const before: any[] = await prisma.$queryRawUnsafe(`
    SELECT type,
           COUNT(*)::int                             as item_count,
           SUM(vote_count)::int                      as total_fake_votes,
           MAX(vote_count)::int                      as max_votes,
           ROUND(AVG(vote_count)::numeric, 1)        as avg_votes
    FROM items
    WHERE type IN ('podcast', 'comic', 'music')
    GROUP BY type ORDER BY type
  `);
  console.log("\nBEFORE cleanup:");
  before.forEach((r: any) =>
    console.log(`  ${r.type.padEnd(8)} items=${r.item_count} totalVotes=${r.total_fake_votes} max=${r.max_votes} avg=${r.avg_votes}`)
  );

  // ── 2. Show worst offenders ────────────────────────────────────
  const worst: any[] = await prisma.$queryRawUnsafe(`
    SELECT type, title, vote_count, total_ep
    FROM items
    WHERE type IN ('podcast', 'comic')
      AND vote_count > 100
    ORDER BY vote_count DESC
    LIMIT 15
  `);
  console.log("\nTop fake-inflated items (vote_count > 100):");
  worst.forEach((r: any) =>
    console.log(`  [${r.type}] "${r.title}" vc=${r.vote_count} totalEp=${r.total_ep}`)
  );

  // ── 3. Fix podcasts: reset to real Literacy ratings count ──────
  await prisma.$queryRawUnsafe(`
    UPDATE items
    SET vote_count       = (SELECT COUNT(*)::int FROM ratings WHERE ratings.item_id = items.id),
        popularity_score = 0
    WHERE type = 'podcast'
  `);
  console.log("\n✓ Podcasts: vote_count reset to real Literacy ratings count, popularity_score = 0");

  // ── 4. Fix comics: same ────────────────────────────────────────
  await prisma.$queryRawUnsafe(`
    UPDATE items
    SET vote_count       = (SELECT COUNT(*)::int FROM ratings WHERE ratings.item_id = items.id),
        popularity_score = 0
    WHERE type = 'comic'
  `);
  console.log("✓ Comics: vote_count reset to real Literacy ratings count, popularity_score = 0");

  // ── 5. Fix music: only fix items where vote_count == total_ep
  //    (telltale sign the track count was stored as vote count).
  //    Items where a real Spotify popularity or score already exists
  //    were likely set correctly by fetch-popularity.ts, so skip those.
  const fakeMusicBefore: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int as n, SUM(vote_count)::int as total
    FROM items
    WHERE type = 'music'
      AND total_ep > 0
      AND vote_count = total_ep
  `);
  console.log(`\nMusic items where vote_count == total_ep (fake): ${fakeMusicBefore[0].n}`);

  await prisma.$queryRawUnsafe(`
    UPDATE items
    SET vote_count       = 0,
        popularity_score = 0
    WHERE type = 'music'
      AND total_ep > 0
      AND vote_count = total_ep
  `);
  console.log("✓ Music: fixed items where vote_count == total_ep (track count was used as fake votes)");

  // ── 6. Show after state ────────────────────────────────────────
  const after: any[] = await prisma.$queryRawUnsafe(`
    SELECT type,
           COUNT(*)::int                           as item_count,
           SUM(vote_count)::int                    as total_votes,
           COUNT(CASE WHEN vote_count > 0 THEN 1 END)::int as items_with_votes
    FROM items
    WHERE type IN ('podcast', 'comic', 'music')
    GROUP BY type ORDER BY type
  `);
  console.log("\nAFTER cleanup:");
  after.forEach((r: any) =>
    console.log(`  ${r.type.padEnd(8)} items=${r.item_count} totalVotes=${r.total_votes} withRealVotes=${r.items_with_votes}`)
  );

  console.log("\n✓ Done. Podcasts and comics now have real voteCount (0 unless someone rated them).");
  console.log("  They will no longer appear in Critically Acclaimed or Popular Right Now.");

  await prisma.$disconnect();
}

main().catch(console.error);
