/**
 * Enrich items in the database that are missing key data:
 * people, genres, platforms, totalEp, vibes, external scores.
 *
 * For movies/TV: fetches from TMDB (credits, genres, watch providers, episodes)
 * For anime: also fetches MAL score from Jikan
 * For all items with <2 vibes: assigns vibes via keyword analysis
 *
 * Run: npx tsx scripts/enrich-items.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const JIKAN_BASE = "https://api.jikan.moe/v4";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Person {
  role: string;
  name: string;
}

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ── Provider name → platform key mapping ─────────────────────────────────

function mapProviderName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("netflix")) return "netflix";
  if (lower.includes("amazon") || lower.includes("prime")) return "prime";
  if (lower.includes("hbo") || lower.includes("max")) return "hbo";
  if (lower.includes("hulu")) return "hulu";
  if (lower.includes("apple")) return "apple";
  if (lower.includes("disney")) return "disney";
  if (lower.includes("paramount")) return "paramount";
  return null;
}

// ── Vibe assignment via keyword analysis ──────────────────────────────────

const KEYWORD_VIBES: [RegExp, string][] = [
  [/cyberpunk|dystopia|\bai\b|robot|cyber/i, "mind-bending"],
  [/horror|dark|grim|death/i, "dark"],
  [/love|romance|heart/i, "emotional"],
  [/funny|comedy|humor/i, "funny"],
  [/mystery|detective|noir/i, "atmospheric"],
  [/war|battle|epic/i, "epic"],
  [/philosophy|existential|meaning/i, "thought-provoking"],
  [/beautiful|stunning|visual/i, "immersive"],
  [/scary|terror|fear/i, "intense"],
  [/cozy|warm|comfort/i, "cozy"],
];

const GENRE_VIBES: Record<string, string> = {
  "sci-fi": "mind-bending",
  "science fiction": "mind-bending",
  action: "intense",
  drama: "emotional",
  thriller: "dark",
  fantasy: "epic",
  horror: "dark",
};

function deriveVibes(
  description: string,
  genres: string[],
  existingVibes: string[]
): string[] {
  const vibeSet = new Set(existingVibes);

  // Keyword analysis on description
  const text = description.toLowerCase();
  for (const [pattern, vibe] of KEYWORD_VIBES) {
    if (pattern.test(text)) vibeSet.add(vibe);
  }

  // Genre-based vibes
  for (const genre of genres) {
    const mapped = GENRE_VIBES[genre.toLowerCase()];
    if (mapped) vibeSet.add(mapped);
  }

  // Also check genre words in description
  const genreText = genres.join(" ").toLowerCase();
  for (const [pattern, vibe] of KEYWORD_VIBES) {
    if (pattern.test(genreText)) vibeSet.add(vibe);
  }

  const result = Array.from(vibeSet);
  // Return 2-4 vibes
  return result.slice(0, 4);
}

// ── Stats tracking ───────────────────────────────────────────────────────

const stats = {
  total_items: 0,
  tmdb_enriched: 0,
  jikan_enriched: 0,
  vibes_assigned: 0,
  platforms_added: 0,
  people_added: 0,
  genres_added: 0,
  episodes_added: 0,
  errors: 0,
};

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("Enrich Items — Filling Missing Data\n");

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Query all items missing key data
  const items = await prisma.item.findMany({
    where: {
      isUpcoming: false,
      OR: [
        { people: { equals: [] } },
        { genre: { isEmpty: true } },
        { totalEp: 0 },
        { vibes: { hasSome: [] } }, // will be filtered below
      ],
    },
    select: {
      id: true,
      title: true,
      type: true,
      year: true,
      genre: true,
      vibes: true,
      people: true,
      platforms: true,
      description: true,
      totalEp: true,
      tmdbId: true,
      malId: true,
    },
  });

  // Also find items with fewer than 2 vibes separately
  const lowVibeItems = await prisma.item.findMany({
    where: {
      isUpcoming: false,
    },
    select: {
      id: true,
      title: true,
      type: true,
      year: true,
      genre: true,
      vibes: true,
      people: true,
      platforms: true,
      description: true,
      totalEp: true,
      tmdbId: true,
      malId: true,
    },
  });

  // Merge: items with missing data + items with <2 vibes
  const itemMap = new Map<number, (typeof items)[0]>();
  for (const item of items) itemMap.set(item.id, item);
  for (const item of lowVibeItems) {
    if ((item.vibes || []).length < 2) itemMap.set(item.id, item);
  }

  const allItems = Array.from(itemMap.values());
  stats.total_items = allItems.length;
  console.log(`Found ${allItems.length} items needing enrichment\n`);

  if (allItems.length === 0) {
    console.log("Nothing to enrich. All items have complete data.");
    await prisma.$disconnect();
    return;
  }

  // Process in batches of 50
  const BATCH_SIZE = 50;
  for (let batchStart = 0; batchStart < allItems.length; batchStart += BATCH_SIZE) {
    const batch = allItems.slice(batchStart, batchStart + BATCH_SIZE);
    console.log(
      `\n--- Batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (items ${batchStart + 1}-${Math.min(batchStart + BATCH_SIZE, allItems.length)}/${allItems.length}) ---`
    );

    for (const item of batch) {
      try {
        await enrichItem(prisma, item);
      } catch (e: any) {
        console.error(`  [ERROR] ${item.title}: ${e.message}`);
        stats.errors++;
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n================================================================");
  console.log("ENRICHMENT SUMMARY");
  console.log("================================================================\n");
  console.log(`  Total items processed: ${stats.total_items}`);
  console.log(`  TMDB enriched:        ${stats.tmdb_enriched}`);
  console.log(`  Jikan/MAL enriched:   ${stats.jikan_enriched}`);
  console.log(`  People added:         ${stats.people_added}`);
  console.log(`  Genres added:         ${stats.genres_added}`);
  console.log(`  Episodes added:       ${stats.episodes_added}`);
  console.log(`  Platforms added:      ${stats.platforms_added}`);
  console.log(`  Vibes assigned:       ${stats.vibes_assigned}`);
  console.log(`  Errors:               ${stats.errors}`);
  console.log("\n================================================================\n");

  await prisma.$disconnect();
}

// ── Per-item enrichment logic ────────────────────────────────────────────

async function enrichItem(prisma: any, item: any) {
  const people = (item.people as Person[]) || [];
  const genres: string[] = item.genre || [];
  const vibes: string[] = item.vibes || [];
  const platforms: any[] = (item.platforms as any[]) || [];
  const totalEp: number = item.totalEp || 0;
  const description: string = item.description || "";

  const needsPeople = people.length === 0;
  const needsGenres = genres.length === 0;
  const needsTotalEp = totalEp === 0 && (item.type === "tv" || item.type === "movie");
  const needsVibes = vibes.length < 2;

  const updateData: Record<string, any> = {};

  // ── TMDB enrichment for movies and TV ──────────────────────────────
  if (item.type === "movie" || item.type === "tv") {
    const tmdbType = item.type === "movie" ? "movie" : "tv";
    let tmdbId = item.tmdbId;

    // Search TMDB if we don't have the ID
    if (!tmdbId && (needsPeople || needsGenres || needsTotalEp)) {
      try {
        const searchUrl = `${TMDB_BASE}/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(item.title)}&year=${item.year}`;
        const searchData = await fetchJson(searchUrl);
        await sleep(250);

        const match =
          (searchData.results || []).find(
            (r: any) =>
              (r.title || r.name || "").toLowerCase() === item.title.toLowerCase()
          ) || searchData.results?.[0];

        if (match) {
          tmdbId = match.id;
          updateData.tmdbId = tmdbId;
        }
      } catch (e: any) {
        console.error(`  [TMDB search] ${item.title}: ${e.message}`);
      }
    }

    // Fetch full details from TMDB
    if (tmdbId && (needsPeople || needsGenres || needsTotalEp || platforms.length === 0)) {
      try {
        const detailUrl = `${TMDB_BASE}/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits,watch/providers`;
        const d = await fetchJson(detailUrl);
        await sleep(250);

        // People (director/creator + top 5 cast)
        if (needsPeople) {
          const newPeople: Person[] = [];
          if (tmdbType === "movie" && d.credits?.crew) {
            const director = d.credits.crew.find(
              (c: any) => c.job === "Director"
            );
            if (director) newPeople.push({ role: "Director", name: director.name });
          } else if (tmdbType === "tv" && d.created_by?.length) {
            newPeople.push({ role: "Creator", name: d.created_by[0].name });
          }
          if (d.credits?.cast) {
            for (const c of d.credits.cast.slice(0, 5)) {
              newPeople.push({ role: "Star", name: c.name });
            }
          }
          if (newPeople.length > 0) {
            updateData.people = newPeople;
            stats.people_added++;
          }
        }

        // Genres
        if (needsGenres && d.genres?.length) {
          updateData.genre = d.genres.map((g: any) => g.name);
          stats.genres_added++;
        }

        // Total episodes for TV
        if (needsTotalEp) {
          if (tmdbType === "movie") {
            updateData.totalEp = 1;
            stats.episodes_added++;
          } else if (d.number_of_episodes) {
            updateData.totalEp = d.number_of_episodes;
            stats.episodes_added++;
          }
        }

        // Platforms from watch providers (US region)
        if (platforms.length === 0) {
          const providers = d["watch/providers"]?.results?.US;
          if (providers?.flatrate) {
            const newPlatforms: string[] = [];
            for (const p of providers.flatrate.slice(0, 6)) {
              const key = mapProviderName(p.provider_name);
              if (key) newPlatforms.push(key);
            }
            if (newPlatforms.length > 0) {
              updateData.platforms = newPlatforms;
              stats.platforms_added++;
            }
          }
        }

        stats.tmdb_enriched++;
      } catch (e: any) {
        console.error(`  [TMDB details] ${item.title}: ${e.message}`);
      }
    }

    // ── Jikan/MAL for anime (Animation genre or JP origin) ───────────
    const isAnime =
      genres.some(
        (g) =>
          g.toLowerCase() === "animation" || g.toLowerCase() === "anime"
      ) || (updateData.genre || []).some(
        (g: string) =>
          g.toLowerCase() === "animation" || g.toLowerCase() === "anime"
      );

    if (isAnime && !item.malId) {
      try {
        const jikanType = "anime";
        const searchData = await fetchJson(
          `${JIKAN_BASE}/${jikanType}?q=${encodeURIComponent(item.title)}&limit=3`
        );
        await sleep(1000); // Jikan rate limit: 1 req/sec

        const match =
          (searchData.data || []).find((m: any) => {
            const t = (m.title_english || m.title || "").toLowerCase();
            return (
              t === item.title.toLowerCase() ||
              t.includes(item.title.toLowerCase())
            );
          }) || searchData.data?.[0];

        if (match) {
          if (match.mal_id) updateData.malId = match.mal_id;

          // Store MAL score as external score
          if (match.score) {
            try {
              await prisma.externalScore.upsert({
                where: { itemId_source: { itemId: item.id, source: "mal" } },
                update: {
                  score: match.score,
                  maxScore: 10,
                  scoreType: "community",
                  updatedAt: new Date(),
                },
                create: {
                  itemId: item.id,
                  source: "mal",
                  score: match.score,
                  maxScore: 10,
                  scoreType: "community",
                },
              });
            } catch {}
          }
          stats.jikan_enriched++;
        }
      } catch (e: any) {
        console.error(`  [Jikan] ${item.title}: ${e.message}`);
      }
    }
  }

  // ── Vibe assignment for items with <2 vibes ────────────────────────
  const currentVibes = (updateData.genre ? updateData.genre : genres) as string[];
  const currentVibeList = vibes;
  if (currentVibeList.length < 2) {
    const desc = description;
    const genresForVibes = updateData.genre || genres;
    const newVibes = deriveVibes(desc, genresForVibes, currentVibeList);
    if (newVibes.length >= 2 && newVibes.length > currentVibeList.length) {
      updateData.vibes = newVibes;
      stats.vibes_assigned++;
    }
  }

  // ── Apply updates ──────────────────────────────────────────────────
  if (Object.keys(updateData).length > 0) {
    await prisma.item.update({
      where: { id: item.id },
      data: updateData,
    });
    console.log(
      `  [OK] ${item.title} — updated: ${Object.keys(updateData).join(", ")}`
    );
  }
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
