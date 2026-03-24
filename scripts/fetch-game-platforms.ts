/**
 * Fetch accurate platform data for all games from IGDB.
 * Updates the platforms JSON field with specific console names.
 *
 * Run: npx tsx scripts/fetch-game-platforms.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// IGDB platform ID → display info
const PLATFORM_MAP: Record<number, { key: string; label: string; color: string; icon: string; generation?: string }> = {
  // PC
  6:   { key: "pc", label: "PC", color: "#171a21", icon: "💻" },
  14:  { key: "mac", label: "Mac", color: "#555555", icon: "🍎" },
  3:   { key: "linux", label: "Linux", color: "#FCC624", icon: "🐧" },

  // PlayStation
  167: { key: "ps5", label: "PS5", color: "#003087", icon: "🎮" },
  48:  { key: "ps4", label: "PS4", color: "#003087", icon: "🎮" },
  9:   { key: "ps3", label: "PS3", color: "#003087", icon: "🎮" },
  8:   { key: "ps2", label: "PS2", color: "#003087", icon: "🎮" },
  7:   { key: "ps1", label: "PS1", color: "#003087", icon: "🎮" },
  38:  { key: "psp", label: "PSP", color: "#003087", icon: "🎮" },
  46:  { key: "vita", label: "PS Vita", color: "#003087", icon: "🎮" },

  // Xbox
  169: { key: "xsx", label: "Xbox Series X|S", color: "#107C10", icon: "🎮" },
  49:  { key: "xone", label: "Xbox One", color: "#107C10", icon: "🎮" },
  12:  { key: "x360", label: "Xbox 360", color: "#107C10", icon: "🎮" },
  11:  { key: "xbox", label: "Xbox", color: "#107C10", icon: "🎮" },

  // Nintendo
  130: { key: "switch", label: "Nintendo Switch", color: "#E60012", icon: "🎮" },
  41:  { key: "wiiu", label: "Wii U", color: "#009AC7", icon: "🎮" },
  5:   { key: "wii", label: "Wii", color: "#8B8B8B", icon: "🎮" },
  4:   { key: "n64", label: "N64", color: "#2F9B2F", icon: "🎮" },
  21:  { key: "gc", label: "GameCube", color: "#6A0DAD", icon: "🎮" },
  19:  { key: "snes", label: "SNES", color: "#7B7B7B", icon: "🎮" },
  18:  { key: "nes", label: "NES", color: "#C4C4C4", icon: "🎮" },
  20:  { key: "ds", label: "Nintendo DS", color: "#BFBFBF", icon: "🎮" },
  37:  { key: "3ds", label: "Nintendo 3DS", color: "#CE1111", icon: "🎮" },
  24:  { key: "gba", label: "Game Boy Advance", color: "#4B0082", icon: "🎮" },
  33:  { key: "gb", label: "Game Boy", color: "#8B956D", icon: "🎮" },
  22:  { key: "gbc", label: "Game Boy Color", color: "#6B238E", icon: "🎮" },
  471: { key: "switch2", label: "Nintendo Switch 2", color: "#E60012", icon: "🎮" },

  // Sega
  23:  { key: "dc", label: "Dreamcast", color: "#FF6600", icon: "🌀" },
  29:  { key: "genesis", label: "Sega Genesis", color: "#171717", icon: "🎮" },
  32:  { key: "saturn", label: "Sega Saturn", color: "#1A1A2E", icon: "🎮" },
  78:  { key: "segacd", label: "Sega CD", color: "#171717", icon: "🎮" },
  35:  { key: "gg", label: "Game Gear", color: "#171717", icon: "🎮" },
  30:  { key: "sms", label: "Sega Master System", color: "#171717", icon: "🎮" },

  // Other
  34:  { key: "android", label: "Android", color: "#3DDC84", icon: "📱" },
  39:  { key: "ios", label: "iOS", color: "#555555", icon: "📱" },
  82:  { key: "browser", label: "Browser", color: "#4285F4", icon: "🌐" },
  170: { key: "stadia", label: "Stadia", color: "#CD2640", icon: "☁️" },

  // Retro
  75:  { key: "3do", label: "3DO", color: "#000000", icon: "🎮" },
  64:  { key: "sms", label: "Sega Master System", color: "#171717", icon: "🎮" },
  87:  { key: "vb", label: "Virtual Boy", color: "#EE0000", icon: "🎮" },
  57:  { key: "wonderswan", label: "WonderSwan", color: "#333333", icon: "🎮" },

  // Atari
  59:  { key: "atari2600", label: "Atari 2600", color: "#A0522D", icon: "🎮" },
  65:  { key: "atari8bit", label: "Atari 8-bit", color: "#A0522D", icon: "🎮" },
  66:  { key: "atarist", label: "Atari ST", color: "#A0522D", icon: "🎮" },
  60:  { key: "atari7800", label: "Atari 7800", color: "#A0522D", icon: "🎮" },
  62:  { key: "jaguar", label: "Atari Jaguar", color: "#A0522D", icon: "🎮" },
  61:  { key: "lynx", label: "Atari Lynx", color: "#A0522D", icon: "🎮" },

  // PC variants
  13:  { key: "dos", label: "DOS", color: "#171717", icon: "💻" },
  15:  { key: "c64", label: "Commodore 64", color: "#A0522D", icon: "💻" },
  16:  { key: "amiga", label: "Amiga", color: "#FF4500", icon: "💻" },

  // Arcade
  52:  { key: "arcade", label: "Arcade", color: "#FFD700", icon: "🕹️" },
};

async function main() {
  console.log("🎮 Fetching Game Platform Data from IGDB\n");

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Get IGDB token
  const tokenData = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  ).then((r) => r.json());
  const token = tokenData.access_token;

  const games = await prisma.item.findMany({
    where: { type: "game" },
    select: { id: true, title: true, platforms: true },
  });
  console.log(`${games.length} games to process\n`);

  let updated = 0;
  let notFound = 0;

  // Process in batches
  for (let i = 0; i < games.length; i += 10) {
    const batch = games.slice(i, i + 10);
    const titles = batch.map((g) => `"${g.title.replace(/"/g, '\\"')}"`).join(",");

    try {
      const res = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": IGDB_ID,
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: `fields name,platforms.id,platforms.name; where name = (${titles}); limit 10;`,
      });
      const results = await res.json();
      await sleep(300);

      for (const game of batch) {
        const match = (Array.isArray(results) ? results : []).find(
          (r: any) => r.name?.toLowerCase() === game.title.toLowerCase()
        );

        if (match && match.platforms && match.platforms.length > 0) {
          const platformData = match.platforms
            .map((p: any) => {
              const mapped = PLATFORM_MAP[p.id];
              if (mapped) return mapped;
              // Fallback — use IGDB's own name
              return { key: `igdb-${p.id}`, label: p.name || `Platform ${p.id}`, color: "#555", icon: "🎮" };
            })
            .filter(Boolean);

          // Sort: current gen first, then by generation
          const genOrder: Record<string, number> = {
            pc: 0, ps5: 1, xsx: 2, switch: 3, switch2: 3,
            ps4: 4, xone: 5, ps3: 6, x360: 7, wiiu: 8, wii: 9,
            ps2: 10, xbox: 11, gc: 12, dc: 13, n64: 14, saturn: 15,
            ps1: 16, snes: 17, genesis: 18, nes: 19,
            mac: 20, linux: 21, ios: 22, android: 23, browser: 24,
            vita: 25, psp: 26, "3ds": 27, ds: 28, gba: 29, gbc: 30, gb: 31,
            arcade: 32, dos: 33,
          };

          platformData.sort((a: any, b: any) => {
            const aOrder = genOrder[a.key] ?? 50;
            const bOrder = genOrder[b.key] ?? 50;
            return aOrder - bOrder;
          });

          await prisma.item.update({
            where: { id: game.id },
            data: { platforms: platformData },
          });
          updated++;
        } else {
          notFound++;
        }
      }
    } catch (e: any) {
      // Skip batch errors
    }

    if (i % 50 === 0 && i > 0) {
      console.log(`  Processed ${i}/${games.length} (${updated} updated, ${notFound} not found)...`);
    }
  }

  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`📊 Platform Data Summary`);
  console.log(`════════════════════════════════════════════════════════`);
  console.log(`  Total games: ${games.length}`);
  console.log(`  Updated:     ${updated}`);
  console.log(`  Not found:   ${notFound}`);
  console.log(`════════════════════════════════════════════════════════\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
