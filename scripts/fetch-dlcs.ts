/**
 * Fetch DLC and expansion data from IGDB for all base games in the database.
 * Run with: npx tsx scripts/fetch-dlcs.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  console.log("🎮 Fetching DLC & Expansion data from IGDB...\n");

  // Get IGDB token
  const tokenRes = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const { access_token: token } = await tokenRes.json();
  if (!token) { console.error("Failed to get IGDB token"); return; }

  const igdbFetch = async (endpoint: string, body: string) => {
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": IGDB_ID,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body,
    });
    return res.json();
  };

  // Load all base games
  const games = await prisma.item.findMany({
    where: { type: "game", parentItemId: null, isUpcoming: false },
    select: { id: true, title: true, cover: true, genre: true, vibes: true, platforms: true },
  });
  console.log(`📊 ${games.length} base games in database\n`);

  // Known DLCs to prioritize (title -> parent title)
  const knownDlcs: Record<string, string> = {
    "Phantom Liberty": "Cyberpunk 2077",
    "Shadow of the Erdtree": "Elden Ring",
    "Hearts of Stone": "The Witcher 3",
    "Blood and Wine": "The Witcher 3",
    "The Grimm Troupe": "Hollow Knight",
    "Godmaster": "Hollow Knight",
    "Lifeblood": "Hollow Knight",
    "Left Behind": "The Last of Us",
    "Ashes of Ariandel": "Dark Souls III",
    "The Ringed City": "Dark Souls III",
    "Farewell": "Celeste",
    "The Ancient Gods": "DOOM Eternal",
    "The Foundation": "Control",
    "The Frozen Wilds": "Horizon Zero Dawn",
    "Burning Shores": "Horizon Forbidden West",
    "Tiny Tina's Assault on Dragon Keep": "Borderlands 2",
    "Old Hunters": "Bloodborne",
  };

  // First, check if any existing items in DB are actually DLCs
  console.log("--- Checking existing items for known DLCs ---");
  let converted = 0;
  for (const [dlcKey, parentTitle] of Object.entries(knownDlcs)) {
    const dlcItem = await prisma.item.findFirst({
      where: {
        type: "game",
        title: { contains: dlcKey, mode: "insensitive" },
        parentItemId: null,
      },
      select: { id: true, title: true },
    });
    if (!dlcItem) continue;

    const parentItem = await prisma.item.findFirst({
      where: {
        type: "game",
        title: { contains: parentTitle, mode: "insensitive" },
        parentItemId: null,
      },
      select: { id: true, title: true },
    });
    if (!parentItem || parentItem.id === dlcItem.id) continue;

    await prisma.item.update({
      where: { id: dlcItem.id },
      data: { parentItemId: parentItem.id, itemSubtype: "dlc" },
    });
    converted++;
    console.log(`  ✓ Converted "${dlcItem.title}" → DLC of "${parentItem.title}"`);
  }
  console.log(`Converted ${converted} existing items to DLCs\n`);

  // Mark all remaining games without a parent as 'base'
  await prisma.item.updateMany({
    where: { type: "game", parentItemId: null, itemSubtype: null },
    data: { itemSubtype: "base" },
  });

  // Now fetch DLCs from IGDB for all base games
  console.log("--- Fetching DLCs from IGDB ---");
  let totalAdded = 0;
  let totalSkipped = 0;

  // Process in batches of 10 games
  for (let i = 0; i < games.length; i += 10) {
    const batch = games.slice(i, i + 10);
    const titles = batch.map((g) => `"${g.title.replace(/"/g, '\\"').replace(/[:–—].*/g, "").trim()}"`);

    try {
      // Search IGDB for these games
      const searchResults = await igdbFetch("games", `
        fields name, dlcs.name, dlcs.summary, dlcs.first_release_date, dlcs.cover.url,
               dlcs.category, dlcs.rating, dlcs.rating_count,
               expansions.name, expansions.summary, expansions.first_release_date,
               expansions.cover.url, expansions.category, expansions.rating, expansions.rating_count,
               expansions.platforms.name;
        where name = (${titles.join(",")});
        limit 10;
      `);

      for (const igdbGame of searchResults) {
        // Find matching DB game
        const dbGame = batch.find((g) =>
          g.title.toLowerCase().replace(/[:–—].*/g, "").trim() ===
          (igdbGame.name || "").toLowerCase().replace(/[:–—].*/g, "").trim()
        );
        if (!dbGame) continue;

        const allDlcs = [
          ...(igdbGame.dlcs || []).map((d: any) => ({ ...d, subtype: "dlc" })),
          ...(igdbGame.expansions || []).map((d: any) => ({ ...d, subtype: "expansion" })),
        ];

        for (const dlc of allDlcs) {
          if (!dlc.name) continue;

          // Check if already exists
          const existing = await prisma.item.findFirst({
            where: {
              title: { equals: dlc.name, mode: "insensitive" },
              type: "game",
            },
          });

          if (existing) {
            // Link it if not already linked
            if (!existing.parentItemId) {
              await prisma.item.update({
                where: { id: existing.id },
                data: { parentItemId: dbGame.id, itemSubtype: dlc.subtype },
              });
              totalSkipped++;
            }
            continue;
          }

          // Create new DLC item
          const releaseDate = dlc.first_release_date
            ? new Date(dlc.first_release_date * 1000)
            : null;
          const year = releaseDate ? releaseDate.getFullYear() : 0;
          if (year < 1990) continue; // Skip unreleased or bad data

          let coverUrl = "";
          if (dlc.cover?.url) {
            coverUrl = dlc.cover.url
              .replace("t_thumb", "t_cover_big")
              .replace("//", "https://");
          }

          try {
            await prisma.item.create({
              data: {
                title: dlc.name,
                type: "game",
                genre: dbGame.genre || [],
                vibes: dbGame.vibes || [],
                year,
                cover: coverUrl || dbGame.cover || "",
                description: dlc.summary || `${dlc.subtype === "expansion" ? "Expansion" : "DLC"} for ${dbGame.title}`,
                people: [],
                awards: [],
                platforms: dbGame.platforms || [],
                ext: {},
                parentItemId: dbGame.id,
                itemSubtype: dlc.subtype,
              },
            });
            totalAdded++;
            console.log(`  + ${dlc.name} (${dlc.subtype}) → ${dbGame.title}`);
          } catch (e: any) {
            // Skip duplicates
          }
        }
      }
    } catch (e: any) {
      // Skip batch errors
    }

    await sleep(300);
    if ((i + 10) % 50 === 0) console.log(`  ... processed ${i + 10}/${games.length} games`);
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  DLCs added:     ${totalAdded}`);
  console.log(`  DLCs linked:    ${totalSkipped}`);
  console.log(`  DLCs converted: ${converted}`);
  console.log(`  Total:          ${totalAdded + totalSkipped + converted}`);
  console.log(`═══════════════════════════════════════\n`);

  // Report summary
  const dlcCount = await prisma.item.count({ where: { parentItemId: { not: null } } });
  const gamesWithDlcs = await prisma.item.findMany({
    where: { type: "game", dlcs: { some: {} } },
    select: { title: true, _count: { select: { dlcs: true } } },
    orderBy: { title: "asc" },
  });

  console.log(`Total DLCs in database: ${dlcCount}`);
  console.log(`Games with DLCs:`);
  gamesWithDlcs.forEach((g) => console.log(`  ${g.title}: ${g._count.dlcs} DLC(s)`));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
