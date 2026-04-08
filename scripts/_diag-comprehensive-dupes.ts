import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenvLocal from 'dotenv';
import * as path from 'path';
dotenvLocal.config({ path: path.join(process.cwd(), '.env.local') });

function sep(t: string) { console.log('\n' + '='.repeat(60) + '\n' + t + '\n' + '='.repeat(60)); }
function stringify(v: any): string {
  return JSON.stringify(v, (_k, val) => typeof val === 'bigint' ? val.toString() : val, 2);
}

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter } as any);

  // NOTE: Schema reality:
  // - items.id is Int (not UUID)
  // - items.genre (not genres), items.created_at, items.slug
  // - dedicated columns: google_books_id, tmdb_id, igdb_id, mal_id, spotify_id
  // - reviews.item_id (Int), ratings.item_id (Int), library_entries.item_id (Int)

  sep('QUERY 1 — Little Prince items');
  const q1: any[] = await prisma.$queryRawUnsafe(
    "SELECT id, title, type, slug, google_books_id, tmdb_id, mal_id, ext, genre, created_at FROM items WHERE title ILIKE '%little prince%' OR title ILIKE '%petit prince%'"
  );
  console.log(stringify(q1, null, 2));
  const lpIds: number[] = q1.map((r: any) => r.id);
  console.log('IDs found:', lpIds);

  sep('QUERY 2 — Reviews per Little Prince item');
  if (lpIds.length > 0) {
    const idList = lpIds.join(',');
    const q2: any[] = await prisma.$queryRawUnsafe(
      `SELECT item_id, COUNT(*) as review_count FROM reviews WHERE item_id IN (${idList}) GROUP BY item_id`
    );
    console.log(stringify(q2, null, 2));
  } else { console.log('No IDs.'); }

  sep('QUERY 3 — Ratings per Little Prince item');
  if (lpIds.length > 0) {
    const idList = lpIds.join(',');
    const q3: any[] = await prisma.$queryRawUnsafe(
      `SELECT item_id, COUNT(*) as rating_count, AVG(score) as avg_score FROM ratings WHERE item_id IN (${idList}) GROUP BY item_id`
    );
    console.log(stringify(q3, null, 2));
  } else { console.log('No IDs.'); }

  sep('QUERY 4 — Library entries per Little Prince item');
  if (lpIds.length > 0) {
    const idList = lpIds.join(',');
    const q4: any[] = await prisma.$queryRawUnsafe(
      `SELECT item_id, status, COUNT(*) FROM library_entries WHERE item_id IN (${idList}) GROUP BY item_id, status`
    );
    console.log(stringify(q4, null, 2));
  } else { console.log('No IDs.'); }

  sep('QUERY 5 — Same Google Books ID (using dedicated google_books_id column)');
  const q5: any[] = await prisma.$queryRawUnsafe(
    "SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.google_books_id as gbooks_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.google_books_id IS NOT NULL AND a.google_books_id = b.google_books_id LIMIT 20"
  );
  console.log(stringify(q5, null, 2));

  sep('QUERY 6 — Same TMDB ID (using dedicated tmdb_id column)');
  const q6: any[] = await prisma.$queryRawUnsafe(
    "SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.tmdb_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.tmdb_id IS NOT NULL AND a.tmdb_id = b.tmdb_id LIMIT 20"
  );
  console.log(stringify(q6, null, 2));

  sep('QUERY 7 — Same IGDB ID (using dedicated igdb_id column)');
  const q7: any[] = await prisma.$queryRawUnsafe(
    "SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.igdb_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.igdb_id IS NOT NULL AND a.igdb_id = b.igdb_id LIMIT 20"
  );
  console.log(stringify(q7, null, 2));

  sep('QUERY 8 — Same MAL ID (using dedicated mal_id column)');
  const q8: any[] = await prisma.$queryRawUnsafe(
    "SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.mal_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.mal_id IS NOT NULL AND a.mal_id = b.mal_id LIMIT 20"
  );
  console.log(stringify(q8, null, 2));

  sep('QUERY 9 — Same Spotify ID (using dedicated spotify_id column)');
  const q9: any[] = await prisma.$queryRawUnsafe(
    "SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.spotify_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.spotify_id IS NOT NULL AND a.spotify_id = b.spotify_id LIMIT 20"
  );
  console.log(stringify(q9, null, 2));

  sep('QUERY 10 — Same title + type + year');
  const q10: any[] = await prisma.$queryRawUnsafe(
    "SELECT title, type, year, COUNT(*) as dupes FROM items GROUP BY title, type, year HAVING COUNT(*) > 1 ORDER BY dupes DESC LIMIT 30"
  );
  console.log(stringify(q10, null, 2));

  sep('QUERY 11 — Same external ID cross-check (books: google_books_id + openlibrary via ext)');
  const q11: any[] = await prisma.$queryRawUnsafe(
    "SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.type FROM items a JOIN items b ON a.type = b.type AND a.id != b.id AND a.id < b.id WHERE ((a.google_books_id IS NOT NULL AND a.google_books_id = b.google_books_id) OR (a.ext->>'openlibrary_id' IS NOT NULL AND a.ext->>'openlibrary_id' = b.ext->>'openlibrary_id')) LIMIT 20"
  );
  console.log(stringify(q11, null, 2));

  sep('QUERY 12 — Title contains other title');
  const q12: any[] = await prisma.$queryRawUnsafe(
    "SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.type FROM items a JOIN items b ON a.type = b.type AND a.id < b.id WHERE (a.title ILIKE '%' || b.title || '%' OR b.title ILIKE '%' || a.title || '%') AND length(a.title) > 5 AND length(b.title) > 5 AND a.title != b.title LIMIT 30"
  );
  console.log(stringify(q12, null, 2));

  sep('QUERY 13 — Count duplicate pairs by type (dedicated external ID columns)');
  const q13: any[] = await prisma.$queryRawUnsafe(
    "SELECT a.type, SUM(CASE WHEN a.google_books_id IS NOT NULL AND a.google_books_id = b.google_books_id THEN 1 ELSE 0 END) as gbooks_dups, SUM(CASE WHEN a.tmdb_id IS NOT NULL AND a.tmdb_id = b.tmdb_id THEN 1 ELSE 0 END) as tmdb_dups, SUM(CASE WHEN a.igdb_id IS NOT NULL AND a.igdb_id = b.igdb_id THEN 1 ELSE 0 END) as igdb_dups, SUM(CASE WHEN a.mal_id IS NOT NULL AND a.mal_id = b.mal_id THEN 1 ELSE 0 END) as mal_dups, SUM(CASE WHEN a.spotify_id IS NOT NULL AND a.spotify_id = b.spotify_id THEN 1 ELSE 0 END) as spotify_dups FROM items a JOIN items b ON a.id < b.id AND a.type = b.type GROUP BY a.type ORDER BY a.type"
  );
  console.log(stringify(q13, null, 2));

  sep('QUERY 14 — High priority: duplicates with reviews/ratings');
  const q14: any[] = await prisma.$queryRawUnsafe(
    "WITH dup_pairs AS (SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.type FROM items a JOIN items b ON a.type = b.type AND a.id < b.id WHERE (a.google_books_id IS NOT NULL AND a.google_books_id = b.google_books_id) OR (a.tmdb_id IS NOT NULL AND a.tmdb_id = b.tmdb_id) OR (a.igdb_id IS NOT NULL AND a.igdb_id = b.igdb_id) OR (a.mal_id IS NOT NULL AND a.mal_id = b.mal_id)) SELECT dp.*, (SELECT COUNT(*) FROM reviews WHERE item_id = dp.id_a) as reviews_a, (SELECT COUNT(*) FROM reviews WHERE item_id = dp.id_b) as reviews_b, (SELECT COUNT(*) FROM ratings WHERE item_id = dp.id_a) as ratings_a, (SELECT COUNT(*) FROM ratings WHERE item_id = dp.id_b) as ratings_b FROM dup_pairs dp ORDER BY ((SELECT COUNT(*) FROM reviews WHERE item_id = dp.id_a) + (SELECT COUNT(*) FROM reviews WHERE item_id = dp.id_b) + (SELECT COUNT(*) FROM ratings WHERE item_id = dp.id_a) + (SELECT COUNT(*) FROM ratings WHERE item_id = dp.id_b)) DESC LIMIT 20"
  );
  console.log(stringify(q14, null, 2));

  await prisma.$disconnect();
  console.log('\nAll done.');
}
main().catch(e => { console.error(e); process.exit(1); });
