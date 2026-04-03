import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== Duplicate Fix Script ===\n');

  // ─────────────────────────────────────────────
  // 1. MERGE: Le petit prince (16719) → The Little Prince (22516)
  //    ALREADY COMPLETED in previous run — skipping
  //    Migrate 1 review, 1 rating, 1 library entry
  // ─────────────────────────────────────────────
  console.log('1. Le petit prince → The Little Prince: ALREADY DONE ✅ (skipping)\n');

  if (false) { // completed in previous run
  const reviewsMigrated = await prisma.review.updateMany({
    where: { itemId: 16719 },
    data: { itemId: 22516 },
  });
  console.log(`   Reviews migrated: ${reviewsMigrated.count}`);

  const ratingsMigrated = await prisma.rating.updateMany({
    where: { itemId: 16719 },
    data: { itemId: 22516 },
  });
  console.log(`   Ratings migrated: ${ratingsMigrated.count}`);

  const libraryMigrated = await prisma.libraryEntry.updateMany({
    where: { itemId: 16719 },
    data: { itemId: 22516 },
  });
  console.log(`   Library entries migrated: ${libraryMigrated.count}`);

  const franchiseLinksMigrated16719 = await prisma.franchiseItem.updateMany({
    where: { itemId: 16719 },
    data: { itemId: 22516 },
  });
  console.log(`   Franchise links migrated: ${franchiseLinksMigrated16719.count}`);

  await prisma.item.delete({ where: { id: 16719 } });
  console.log('   ✅ Deleted "Le petit prince" (16719)\n');
  } // end skip block

  // ─────────────────────────────────────────────
  // 2. MERGE: Naruto Shippuden (1686) → Naruto Shippūden (388)
  //    No user data — cascade delete
  // ─────────────────────────────────────────────
  console.log('2. Deleting "Naruto Shippuden" (1686) — duplicate of Naruto Shippūden (388)...');
  await prisma.item.delete({ where: { id: 1686 } });
  console.log('   ✅ Deleted (1686)\n');

  // ─────────────────────────────────────────────
  // 3. MERGE: Case Closed (990) → Detective Conan (430)
  //    No user data — cascade delete
  // ─────────────────────────────────────────────
  console.log('3. Deleting "Case Closed" (990) — duplicate of Detective Conan (430)...');
  await prisma.item.delete({ where: { id: 990 } });
  console.log('   ✅ Deleted (990)\n');

  // ─────────────────────────────────────────────
  // 4. MERGE: Steel Ball Run: JoJo's Bizarre Adventure (908) → JoJo's Bizarre Adventure (375)
  //    Migrate franchise links (can't cascade-migrate, must do manually), then delete
  // ─────────────────────────────────────────────
  console.log('4. Merging "Steel Ball Run: JoJo\'s Bizarre Adventure" (908) → JoJo\'s Bizarre Adventure (375)...');

  // Get franchise links for 908 and check for conflicts with 375
  const existingJojoFranchiseIds = (await prisma.franchiseItem.findMany({ where: { itemId: 375 } })).map(f => f.franchiseId);
  const steelBallFranchiseLinks = await prisma.franchiseItem.findMany({ where: { itemId: 908 } });

  for (const link of steelBallFranchiseLinks) {
    if (existingJojoFranchiseIds.includes(link.franchiseId)) {
      console.log(`   Skipping duplicate franchise link (375 already in franchise ${link.franchiseId})`);
      // will be cascade-deleted when item 908 is deleted
    } else {
      await prisma.franchiseItem.update({ where: { id: link.id }, data: { itemId: 375 } });
      console.log(`   Franchise link ${link.franchiseId} migrated to item 375`);
    }
  }

  // Cascade delete handles all other relations (ExternalScore, Rating, Review, etc.)
  await prisma.item.delete({ where: { id: 908 } });
  console.log('   ✅ Deleted "Steel Ball Run" (908)\n');

  // ─────────────────────────────────────────────
  // 5. FIX TMDB ID COLLISIONS — clear tmdb_id from secondary items
  // ─────────────────────────────────────────────
  console.log('5. Clearing tmdb_id on Bleach TYBW (1696)...');
  await prisma.item.update({ where: { id: 1696 }, data: { tmdbId: null } });
  console.log('   ✅ Done\n');

  console.log('6. Clearing tmdb_id on DBZ Kai: The Final Chapters (1677)...');
  await prisma.item.update({ where: { id: 1677 }, data: { tmdbId: null } });
  console.log('   ✅ Done\n');

  console.log('7. Clearing tmdb_id on Ghost in the Shell SAC 2nd GIG (1735)...');
  await prisma.item.update({ where: { id: 1735 }, data: { tmdbId: null } });
  console.log('   ✅ Done\n');

  // ─────────────────────────────────────────────
  // 6. FIX MAL ID MIS-ASSIGNMENTS — clear wrong mal_ids
  // ─────────────────────────────────────────────
  console.log('8. Clearing wrong mal_id on Star Wars Rebels (1331) and Star Wars Resistance (1333)...');
  await prisma.item.updateMany({
    where: { id: { in: [1331, 1333] } },
    data: { malId: null },
  });
  console.log('   ✅ Done\n');

  console.log('9. Clearing wrong mal_id on Star Wars: The Clone Wars (1330) and The Bad Batch (1334)...');
  await prisma.item.updateMany({
    where: { id: { in: [1330, 1334] } },
    data: { malId: null },
  });
  console.log('   ✅ Done\n');

  console.log('10. Clearing wrong mal_id on LOTR: War of the Rohirrim (1355) and The Lord of the Rings (1356)...');
  await prisma.item.updateMany({
    where: { id: { in: [1355, 1356] } },
    data: { malId: null },
  });
  console.log('   ✅ Done\n');

  // ─────────────────────────────────────────────
  // FINAL VERIFICATION
  // ─────────────────────────────────────────────
  console.log('=== Verification ===\n');

  const littlePrince = await prisma.item.findUnique({
    where: { id: 22516 },
    include: {
      reviews: true,
      ratings: true,
      libraryEntries: true,
    },
  });
  console.log(`"The Little Prince" (22516): ${littlePrince?.reviews.length} reviews, ${littlePrince?.ratings.length} ratings, ${littlePrince?.libraryEntries.length} library entries`);

  // Confirm deleted items are gone
  const deleted = await prisma.item.findMany({
    where: { id: { in: [16719, 1686, 990, 908] } },
  });
  console.log(`Deleted items remaining in DB: ${deleted.length} (should be 0)`);
  if (deleted.length > 0) {
    deleted.forEach(d => console.log(`  ⚠️  Still exists: ${d.id} — ${d.title}`));
  }

  // Confirm TMDB collisions resolved
  const tmdbCheck = await prisma.$queryRaw<any[]>`
    SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b
    FROM items a JOIN items b ON a.id < b.id AND a.type = b.type
    WHERE a."tmdbId" IS NOT NULL AND a."tmdbId" = b."tmdbId"
  `;
  console.log(`\nRemaining TMDB ID collisions: ${tmdbCheck.length} (should be 0)`);
  if (tmdbCheck.length > 0) {
    tmdbCheck.forEach((r: any) => console.log(`  ⚠️  ${r.title_a} (${r.id_a}) ↔ ${r.title_b} (${r.id_b})`));
  }

  const malCheck = await prisma.$queryRaw<any[]>`
    SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b
    FROM items a JOIN items b ON a.id < b.id AND a.type = b.type
    WHERE a."malId" IS NOT NULL AND a."malId" = b."malId"
  `;
  console.log(`Remaining MAL ID collisions: ${malCheck.length} (should be 0)`);
  if (malCheck.length > 0) {
    malCheck.forEach((r: any) => console.log(`  ⚠️  ${r.title_a} (${r.id_a}) ↔ ${r.title_b} (${r.id_b})`));
  }

  console.log('\n=== All done ===');
}

main()
  .catch(console.error)
  .finally(() => pool.end());
