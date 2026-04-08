import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenvLocal from 'dotenv';
import * as path from 'path';
dotenvLocal.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter } as any);

  function sep(title: string) {
    console.log('\n' + '='.repeat(60));
    console.log(title);
    console.log('='.repeat(60));
  }

  // QUERY 1
  sep('QUERY 1 — Little Prince items');
  const q1: any[] = await (prisma as any).$queryRaw`
    SELECT id, title, type, slug, "franchiseId", ext, genres, "createdAt"
    FROM items
    WHERE title ILIKE '%little prince%' OR title ILIKE '%petit prince%'
  `;
  console.log(JSON.stringify(q1, null, 2));
  const lpIds: string[] = q1.map((r: any) => r.id);
  console.log('IDs found:', lpIds);

  // QUERY 2
  sep('QUERY 2 — Reviews per Little Prince item');
  if (lpIds.length > 0) {
    const q2: any[] = await (prisma as any).$queryRaw`
      SELECT "itemId", COUNT(*) as review_count
      FROM reviews
      WHERE "itemId" = ANY(${lpIds}::uuid[])
      GROUP BY "itemId"
    `;
    console.log(JSON.stringify(q2, null, 2));
  } else {
    console.log('No IDs to query.');
  }

  // QUERY 3
  sep('QUERY 3 — Ratings per Little Prince item');
  if (lpIds.length > 0) {
    const q3: any[] = await (prisma as any).$queryRaw`
      SELECT "itemId", COUNT(*) as rating_count, AVG(score) as avg_score
      FROM ratings
      WHERE "itemId" = ANY(${lpIds}::uuid[])
      GROUP BY "itemId"
    `;
    console.log(JSON.stringify(q3, null, 2));
  } else {
    console.log('No IDs to query.');
  }

  // QUERY 4
  sep('QUERY 4 — Library entries per Little Prince item');
  if (lpIds.length > 0) {
    const q4: any[] = await (prisma as any).$queryRaw`
      SELECT "itemId", status, COUNT(*)
      FROM library_entries
      WHERE "itemId" = ANY(${lpIds}::uuid[])
      GROUP BY "itemId", status
    `;
    console.log(JSON.stringify(q4, null, 2));
  } else {
    console.log('No IDs to query.');
  }

  // QUERY 5
  sep('QUERY 5 — Same Google Books ID, different items');
  const q5: any[] = await (prisma as any).$queryRaw`
    SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b,
           a.ext->>'google_books_id' as gbooks_id
    FROM items a JOIN items b ON a.id < b.id AND a.type = b.type
    WHERE a.ext->>'google_books_id' IS NOT NULL
      AND a.ext->>'google_books_id' = b.ext->>'google_books_id'
    LIMIT 20
  `;
  console.log(JSON.stringify(q5, null, 2));

  // QUERY 6
  sep('QUERY 6 — Same TMDB ID, different items');
  const q6: any[] = await (prisma as any).$queryRaw`
    SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b,
           a.ext->>'tmdb_id' as tmdb_id
    FROM items a JOIN items b ON a.id < b.id AND a.type = b.type
    WHERE a.ext->>'tmdb_id' IS NOT NULL
      AND a.ext->>'tmdb_id' = b.ext->>'tmdb_id'
    LIMIT 20
  `;
  console.log(JSON.stringify(q6, null, 2));

  // QUERY 7
  sep('QUERY 7 — Same IGDB ID, different items');
  const q7: any[] = await (prisma as any).$queryRaw`
    SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b,
           a.ext->>'igdb_id' as igdb_id
    FROM items a JOIN items b ON a.id < b.id AND a.type = b.type
    WHERE a.ext->>'igdb_id' IS NOT NULL
      AND a.ext->>'igdb_id' = b.ext->>'igdb_id'
    LIMIT 20
  `;
  console.log(JSON.stringify(q7, null, 2));

  // QUERY 8
  sep('QUERY 8 — Same MAL ID, different items');
  const q8: any[] = await (prisma as any).$queryRaw`
    SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b,
           a.ext->>'mal_id' as mal_id
    FROM items a JOIN items b ON a.id < b.id AND a.type = b.type
    WHERE a.ext->>'mal_id' IS NOT NULL
      AND a.ext->>'mal_id' = b.ext->>'mal_id'
    LIMIT 20
  `;
  console.log(JSON.stringify(q8, null, 2));

  // QUERY 9
  sep('QUERY 9 — Same Spotify ID, different items');
  const q9: any[] = await (prisma as any).$queryRaw`
    SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b,
           a.ext->>'spotify_id' as spotify_id
    FROM items a JOIN items b ON a.id < b.id AND a.type = b.type
    WHERE a.ext->>'spotify_id' IS NOT NULL
      AND a.ext->>'spotify_id' = b.ext->>'spotify_id'
    LIMIT 20
  `;
  console.log(JSON.stringify(q9, null, 2));

  // QUERY 10
  sep('QUERY 10 — Same title + type + year');
  const q10: any[] = await (prisma as any).$queryRaw`
    SELECT title, type, year, COUNT(*) as dupes
    FROM items
    GROUP BY title, type, year
    HAVING COUNT(*) > 1
    ORDER BY dupes DESC
    LIMIT 30
  `;
  console.log(JSON.stringify(q10, null, 2));

  // QUERY 11
  sep('QUERY 11 — Same external ID cross-check (books: google_books + openlibrary)');
  const q11: any[] = await (prisma as any).$queryRaw`
    SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.type
    FROM items a JOIN items b ON a.type = b.type AND a.id != b.id AND a.id < b.id
    WHERE (
      (a.ext->>'google_books_id' = b.ext->>'google_books_id' AND a.ext->>'google_books_id' IS NOT NULL)
      OR (a.ext->>'openlibrary_id' = b.ext->>'openlibrary_id' AND a.ext->>'openlibrary_id' IS NOT NULL)
    )
    LIMIT 20
  `;
  console.log(JSON.stringify(q11, null, 2));

  // QUERY 12
  sep('QUERY 12 — Title contains other title');
  const q12: any[] = await (prisma as any).$queryRaw`
    SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.type
    FROM items a JOIN items b ON a.type = b.type AND a.id < b.id
    WHERE (a.title ILIKE '%' || b.title || '%' OR b.title ILIKE '%' || a.title || '%')
      AND length(a.title) > 5 AND length(b.title) > 5
      AND a.title != b.title
    LIMIT 30
  `;
  console.log(JSON.stringify(q12, null, 2));

  // QUERY 13
  sep('QUERY 13 — Count duplicate pairs by type (all external IDs)');
  const q13: any[] = await (prisma as any).$queryRaw`
    SELECT a.type,
      SUM(CASE WHEN a.ext->>'google_books_id' = b.ext->>'google_books_id' AND a.ext->>'google_books_id' IS NOT NULL THEN 1 ELSE 0 END) as gbooks_dups,
      SUM(CASE WHEN a.ext->>'tmdb_id' = b.ext->>'tmdb_id' AND a.ext->>'tmdb_id' IS NOT NULL THEN 1 ELSE 0 END) as tmdb_dups,
      SUM(CASE WHEN a.ext->>'igdb_id' = b.ext->>'igdb_id' AND a.ext->>'igdb_id' IS NOT NULL THEN 1 ELSE 0 END) as igdb_dups,
      SUM(CASE WHEN a.ext->>'mal_id' = b.ext->>'mal_id' AND a.ext->>'mal_id' IS NOT NULL THEN 1 ELSE 0 END) as mal_dups,
      SUM(CASE WHEN a.ext->>'spotify_id' = b.ext->>'spotify_id' AND a.ext->>'spotify_id' IS NOT NULL THEN 1 ELSE 0 END) as spotify_dups,
      SUM(CASE WHEN a.ext->>'openlibrary_id' = b.ext->>'openlibrary_id' AND a.ext->>'openlibrary_id' IS NOT NULL THEN 1 ELSE 0 END) as openlibrary_dups
    FROM items a JOIN items b ON a.id < b.id AND a.type = b.type
    GROUP BY a.type
    ORDER BY a.type
  `;
  console.log(JSON.stringify(q13, null, 2));

  // QUERY 14
  sep('QUERY 14 — High priority: duplicates with reviews/ratings');
  const q14: any[] = await (prisma as any).$queryRaw`
    WITH dup_pairs AS (
      SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.type
      FROM items a JOIN items b ON a.type = b.type AND a.id < b.id
      WHERE (
        (a.ext->>'google_books_id' = b.ext->>'google_books_id' AND a.ext->>'google_books_id' IS NOT NULL)
        OR (a.ext->>'tmdb_id' = b.ext->>'tmdb_id' AND a.ext->>'tmdb_id' IS NOT NULL)
        OR (a.ext->>'igdb_id' = b.ext->>'igdb_id' AND a.ext->>'igdb_id' IS NOT NULL)
        OR (a.ext->>'mal_id' = b.ext->>'mal_id' AND a.ext->>'mal_id' IS NOT NULL)
      )
    )
    SELECT dp.*,
      (SELECT COUNT(*) FROM reviews WHERE "itemId" = dp.id_a) as reviews_a,
      (SELECT COUNT(*) FROM reviews WHERE "itemId" = dp.id_b) as reviews_b,
      (SELECT COUNT(*) FROM ratings WHERE "itemId" = dp.id_a) as ratings_a,
      (SELECT COUNT(*) FROM ratings WHERE "itemId" = dp.id_b) as ratings_b
    FROM dup_pairs dp
    ORDER BY (
      (SELECT COUNT(*) FROM reviews WHERE "itemId" = dp.id_a) +
      (SELECT COUNT(*) FROM reviews WHERE "itemId" = dp.id_b) +
      (SELECT COUNT(*) FROM ratings WHERE "itemId" = dp.id_a) +
      (SELECT COUNT(*) FROM ratings WHERE "itemId" = dp.id_b)
    ) DESC
    LIMIT 20
  `;
  console.log(JSON.stringify(q14, null, 2));

  await prisma.$disconnect();
  console.log('\nDone.');
  // ─── LEGACY CONTENT BELOW (kept for reference) ──────────────────────────

  // ─── SECTION 1: Per-title lookup ────────────────────────────────────────────
  const titlesToCheck = [
    'Attack on Titan',
    'My Hero Academia',
    'Demon Slayer',
    'Naruto',
    'One Piece',
    'Jujutsu Kaisen',
    'Fullmetal Alchemist',
  ];

  console.log('═══════════════════════════════════════════════════════════');
  console.log('SECTION 1: Per-title rows (type IN tv,manga)');
  console.log('═══════════════════════════════════════════════════════════');

  for (const title of titlesToCheck) {
    console.log(`\n── ${title} ──`);
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, title, type, year,
              (ext->>'tmdb_id') AS tmdb_id,
              (ext->>'mal_id')  AS mal_id,
              LEFT(cover, 60)   AS cover,
              vote_count
       FROM items
       WHERE LOWER(title) ILIKE $1
         AND type IN ('tv','manga')
       ORDER BY type, year NULLS LAST`,
      `%${title.toLowerCase()}%`
    );
    if (rows.length === 0) {
      console.log('  (no rows)');
    } else {
      for (const r of rows) {
        console.log(
          `  id=${r.id}  type=${r.type}  year=${r.year ?? '?'}` +
          `  tmdb_id=${r.tmdb_id ?? '-'}  mal_id=${r.mal_id ?? '-'}` +
          `  votes=${r.vote_count ?? 0}`
        );
        console.log(`    title : ${r.title}`);
        console.log(`    cover : ${r.cover ?? '(none)'}`);
      }
    }
  }

  // ─── SECTION 2: Season-cluster duplication ───────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('SECTION 2: Season-cluster duplication');
  console.log('═══════════════════════════════════════════════════════════');

  // Find items whose title is a prefix of another item's title (same type),
  // where the match is title + ' ' (so 'Attack on Titan Season 2' starts with
  // 'Attack on Titan ').  We also count the number of "season" child rows.
  const seasonClusters: any[] = await prisma.$queryRawUnsafe(`
    SELECT base.type,
           base.title                        AS base_title,
           COUNT(child.id)::int              AS season_count,
           ARRAY_AGG(child.title ORDER BY child.title) AS season_titles
    FROM items base
    JOIN items child
      ON child.type = base.type
     AND child.id   <> base.id
     AND LOWER(child.title) LIKE (LOWER(base.title) || ' %')
    GROUP BY base.type, base.title
    ORDER BY season_count DESC, base.title
  `);

  if (seasonClusters.length === 0) {
    console.log('\nNo season clusters found.');
  } else {
    let totalSeasonEntries = 0;
    console.log(`\nBase titles with season clusters: ${seasonClusters.length}`);
    for (const row of seasonClusters) {
      totalSeasonEntries += row.season_count;
      console.log(
        `\n  [${row.type}] "${row.base_title}"  →  ${row.season_count} season entries`
      );
      for (const st of row.season_titles) {
        console.log(`      • ${st}`);
      }
    }
    console.log(`\nTotal season entries across all clusters: ${totalSeasonEntries}`);
  }

  // ─── SECTION 3: True cross-API duplicates ────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('SECTION 3: Cross-API duplicates (TMDB vs MAL)');
  console.log('═══════════════════════════════════════════════════════════');

  // Pairs where LOWER(TRIM(title)) matches exactly, same type (tv or manga),
  // one has tmdb_id and the other has mal_id.
  const exactDupePairs: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      a.id          AS id_a,
      a.title       AS title_a,
      a.type        AS type_a,
      a.year        AS year_a,
      (a.ext->>'tmdb_id') AS tmdb_id_a,
      (a.ext->>'mal_id')  AS mal_id_a,
      b.id          AS id_b,
      b.title       AS title_b,
      b.type        AS type_b,
      b.year        AS year_b,
      (b.ext->>'tmdb_id') AS tmdb_id_b,
      (b.ext->>'mal_id')  AS mal_id_b
    FROM items a
    JOIN items b
      ON a.id < b.id
     AND a.type = b.type
     AND a.type IN ('tv','manga')
     AND LOWER(TRIM(a.title)) = LOWER(TRIM(b.title))
    WHERE (
      ((a.ext->>'tmdb_id') IS NOT NULL AND (b.ext->>'mal_id') IS NOT NULL)
      OR
      ((a.ext->>'mal_id')  IS NOT NULL AND (b.ext->>'tmdb_id') IS NOT NULL)
    )
    ORDER BY a.title
  `);

  console.log(`\nExact-title cross-API duplicate pairs: ${exactDupePairs.length}`);
  for (const p of exactDupePairs) {
    console.log(
      `\n  "${p.title_a}"  [${p.type_a}]` +
      `\n    A: id=${p.id_a}  year=${p.year_a ?? '?'}  tmdb_id=${p.tmdb_id_a ?? '-'}  mal_id=${p.mal_id_a ?? '-'}` +
      `\n    B: id=${p.id_b}  year=${p.year_b ?? '?'}  tmdb_id=${p.tmdb_id_b ?? '-'}  mal_id=${p.mal_id_b ?? '-'}`
    );
  }

  // Fuzzy near-match: ILIKE where one title contains the other (shorter in longer),
  // picking pairs where combined tmdb+mal coverage differs.
  const fuzzyDupePairs: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      a.id          AS id_a,
      a.title       AS title_a,
      a.type        AS type_a,
      a.year        AS year_a,
      (a.ext->>'tmdb_id') AS tmdb_id_a,
      (a.ext->>'mal_id')  AS mal_id_a,
      b.id          AS id_b,
      b.title       AS title_b,
      b.type        AS type_b,
      b.year        AS year_b,
      (b.ext->>'tmdb_id') AS tmdb_id_b,
      (b.ext->>'mal_id')  AS mal_id_b
    FROM items a
    JOIN items b
      ON a.id < b.id
     AND a.type = b.type
     AND a.type IN ('tv','manga')
     AND (
       LOWER(a.title) LIKE '%' || LOWER(b.title) || '%'
       OR
       LOWER(b.title) LIKE '%' || LOWER(a.title) || '%'
     )
     AND LOWER(TRIM(a.title)) <> LOWER(TRIM(b.title))
    WHERE (
      ((a.ext->>'tmdb_id') IS NOT NULL AND (b.ext->>'mal_id') IS NOT NULL)
      OR
      ((a.ext->>'mal_id')  IS NOT NULL AND (b.ext->>'tmdb_id') IS NOT NULL)
    )
    ORDER BY a.title
    LIMIT 50
  `);

  console.log(`\nFuzzy cross-API near-duplicate pairs (title contains other, limit 50): ${fuzzyDupePairs.length}`);
  for (const p of fuzzyDupePairs) {
    console.log(
      `\n  A: "${p.title_a}"  [${p.type_a}] id=${p.id_a}  year=${p.year_a ?? '?'}  tmdb=${p.tmdb_id_a ?? '-'}  mal=${p.mal_id_a ?? '-'}` +
      `\n  B: "${p.title_b}"  [${p.type_b}] id=${p.id_b}  year=${p.year_b ?? '?'}  tmdb=${p.tmdb_id_b ?? '-'}  mal=${p.mal_id_b ?? '-'}`
    );
  }

  await prisma.$disconnect();
}

main().catch(console.error);
