import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Manga score coverage ───────────────────────────────────────────────
  const [totalManga]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='manga'`);
  const [mangaWithMal]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='manga' AND mal_id IS NOT NULL`);
  const [mangaWithScore]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='manga' AND (ext->>'mal')::float > 0`);
  const [mangaNoScore]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='manga' AND mal_id IS NOT NULL AND (ext->>'mal' IS NULL OR (ext->>'mal')::float = 0)`);
  const [mangaGemRange]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='manga' AND vote_count >= 10 AND vote_count < 5000 AND (ext->>'mal')::float > 0`);

  console.log('\n=== MANGA SCORE COVERAGE ===');
  console.log(`Total manga in DB:                    ${totalManga.n}`);
  console.log(`With mal_id:                          ${mangaWithMal.n}`);
  console.log(`With ext.mal > 0 (has score):         ${mangaWithScore.n}`);
  console.log(`Has mal_id but NO score:              ${mangaNoScore.n}  ← backfill candidates`);
  console.log(`Has score AND voteCount 10-5000:      ${mangaGemRange.n}  ← eligible for hidden gems NOW`);

  // Sample scored manga in gem range
  const scoredManga: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, vote_count, (ext->>'mal')::float as mal_score
    FROM items WHERE type='manga' AND vote_count >= 10 AND vote_count < 5000
    AND (ext->>'mal')::float > 0
    ORDER BY (ext->>'mal')::float / log(greatest(vote_count::float, 10)) DESC
    LIMIT 10
  `);
  if (scoredManga.length > 0) {
    console.log('\nTop scored manga in gem range (10 ≤ voteCount < 5000):');
    scoredManga.forEach((r: any) => console.log(`  [${r.id}] "${r.title}" vc=${r.vote_count} mal=${r.mal_score}`));
  }

  // ── Book score coverage ────────────────────────────────────────────────
  const [totalBooks]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='book'`);
  const [booksWithScore]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='book' AND (ext->>'google_books')::float > 0`);
  const [booksGemRange]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='book' AND vote_count >= 10 AND vote_count < 5000 AND (ext->>'google_books')::float > 0`);
  const [booksGemRangeHighScore]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as n FROM items WHERE type='book' AND vote_count >= 10 AND vote_count < 5000 AND (ext->>'google_books')::float >= 3.25`);

  console.log('\n=== BOOK SCORE COVERAGE ===');
  console.log(`Total books in DB:                    ${totalBooks.n}`);
  console.log(`With google_books score > 0:          ${booksWithScore.n}`);
  console.log(`Has score AND voteCount 10-5000:      ${booksGemRange.n}`);
  console.log(`Has score >= 3.25/5 (=0.65) + gem vc: ${booksGemRangeHighScore.n}  ← eligible for hidden gems NOW`);

  // Sample scored books
  const scoredBooks: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, vote_count, (ext->>'google_books')::float as gb_score
    FROM items WHERE type='book' AND vote_count >= 10 AND vote_count < 5000
    AND (ext->>'google_books')::float >= 3.25
    ORDER BY (ext->>'google_books')::float / log(greatest(vote_count::float, 10)) DESC
    LIMIT 10
  `);
  if (scoredBooks.length > 0) {
    console.log('\nTop scored books in gem range:');
    scoredBooks.forEach((r: any) => console.log(`  [${r.id}] "${r.title}" vc=${r.vote_count} gb=${r.gb_score}`));
  } else {
    console.log('\nNo books pass all hidden gem filters — checking why:');
    const sample: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, title, vote_count, ext->>'google_books' as gb_score, description
      FROM items WHERE type='book' AND vote_count >= 10 AND vote_count < 5000
      AND (ext->>'google_books')::float > 0
      ORDER BY (ext->>'google_books')::float DESC LIMIT 10
    `);
    sample.forEach((r: any) => console.log(`  "${r.title}" vc=${r.vote_count} gb=${r.gb_score} descLen=${r.description?.length ?? 0}`));
  }

  // ── Manga backfill scope ──────────────────────────────────────────────
  const backfillNeeded: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, mal_id, vote_count FROM items
    WHERE type='manga' AND mal_id IS NOT NULL
    AND (ext->>'mal' IS NULL OR (ext->>'mal')::float = 0)
    ORDER BY vote_count DESC
    LIMIT 20
  `);
  console.log(`\n=== TOP MANGA NEEDING SCORE BACKFILL (sample of ${backfillNeeded.length}) ===`);
  backfillNeeded.forEach((r: any) => console.log(`  [${r.id}] "${r.title}" malId=${r.mal_id} vc=${r.vote_count}`));

  // ── Game check — are "big releases" really hidden? ────────────────────
  const bigGames: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, year, vote_count,
      COALESCE(ext->>'igdb', ext->>'metacritic', '0')::float as score
    FROM items WHERE type='game' AND vote_count >= 10 AND vote_count < 5000
    AND year >= 2024
    ORDER BY vote_count DESC LIMIT 15
  `);
  console.log('\n=== RECENT GAMES (2024+) IN HIDDEN GEMS RANGE ===');
  bigGames.forEach((r: any) => console.log(`  "${r.title}" yr=${r.year} vc=${r.vote_count} score=${r.score}`));

  await prisma.$disconnect();
}

main().catch(console.error);
