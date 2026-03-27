/**
 * Cross-reference anime items with TMDB to add a second score source.
 *
 * Anime from Jikan only have MAL scores. The same shows exist on TMDB
 * and have their own community ratings. This script adds TMDB scores
 * to anime items so detail pages show: "MAL: 9.0 | TMDB: 8.7"
 *
 * Also attempts to find IMDb IDs for popular anime via TMDB external_ids,
 * then fetches real IMDb scores via OMDb (if OMDB_API_KEY is set).
 *
 * Run: npx tsx scripts/cross-reference-anime.ts
 * Options:
 *   --limit=50    Process only N items (default: all)
 *   --dry-run     Print matches without writing to DB
 *
 * Rate limits: 40 TMDB req/10s (enforced with 260ms sleep)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const OMDB_KEY = process.env.OMDB_API_KEY;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;
const DRY_RUN = args.includes("--dry-run");

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Title similarity check: returns true if titles are close enough to match */
function titlesMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  // Allow one being a substring of the other (for "Attack on Titan" vs "Attack on Titan Season 1")
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  return false;
}

async function upsertScore(prisma: any, itemId: number, source: string, score: number, maxScore: number, scoreType: string, label: string) {
  await prisma.externalScore.upsert({
    where: { itemId_source: { itemId, source } },
    update: { score, maxScore, scoreType, label, updatedAt: new Date() },
    create: { itemId, source, score, maxScore, scoreType, label },
  });
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { ext: true } });
  if (item) {
    const ext = (item.ext as Record<string, number>) || {};
    await prisma.item.update({ where: { id: itemId }, data: { ext: { ...ext, [source]: score } as any } });
  }
}

async function main() {
  console.log(`🗾 Anime Cross-Reference: Adding TMDB scores${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Find anime items (TV type with Anime genre, from Jikan)
  const animeItems = await prisma.item.findMany({
    where: {
      type: "tv",
      genre: { has: "Anime" },
    },
    select: { id: true, title: true, year: true, ext: true, voteCount: true },
    orderBy: { voteCount: "desc" },
  });

  console.log(`Found ${animeItems.length} anime items\n`);
  const toProcess = LIMIT < Infinity ? animeItems.slice(0, LIMIT) : animeItems;

  const stats = { matched: 0, tmdbAdded: 0, imdbAdded: 0, noMatch: 0 };

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    const ext = (item.ext as Record<string, number>) || {};

    // Skip if already has TMDB score
    if (ext.tmdb !== undefined) {
      process.stdout.write(`\r  [${i + 1}/${toProcess.length}] Already has TMDB: "${item.title}"    `);
      continue;
    }

    try {
      // Search TMDB for this anime
      const searchData = await fetchJson(
        `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(item.title)}`
      );
      await sleep(260);

      const results = searchData.results || [];

      // Find best match by title + year proximity (within 2 years)
      const match = results.find((r: any) => {
        const rTitle = r.name || r.original_name || "";
        const rYear = parseInt((r.first_air_date || "0").slice(0, 4)) || 0;
        const yearOk = item.year === 0 || Math.abs(rYear - item.year) <= 2;
        return titlesMatch(item.title, rTitle) && yearOk;
      });

      if (!match || !match.vote_average || match.vote_count < 10) {
        console.log(`  ○ [${i + 1}/${toProcess.length}] No confident TMDB match: "${item.title}"`);
        stats.noMatch++;
        continue;
      }

      stats.matched++;
      const tmdbScore = Math.round(match.vote_average * 10) / 10;

      console.log(`  ✓ [${i + 1}/${toProcess.length}] "${item.title}" → TMDB ${tmdbScore} (${match.vote_count} votes)`);

      if (!DRY_RUN) {
        await upsertScore(prisma, item.id, "tmdb", tmdbScore, 10, "community", "TMDB");
        stats.tmdbAdded++;
      }

      // Also try to get IMDb ID via TMDB external_ids for OMDb lookup
      if (OMDB_KEY && match.id) {
        try {
          const extIds = await fetchJson(
            `https://api.themoviedb.org/3/tv/${match.id}/external_ids?api_key=${TMDB_KEY}`
          );
          await sleep(260);

          if (extIds.imdb_id) {
            const omdbData = await fetchJson(
              `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${extIds.imdb_id}`
            );
            await sleep(150);

            if (omdbData.Response !== "False" && omdbData.imdbRating && omdbData.imdbRating !== "N/A") {
              const imdbScore = parseFloat(omdbData.imdbRating);
              if (!DRY_RUN) {
                await upsertScore(prisma, item.id, "imdb", imdbScore, 10, "community", "IMDb");
                stats.imdbAdded++;
              }
              console.log(`    + IMDb ${imdbScore} via OMDb`);
            }
          }
        } catch { /* OMDb lookup is optional, skip on error */ }
      }
    } catch (e: any) {
      console.log(`  ✗ [${i + 1}/${toProcess.length}] Error for "${item.title}": ${e.message?.slice(0, 60)}`);
    }
  }

  console.log("\n════════════════════════════════════════");
  console.log("✅ Cross-reference complete!");
  console.log(`  Matched:     ${stats.matched}`);
  console.log(`  TMDB added:  ${stats.tmdbAdded}`);
  console.log(`  IMDb added:  ${stats.imdbAdded}`);
  console.log(`  No match:    ${stats.noMatch}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Cross-reference failed:", e);
  process.exit(1);
});
