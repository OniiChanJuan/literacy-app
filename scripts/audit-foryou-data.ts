/**
 * Step 0 Data Audit — For You page quality investigation
 * Run: npx tsx scripts/audit-foryou-data.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DIRECT_URL;
if (!connUrl) { console.error("No DATABASE_URL found in env"); process.exit(1); }
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== STEP 0 DATA AUDIT ===\n");

  // ─── a) Vote count distribution by type ───────────────────────────────
  console.log("─── a) Vote count distribution by type ───");
  const voteDistRaw = await prisma.$queryRaw<any[]>`
    SELECT type,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE "vote_count" >= 1000)::int as above_1000,
      COUNT(*) FILTER (WHERE "vote_count" >= 500)::int  as above_500,
      COUNT(*) FILTER (WHERE "vote_count" >= 200)::int  as above_200,
      COUNT(*) FILTER (WHERE "vote_count" >= 100)::int  as above_100,
      COUNT(*) FILTER (WHERE "vote_count" >= 50)::int   as above_50,
      COUNT(*) FILTER (WHERE "vote_count" >= 10)::int   as above_10
    FROM items
    WHERE parent_item_id IS NULL
    GROUP BY type
    ORDER BY type
  `;
  console.table(voteDistRaw);

  // ─── b) Max voteCount for anime vs manga (detect 200-cap bug) ─────────
  console.log("\n─── b) Max/min/cap for movie+tv+manga+anime ───");
  const capCheck = await prisma.$queryRaw<any[]>`
    SELECT type,
      MAX("vote_count")::int as max_votes,
      MIN("vote_count")::int as min_votes,
      COUNT(*) FILTER (WHERE "vote_count" = 200)::int as exactly_200
    FROM items
    WHERE type IN ('tv','movie','manga','anime') AND parent_item_id IS NULL
    GROUP BY type
  `;
  console.table(capCheck);

  console.log("\n─── b2) Anime items (ext.mal OR genre contains Anime) — vote cap ───");
  const animeCapCheck = await prisma.$queryRaw<any[]>`
    SELECT
      MAX("vote_count")::int as max_votes,
      COUNT(*) FILTER (WHERE "vote_count" = 200)::int as exactly_200,
      COUNT(*)::int as total
    FROM items
    WHERE (genre @> ARRAY['Anime'] OR (ext->>'mal') IS NOT NULL)
      AND type IN ('tv','movie')
      AND parent_item_id IS NULL
  `;
  console.table(animeCapCheck);

  console.log("\n─── b3) Manga vote counts ───");
  const mangaVotes = await prisma.$queryRaw<any[]>`
    SELECT
      MAX("vote_count")::int as max_votes,
      MIN("vote_count")::int as min_votes,
      COUNT(*) FILTER (WHERE "vote_count" = 200)::int as exactly_200,
      COUNT(*)::int as total
    FROM items
    WHERE type = 'manga' AND parent_item_id IS NULL
  `;
  console.table(mangaVotes);

  // ─── c) normalizeScore proxy — score distribution via ext fields ────────
  // NOTE: There is NO normalizeScore column in the DB. It's computed at runtime.
  // We approximate by checking what fraction of items have ext scores that would
  // yield certain normalizeScore thresholds.
  console.log("\n─── c) Ext score presence and rough quality distribution ───");
  const extScoreDist = await prisma.$queryRaw<any[]>`
    SELECT type,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE (ext->>'imdb') IS NOT NULL)::int    as has_imdb,
      COUNT(*) FILTER (WHERE (ext->>'tmdb') IS NOT NULL)::int    as has_tmdb,
      COUNT(*) FILTER (WHERE (ext->>'mal') IS NOT NULL)::int     as has_mal,
      COUNT(*) FILTER (WHERE (ext->>'igdb') IS NOT NULL)::int    as has_igdb,
      COUNT(*) FILTER (WHERE (ext->>'google_books') IS NOT NULL)::int as has_google_books,
      COUNT(*) FILTER (WHERE (ext->>'spotify_popularity') IS NOT NULL)::int as has_spotify,
      COUNT(*) FILTER (WHERE ext = '{}'::jsonb OR ext IS NULL)::int as no_scores
    FROM items
    WHERE parent_item_id IS NULL
    GROUP BY type
    ORDER BY type
  `;
  console.table(extScoreDist);

  // ─── d) Top 5 per type by voteCount ───────────────────────────────────
  console.log("\n─── d) Top 5 per type by voteCount ───");
  const types = ["movie","tv","book","manga","comic","game","music","podcast"];
  for (const t of types) {
    const top5 = await prisma.$queryRaw<any[]>`
      SELECT id, title, "vote_count" as votes,
        ext->>'tmdb' as tmdb,
        ext->>'imdb' as imdb,
        ext->>'mal' as mal,
        ext->>'igdb' as igdb,
        ext->>'google_books' as google_books,
        ext->>'spotify_popularity' as spotify,
        substring(description, 1, 40) as desc_snippet
      FROM items
      WHERE type = ${t} AND parent_item_id IS NULL
      ORDER BY "vote_count" DESC
      LIMIT 5
    `;
    console.log(`\n  -- ${t.toUpperCase()} top 5 by voteCount --`);
    console.table(top5);
  }

  // ─── e) 200-cap anomaly for manga ─────────────────────────────────────
  console.log("\n─── e) Manga 200-cap anomaly count ───");
  const manga200 = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*)::int as count_exactly_200
    FROM items
    WHERE type = 'manga' AND "vote_count" = 200 AND parent_item_id IS NULL
  `;
  console.table(manga200);

  // ─── f) Movies with suspicious high tmdb but low voteCount ────────────
  console.log("\n─── f) Movies: high tmdb score but low voteCount (potential 'Nude' anomaly) ───");
  const nudeBug = await prisma.$queryRaw<any[]>`
    SELECT title, "vote_count" as votes,
      ext->>'tmdb' as tmdb_score,
      ext->>'imdb' as imdb_score
    FROM items
    WHERE type = 'movie' AND "vote_count" < 1000 AND parent_item_id IS NULL
    ORDER BY (ext->>'tmdb')::float DESC NULLS LAST
    LIMIT 10
  `;
  console.table(nudeBug);

  // ─── g) Key items: normalizeScore proxy for Dark Knight, Parasite, AoT, FMA:B ──
  console.log("\n─── g) Key items — ext scores & voteCount ───");
  const keyItems = await prisma.$queryRaw<any[]>`
    SELECT id, title, type, "vote_count" as votes,
      ext->>'imdb' as imdb,
      ext->>'tmdb' as tmdb,
      ext->>'mal'  as mal,
      ext->>'rt_critics' as rt_critics,
      ext->>'metacritic' as metacritic
    FROM items
    WHERE title ILIKE '%Dark Knight%'
       OR title ILIKE '%Parasite%'
       OR title ILIKE '%Attack on Titan%'
       OR title ILIKE '%Fullmetal Alchemist%'
    ORDER BY "vote_count" DESC
    LIMIT 12
  `;
  console.table(keyItems);

  // ─── h) Items with ext.mal by type ───────────────────────────────────
  console.log("\n─── h) Count of items with ext.mal score by type ───");
  const malCounts = await prisma.$queryRaw<any[]>`
    SELECT type, COUNT(*)::int as count
    FROM items
    WHERE (ext->>'mal') IS NOT NULL AND parent_item_id IS NULL
    GROUP BY type
    ORDER BY type
  `;
  console.table(malCounts);

  // ─── EXTRA) meetsQualityFloor approximation per type ─────────────────
  console.log("\n─── EXTRA) Manga quality floor check (votes>=100 required) ───");
  const mangaFloor = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE "vote_count" >= 100)::int as meets_vote_floor,
      COUNT(*) FILTER (WHERE "vote_count" < 100)::int  as below_vote_floor,
      COUNT(*) FILTER (WHERE "vote_count" >= 100 AND (ext->>'mal')::float >= 6.0)::int as meets_full_floor
    FROM items
    WHERE type = 'manga' AND parent_item_id IS NULL
  `;
  console.table(mangaFloor);

  console.log("\n─── EXTRA) Movie/TV quality floor check (votes>=50, score>=0.6) ───");
  const movieFloor = await prisma.$queryRaw<any[]>`
    SELECT type,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE "vote_count" >= 50)::int as votes_ok,
      COUNT(*) FILTER (WHERE "vote_count" < 50)::int  as votes_too_low,
      COUNT(*) FILTER (WHERE (ext->>'imdb')::float >= 6.0 OR (ext->>'tmdb')::float >= 6.0)::int as score_ok
    FROM items
    WHERE type IN ('movie','tv') AND parent_item_id IS NULL
    GROUP BY type
  `;
  console.table(movieFloor);

  console.log("\n─── EXTRA) Music/Podcast quality (spotify_popularity distribution) ───");
  const musicDist = await prisma.$queryRaw<any[]>`
    SELECT type,
      COUNT(*)::int as total,
      MIN((ext->>'spotify_popularity')::float)::int as min_spotify,
      MAX((ext->>'spotify_popularity')::float)::int as max_spotify,
      AVG((ext->>'spotify_popularity')::float)::int as avg_spotify,
      COUNT(*) FILTER (WHERE (ext->>'spotify_popularity')::float >= 50)::int as above_50,
      COUNT(*) FILTER (WHERE (ext->>'spotify_popularity')::float >= 65)::int as above_65
    FROM items
    WHERE type IN ('music','podcast') AND parent_item_id IS NULL
      AND (ext->>'spotify_popularity') IS NOT NULL
    GROUP BY type
  `;
  console.table(musicDist);

  console.log("\n─── EXTRA) Game ext score presence ───");
  const gameDist = await prisma.$queryRaw<any[]>`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE (ext->>'igdb') IS NOT NULL)::int as has_igdb,
      COUNT(*) FILTER (WHERE (ext->>'igdb_critics') IS NOT NULL)::int as has_igdb_critics,
      COUNT(*) FILTER (WHERE (ext->>'metacritic') IS NOT NULL)::int as has_metacritic,
      MIN((ext->>'igdb')::float)::int as min_igdb,
      MAX((ext->>'igdb')::float)::int as max_igdb,
      AVG((ext->>'igdb')::float)::int as avg_igdb
    FROM items
    WHERE type = 'game' AND parent_item_id IS NULL
  `;
  console.table(gameDist);

  // ─── EXTRA) Total items per type (incl. children) ────────────────────
  console.log("\n─── EXTRA) Total items per type including children ───");
  const totalPerType = await prisma.$queryRaw<any[]>`
    SELECT type, COUNT(*)::int as all_items,
      COUNT(*) FILTER (WHERE parent_item_id IS NULL)::int as top_level
    FROM items
    GROUP BY type
    ORDER BY type
  `;
  console.table(totalPerType);

  await prisma.$disconnect();
  console.log("\n=== AUDIT COMPLETE ===");
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
