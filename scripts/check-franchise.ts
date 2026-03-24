/**
 * Franchise completeness checker.
 * Usage: npx tsx scripts/check-franchise.ts "Spider-Man"
 *
 * Searches all connected APIs for items that should be in the franchise,
 * compares against what's in the database, and reports gaps.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const franchiseName = process.argv[2];

if (!franchiseName) {
  console.error("Usage: npx tsx scripts/check-franchise.ts \"Franchise Name\"");
  process.exit(1);
}

async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  console.log(`\n🔍 Checking franchise: "${franchiseName}"\n`);

  // 1. What's in our database?
  const dbItems = await prisma.item.findMany({
    where: { title: { contains: franchiseName, mode: "insensitive" } },
    select: { id: true, title: true, type: true, year: true },
    orderBy: { year: "asc" },
  });

  // Also check franchise table
  const franchise = await prisma.franchise.findFirst({
    where: { name: { contains: franchiseName, mode: "insensitive" } },
    include: {
      items: {
        include: {
          item: { select: { id: true, title: true, type: true, year: true } },
        },
      },
    },
  });

  const linkedItems = franchise?.items.map((fi) => fi.item) || [];
  const allDbItems = [...dbItems];
  linkedItems.forEach((li) => {
    if (!allDbItems.find((d) => d.id === li.id)) allDbItems.push(li);
  });

  console.log(`📊 IN DATABASE: ${allDbItems.length} items`);
  allDbItems.sort((a, b) => a.year - b.year);
  allDbItems.forEach((i) => console.log(`  ${i.year} | ${i.type.padEnd(6)} | ${i.title}`));

  if (franchise) {
    console.log(`\n🔗 FRANCHISE: "${franchise.name}" (${linkedItems.length} linked items)`);
  } else {
    console.log(`\n⚠ No franchise record found for "${franchiseName}"`);
  }

  // 2. What does TMDB have?
  console.log(`\n═══ TMDB Results ═══`);
  const tmdbMovies = await fetchJson(
    `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(franchiseName)}&page=1`
  );
  await sleep(260);
  const tmdbTV = await fetchJson(
    `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(franchiseName)}&page=1`
  );

  const tmdbItems: { title: string; year: string; type: string; inDb: boolean }[] = [];

  for (const m of (tmdbMovies?.results || []).slice(0, 20)) {
    const title = m.title || "";
    const year = (m.release_date || "").slice(0, 4);
    const inDb = allDbItems.some((d) => d.title.toLowerCase() === title.toLowerCase() && d.type === "movie");
    tmdbItems.push({ title, year, type: "movie", inDb });
  }

  for (const t of (tmdbTV?.results || []).slice(0, 10)) {
    const title = t.name || "";
    const year = (t.first_air_date || "").slice(0, 4);
    const inDb = allDbItems.some((d) => d.title.toLowerCase() === title.toLowerCase() && d.type === "tv");
    tmdbItems.push({ title, year, type: "tv", inDb });
  }

  const tmdbMissing = tmdbItems.filter((t) => !t.inDb);
  console.log(`  Found: ${tmdbItems.length} | In DB: ${tmdbItems.filter((t) => t.inDb).length} | Missing: ${tmdbMissing.length}`);
  if (tmdbMissing.length > 0) {
    console.log("  Missing:");
    tmdbMissing.forEach((m) => console.log(`    ✗ ${m.title} (${m.year}, ${m.type})`));
  }

  // 3. What does IGDB have?
  console.log(`\n═══ IGDB Results ═══`);
  try {
    const tokenData = await fetchJson(
      `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    const token = tokenData?.access_token;

    if (token) {
      const igdbRes = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: { "Client-ID": IGDB_ID, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
        body: `search "${franchiseName}"; fields name,first_release_date; limit 30;`,
      });
      const igdbGames = await igdbRes.json();

      const igdbItems = (igdbGames || []).map((g: any) => {
        const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : 0;
        const inDb = allDbItems.some((d) => d.title.toLowerCase() === (g.name || "").toLowerCase() && d.type === "game");
        return { title: g.name, year, type: "game", inDb };
      });

      const igdbMissing = igdbItems.filter((g: any) => !g.inDb);
      console.log(`  Found: ${igdbItems.length} | In DB: ${igdbItems.filter((g: any) => g.inDb).length} | Missing: ${igdbMissing.length}`);
      if (igdbMissing.length > 0) {
        console.log("  Missing:");
        igdbMissing.slice(0, 15).forEach((m: any) => console.log(`    ✗ ${m.title} (${m.year})`));
        if (igdbMissing.length > 15) console.log(`    ... and ${igdbMissing.length - 15} more`);
      }
    }
  } catch {
    console.log("  IGDB unavailable");
  }

  // 4. Summary
  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`📊 FRANCHISE COMPLETENESS: "${franchiseName}"`);
  console.log(`════════════════════════════════════════════════════════`);
  console.log(`  In database:        ${allDbItems.length} items`);
  console.log(`  In franchise links: ${linkedItems.length} items`);
  console.log(`  TMDB missing:       ${tmdbItems.filter((t) => !t.inDb).length}`);
  console.log(`════════════════════════════════════════════════════════\n`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
