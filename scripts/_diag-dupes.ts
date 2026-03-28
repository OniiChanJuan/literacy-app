import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

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
