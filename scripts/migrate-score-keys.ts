/**
 * Migrate score key names in the database to match corrected labels.
 *
 * Changes:
 *   movies/TV:  ext.imdb  → ext.tmdb         (was TMDB vote_average, not real IMDb)
 *   games:      ext.ign   → ext.igdb × 10    (was total_rating/10; store as 0-100)
 *   books:      ext.goodreads → ext.google_books  (was Google Books, not Goodreads)
 *
 * Also migrates ExternalScore table rows with the old source names.
 *
 * Safe to run multiple times — uses idempotent checks.
 *
 * Run: npx tsx scripts/migrate-score-keys.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  console.log("🔄 Migrating score key names in database...\n");

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // ── Step 1: Rename 'imdb' → 'tmdb' for movies and TV ─────────────────
  console.log("═══ Step 1: imdb → tmdb (movies + TV) ═══");
  const movieTvWithImdb = await (prisma.$queryRaw as any)`
    SELECT id, type, ext
    FROM items
    WHERE type IN ('movie', 'tv')
      AND ext ? 'imdb'
      AND NOT ext ? 'tmdb'
  `;
  console.log(`  Found ${(movieTvWithImdb as any[]).length} movie/TV items with 'imdb' key`);

  for (const item of movieTvWithImdb as any[]) {
    const ext = item.ext as Record<string, number>;
    const tmdbVal = ext.imdb;
    const newExt = { ...ext, tmdb: tmdbVal };
    delete newExt.imdb;
    await prisma.item.update({ where: { id: item.id }, data: { ext: newExt as any } });
  }
  console.log(`  ✓ Renamed ${(movieTvWithImdb as any[]).length} items\n`);

  // ── Step 2: Rename 'ign' → 'igdb' (× 10) for games ──────────────────
  console.log("═══ Step 2: ign → igdb (games, scale × 10 to 0-100) ═══");
  const gamesWithIgn = await (prisma.$queryRaw as any)`
    SELECT id, ext
    FROM items
    WHERE type = 'game'
      AND ext ? 'ign'
      AND NOT ext ? 'igdb'
  `;
  console.log(`  Found ${(gamesWithIgn as any[]).length} game items with 'ign' key`);

  for (const item of gamesWithIgn as any[]) {
    const ext = item.ext as Record<string, number>;
    // 'ign' was stored as total_rating / 10 (0-10 scale), convert back to 0-100
    const igdbVal = Math.round((ext.ign || 0) * 10);
    const newExt = { ...ext, igdb: igdbVal };
    delete newExt.ign;
    await prisma.item.update({ where: { id: item.id }, data: { ext: newExt as any } });
  }
  console.log(`  ✓ Renamed ${(gamesWithIgn as any[]).length} items\n`);

  // Also rename 'metacritic' → 'igdb_critics' for IGDB-sourced game scores
  // (ExternalScore table has metacritic rows from IGDB's aggregated_rating)
  console.log("═══ Step 2b: metacritic → igdb_critics in ExternalScore (games) ═══");
  const gameIds = await prisma.item.findMany({ where: { type: "game" }, select: { id: true } });
  const gameIdSet = new Set(gameIds.map((g) => g.id));

  const igdbMetaRows = await prisma.externalScore.findMany({
    where: { source: "metacritic", itemId: { in: [...gameIdSet] } },
    select: { id: true, itemId: true, score: true },
  });
  console.log(`  Found ${igdbMetaRows.length} ExternalScore 'metacritic' rows for games`);

  for (const row of igdbMetaRows) {
    // Check if igdb_critics already exists for this item
    const existing = await prisma.externalScore.findFirst({
      where: { itemId: row.itemId, source: "igdb_critics" },
    });
    if (!existing) {
      await prisma.externalScore.update({
        where: { id: row.id },
        data: { source: "igdb_critics", scoreType: "critics" },
      });
    }
  }
  console.log(`  ✓ Renamed ${igdbMetaRows.length} ExternalScore rows\n`);

  // ── Step 3: Rename 'goodreads' → 'google_books' for books ────────────
  console.log("═══ Step 3: goodreads → google_books (books) ═══");
  const booksWithGoodreads = await (prisma.$queryRaw as any)`
    SELECT id, ext
    FROM items
    WHERE type = 'book'
      AND ext ? 'goodreads'
      AND NOT ext ? 'google_books'
  `;
  console.log(`  Found ${(booksWithGoodreads as any[]).length} book items with 'goodreads' key`);

  for (const item of booksWithGoodreads as any[]) {
    const ext = item.ext as Record<string, number>;
    const gbVal = ext.goodreads;
    const newExt = { ...ext, google_books: gbVal };
    delete newExt.goodreads;
    await prisma.item.update({ where: { id: item.id }, data: { ext: newExt as any } });
  }
  console.log(`  ✓ Renamed ${(booksWithGoodreads as any[]).length} items\n`);

  // Also rename ExternalScore rows for books
  const bookIds = await prisma.item.findMany({ where: { type: "book" }, select: { id: true } });
  const bookIdSet = new Set(bookIds.map((b) => b.id));
  const bookGoodreadsRows = await prisma.externalScore.findMany({
    where: { source: "goodreads", itemId: { in: [...bookIdSet] } },
  });
  console.log(`  Found ${bookGoodreadsRows.length} ExternalScore 'goodreads' rows for books`);
  for (const row of bookGoodreadsRows) {
    const existing = await prisma.externalScore.findFirst({
      where: { itemId: row.itemId, source: "google_books" },
    });
    if (!existing) {
      await prisma.externalScore.update({
        where: { id: row.id },
        data: { source: "google_books", maxScore: 5 },
      });
    }
  }
  console.log(`  ✓ Renamed ${bookGoodreadsRows.length} ExternalScore rows\n`);

  // ── Step 4: Rename ExternalScore imdb → tmdb for movies/TV ───────────
  console.log("═══ Step 4: ExternalScore imdb → tmdb (movies + TV) ═══");
  const movieTvIds = (movieTvWithImdb as any[]).map((i: any) => i.id);
  if (movieTvIds.length > 0) {
    const imdbRows = await prisma.externalScore.findMany({
      where: { source: "imdb", itemId: { in: movieTvIds } },
    });
    console.log(`  Found ${imdbRows.length} ExternalScore 'imdb' rows for movies/TV`);
    for (const row of imdbRows) {
      const existing = await prisma.externalScore.findFirst({
        where: { itemId: row.itemId, source: "tmdb" },
      });
      if (!existing) {
        await prisma.externalScore.update({
          where: { id: row.id },
          data: { source: "tmdb", label: "TMDB" },
        });
      }
    }
    console.log(`  ✓ Renamed ${imdbRows.length} ExternalScore rows\n`);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const [tmdbCount, igdbCount, gbCount] = await Promise.all([
    (prisma.$queryRaw as any)`SELECT count(*) FROM items WHERE ext ? 'tmdb'`,
    (prisma.$queryRaw as any)`SELECT count(*) FROM items WHERE type = 'game' AND ext ? 'igdb'`,
    (prisma.$queryRaw as any)`SELECT count(*) FROM items WHERE type = 'book' AND ext ? 'google_books'`,
  ]);

  console.log("════════════════════════════════════════");
  console.log("✅ Migration complete!");
  console.log(`  Items with 'tmdb' score:       ${(tmdbCount as any)[0]?.count}`);
  console.log(`  Games with 'igdb' score:        ${(igdbCount as any)[0]?.count}`);
  console.log(`  Books with 'google_books' score: ${(gbCount as any)[0]?.count}`);
  console.log("\n  Verify no remaining old keys:");
  const remaining = await (prisma.$queryRaw as any)`
    SELECT
      (SELECT count(*) FROM items WHERE type IN ('movie','tv') AND ext ? 'imdb' AND NOT ext ? 'tmdb') as movie_imdb_only,
      (SELECT count(*) FROM items WHERE type = 'game' AND ext ? 'ign' AND NOT ext ? 'igdb') as game_ign_only,
      (SELECT count(*) FROM items WHERE type = 'book' AND ext ? 'goodreads' AND NOT ext ? 'google_books') as book_gr_only
  `;
  console.log("  Remaining unmigrated:", (remaining as any)[0]);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
