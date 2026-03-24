/**
 * Franchise Detection v3 — Smart fuzzy matching
 *
 * The key insight: most franchises share a common root title.
 * "Scream", "Scream 2", "Scream 7" all contain "Scream".
 * "The Legend of Zelda: Breath of the Wild" contains "Zelda".
 * "Attack on Titan: Final Season" contains "Attack on Titan".
 *
 * Method:
 * 1. Build a comprehensive list of known franchise names
 * 2. For every item, check if its title contains any franchise name
 * 3. Group items by the franchise name they match
 * 4. Create franchises for groups with 2+ items
 *
 * Run: npx tsx scripts/detect-franchises-v3.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DbItem {
  id: number;
  title: string;
  type: string;
  year: number;
  cover: string;
  genre: string[];
}

// ── COMPREHENSIVE FRANCHISE LIST ────────────────────────────────────────
// Each entry: { name, icon, keywords (title substrings to match) }
// Keywords are checked as case-insensitive substrings of item titles.
// More specific keywords first to avoid false matches.

const FRANCHISE_DEFS: { name: string; icon: string; keywords: string[] }[] = [
  // ── MOVIES ──
  { name: "Star Wars", icon: "⭐", keywords: ["star wars", "rogue one", "andor", "mandalorian", "ahsoka", "obi-wan kenobi", "book of boba fett", "a new hope", "empire strikes back", "return of the jedi", "phantom menace", "attack of the clones", "revenge of the sith", "force awakens", "last jedi", "rise of skywalker", "solo: a star wars"] },
  { name: "Marvel Cinematic Universe", icon: "🦸", keywords: ["avengers", "iron man", "captain america", "thor: ", "spider-man: no way home", "spider-man: homecoming", "spider-man: far from home", "spider-man: brand new day", "black panther", "doctor strange", "guardians of the galaxy", "ant-man", "black widow", "eternals", "shang-chi", "doomsday", "secret wars", "thunderbolts"] },
  { name: "Spider-Verse", icon: "🕷️", keywords: ["spider-verse", "into the spider-verse", "across the spider-verse", "beyond the spider-verse"] },
  { name: "DC Universe", icon: "🦇", keywords: ["batman", "superman", "wonder woman", "justice league", "aquaman", "the flash", "joker", "the batman", "dark knight", "man of steel", "suicide squad"] },
  { name: "Lord of the Rings", icon: "💍", keywords: ["lord of the rings", "the hobbit", "rings of power", "fellowship of the ring", "two towers", "return of the king"] },
  { name: "Harry Potter", icon: "⚡", keywords: ["harry potter", "fantastic beasts", "hogwarts legacy", "wizarding world"] },
  { name: "James Bond", icon: "🔫", keywords: ["james bond", "007", "no time to die", "skyfall", "spectre", "casino royale", "quantum of solace"] },
  { name: "Mission: Impossible", icon: "💣", keywords: ["mission: impossible", "mission impossible"] },
  { name: "Fast & Furious", icon: "🏎️", keywords: ["fast & furious", "fast and furious", "furious 7", "the fate of the furious", "f9", "fast x"] },
  { name: "John Wick", icon: "🔫", keywords: ["john wick"] },
  { name: "The Matrix", icon: "💊", keywords: ["the matrix", "matrix reloaded", "matrix revolutions", "matrix resurrections"] },
  { name: "Alien", icon: "👽", keywords: ["alien:", "aliens", "alien vs", "alien romulus", "alien covenant", "prometheus"] },
  { name: "Jurassic Park", icon: "🦕", keywords: ["jurassic park", "jurassic world"] },
  { name: "Indiana Jones", icon: "🤠", keywords: ["indiana jones", "raiders of the lost ark"] },
  { name: "Toy Story", icon: "🤠", keywords: ["toy story"] },
  { name: "Shrek", icon: "🟢", keywords: ["shrek"] },
  { name: "Pirates of the Caribbean", icon: "🏴‍☠️", keywords: ["pirates of the caribbean"] },
  { name: "Scream", icon: "😱", keywords: ["scream ", "scream:", "scream 2", "scream 3", "scream 4", "scream 5", "scream 6", "scream 7", "scream vi"] },
  { name: "Saw", icon: "🧩", keywords: ["saw x", "saw ii", "saw iii", "saw iv", "saw v", "saw vi", "saw 3d", "jigsaw"] },
  { name: "Halloween", icon: "🎃", keywords: ["halloween"] },
  { name: "The Conjuring", icon: "👻", keywords: ["conjuring", "annabelle", "the nun"] },
  { name: "Transformers", icon: "🤖", keywords: ["transformers"] },
  { name: "Planet of the Apes", icon: "🦍", keywords: ["planet of the apes"] },
  { name: "Dune", icon: "🏜️", keywords: ["dune"] },
  { name: "Blade Runner", icon: "🌃", keywords: ["blade runner", "do androids dream"] },
  { name: "Back to the Future", icon: "⚡", keywords: ["back to the future"] },
  { name: "Ghostbusters", icon: "👻", keywords: ["ghostbusters"] },
  { name: "Rocky / Creed", icon: "🥊", keywords: ["rocky", "creed"] },
  { name: "The Godfather", icon: "🌹", keywords: ["the godfather"] },
  { name: "Godzilla / MonsterVerse", icon: "🦎", keywords: ["godzilla", "kong:", "monsterverse"] },
  { name: "Avatar", icon: "🌿", keywords: ["avatar: the way of water", "avatar: fire and ash"] },
  { name: "Pixar", icon: "🎬", keywords: ["finding nemo", "finding dory", "monsters inc", "monsters university", "the incredibles", "inside out 2", "wall-e", "ratatouille"] },
  { name: "Studio Ghibli", icon: "🏯", keywords: ["howl's moving castle", "princess mononoke", "spirited away", "my neighbor totoro", "kiki's delivery", "nausicaä", "castle in the sky", "ponyo", "the wind rises", "porco rosso", "grave of the fireflies"] },
  { name: "Nolan Films", icon: "🎬", keywords: ["interstellar", "inception", "tenet", "dunkirk", "oppenheimer", "the dark knight", "memento", "the prestige"] },

  // ── TV SHOWS ──
  { name: "Breaking Bad Universe", icon: "🧪", keywords: ["breaking bad", "better call saul", "el camino"] },
  { name: "Game of Thrones", icon: "👑", keywords: ["game of thrones", "house of the dragon", "a song of ice and fire", "a game of thrones", "a clash of kings", "a storm of swords", "a feast for crows", "a dance with dragons"] },
  { name: "The Walking Dead", icon: "🧟", keywords: ["walking dead"] },
  { name: "Stranger Things", icon: "🔮", keywords: ["stranger things"] },
  { name: "The Office", icon: "📎", keywords: ["the office"] },
  { name: "The Witcher", icon: "⚔️", keywords: ["witcher"] },
  { name: "Cyberpunk", icon: "🌆", keywords: ["cyberpunk 2077", "cyberpunk: edgerunners", "cyberpunk edgerunners"] },
  { name: "Arcane / League of Legends", icon: "⚔️", keywords: ["arcane", "league of legends"] },
  { name: "The Last of Us", icon: "🍄", keywords: ["the last of us", "last of us"] },
  { name: "Halo", icon: "🎮", keywords: ["halo :", "halo infinite", "halo reach", "halo 2", "halo 3", "halo 4", "halo 5", "halo wars", "halo combat evolved"] },
  { name: "Cowboy Bebop", icon: "🚀", keywords: ["cowboy bebop"] },
  { name: "Ghost in the Shell", icon: "🤖", keywords: ["ghost in the shell"] },

  // ── ANIME / MANGA ──
  { name: "Dragon Ball", icon: "🐉", keywords: ["dragon ball"] },
  { name: "Naruto", icon: "🍥", keywords: ["naruto", "boruto"] },
  { name: "One Piece", icon: "🏴‍☠️", keywords: ["one piece"] },
  { name: "Attack on Titan", icon: "⚔️", keywords: ["attack on titan", "shingeki no kyojin"] },
  { name: "My Hero Academia", icon: "💪", keywords: ["my hero academia", "boku no hero"] },
  { name: "Demon Slayer", icon: "🗡️", keywords: ["demon slayer", "kimetsu no yaiba"] },
  { name: "Jujutsu Kaisen", icon: "👁️", keywords: ["jujutsu kaisen"] },
  { name: "Fullmetal Alchemist", icon: "⚗️", keywords: ["fullmetal alchemist"] },
  { name: "Death Note", icon: "📓", keywords: ["death note"] },
  { name: "Hunter x Hunter", icon: "🎯", keywords: ["hunter x hunter", "hunter × hunter"] },
  { name: "Neon Genesis Evangelion", icon: "🤖", keywords: ["evangelion", "neon genesis"] },
  { name: "Chainsaw Man", icon: "🔪", keywords: ["chainsaw man"] },
  { name: "Spy × Family", icon: "🕵️", keywords: ["spy x family", "spy×family", "spy × family"] },
  { name: "Berserk", icon: "⚔️", keywords: ["berserk"] },
  { name: "Bleach", icon: "⚔️", keywords: ["bleach"] },
  { name: "Vinland Saga", icon: "⚔️", keywords: ["vinland saga"] },
  { name: "Tokyo Ghoul", icon: "👁️", keywords: ["tokyo ghoul"] },
  { name: "Sword Art Online", icon: "⚔️", keywords: ["sword art online"] },
  { name: "JoJo's Bizarre Adventure", icon: "💪", keywords: ["jojo's bizarre", "jojo no kimyou", "steel ball run", "stone ocean", "golden wind", "stardust crusaders", "diamond is unbreakable"] },
  { name: "Slam Dunk", icon: "🏀", keywords: ["slam dunk"] },
  { name: "Haikyu!!", icon: "🏐", keywords: ["haikyu"] },
  { name: "Violet Evergarden", icon: "💜", keywords: ["violet evergarden"] },
  { name: "Kaguya-sama", icon: "💕", keywords: ["kaguya-sama", "kaguya sama"] },
  { name: "Frieren", icon: "🧙‍♀️", keywords: ["frieren"] },
  { name: "Monogatari", icon: "📖", keywords: ["monogatari"] },
  { name: "A Silent Voice", icon: "🤟", keywords: ["a silent voice", "koe no katachi"] },
  { name: "Mushoku Tensei", icon: "📖", keywords: ["mushoku tensei"] },
  { name: "Re:Zero", icon: "🔄", keywords: ["re:zero"] },
  { name: "Steins;Gate", icon: "⏰", keywords: ["steins;gate", "steins gate"] },
  { name: "Code Geass", icon: "👁️", keywords: ["code geass"] },
  { name: "Mob Psycho 100", icon: "💯", keywords: ["mob psycho"] },
  { name: "One Punch Man", icon: "👊", keywords: ["one punch man"] },
  { name: "Black Clover", icon: "🍀", keywords: ["black clover"] },
  { name: "The Apothecary Diaries", icon: "💊", keywords: ["apothecary diaries"] },
  { name: "Toilet-Bound Hanako-kun", icon: "👻", keywords: ["hanako-kun", "toilet-bound"] },
  { name: "Gachiakuta", icon: "🗑️", keywords: ["gachiakuta"] },
  // Monster removed — too generic, matches Monarch, Monster Musume, etc.
  { name: "Rascal Does Not Dream", icon: "🐰", keywords: ["rascal does not dream"] },

  // ── GAMES ──
  { name: "The Legend of Zelda", icon: "🗡️", keywords: ["zelda", "the legend of zelda"] },
  { name: "Pokémon", icon: "⚡", keywords: ["pokémon", "pokemon"] },
  { name: "Final Fantasy", icon: "⚔️", keywords: ["final fantasy"] },
  { name: "Persona", icon: "🎭", keywords: ["persona "] },
  { name: "Super Mario", icon: "🍄", keywords: ["super mario", "mario bros", "mario kart", "mario party", "yoshi's island", "mario galaxy", "mario world", "mario odyssey"] },
  { name: "Grand Theft Auto", icon: "🚗", keywords: ["grand theft auto", "gta "] },
  { name: "Call of Duty", icon: "🎖️", keywords: ["call of duty"] },
  { name: "Resident Evil", icon: "🧟", keywords: ["resident evil"] },
  { name: "Dark Souls / Elden Ring", icon: "⚔️", keywords: ["dark souls", "elden ring", "demon's souls", "bloodborne", "sekiro", "armored core"] },
  { name: "Metal Gear", icon: "🐍", keywords: ["metal gear"] },
  { name: "Mass Effect", icon: "🚀", keywords: ["mass effect"] },
  { name: "Assassin's Creed", icon: "🗡️", keywords: ["assassin's creed"] },
  { name: "God of War", icon: "⚡", keywords: ["god of war"] },
  { name: "Uncharted", icon: "🗺️", keywords: ["uncharted"] },
  { name: "Tomb Raider", icon: "🏺", keywords: ["tomb raider", "lara croft"] },
  { name: "Fallout", icon: "☢️", keywords: ["fallout"] },
  { name: "Elder Scrolls", icon: "📜", keywords: ["elder scrolls", "skyrim", "oblivion", "morrowind"] },
  { name: "BioShock", icon: "💉", keywords: ["bioshock"] },
  { name: "Civilization", icon: "🏛️", keywords: ["civilization", "sid meier"] },
  { name: "Portal", icon: "🔵", keywords: ["portal :", "portal 2"] },
  { name: "Half-Life", icon: "λ", keywords: ["half-life", "half life"] },
  { name: "Doom", icon: "👹", keywords: ["doom :", "doom eternal"] },
  { name: "Warcraft", icon: "⚔️", keywords: ["warcraft", "world of warcraft"] },
  { name: "Diablo", icon: "🔥", keywords: ["diablo"] },
  { name: "Metroid", icon: "🛡️", keywords: ["metroid"] },
  { name: "Mega Man", icon: "🤖", keywords: ["mega man", "megaman"] },
  { name: "Sonic", icon: "🦔", keywords: ["sonic the hedgehog", "sonic mania", "sonic frontiers", "sonic generations"] },
  { name: "Fire Emblem", icon: "🔥", keywords: ["fire emblem"] },
  { name: "Kingdom Hearts", icon: "🗝️", keywords: ["kingdom hearts"] },
  { name: "Monster Hunter", icon: "🐲", keywords: ["monster hunter"] },
  { name: "Street Fighter", icon: "👊", keywords: ["street fighter"] },
  { name: "Tekken", icon: "👊", keywords: ["tekken"] },
  { name: "Mortal Kombat", icon: "🐉", keywords: ["mortal kombat"] },

  // ── BOOKS ──
  { name: "Stephen King", icon: "📕", keywords: ["stephen king"] },
  { name: "Hitchhiker's Guide", icon: "🌌", keywords: ["hitchhiker's guide"] },
  { name: "Discworld", icon: "🐢", keywords: ["discworld"] },
  { name: "Foundation", icon: "🌌", keywords: ["foundation"] },

  // ── COMICS ──
  { name: "X-Men", icon: "🧬", keywords: ["x-men", "wolverine", "deadpool"] },
  { name: "Spawn", icon: "😈", keywords: ["spawn"] },
  { name: "The Boys", icon: "🩸", keywords: ["the boys"] },
  { name: "Invincible", icon: "💪", keywords: ["invincible"] },
];

async function main() {
  console.log("🔍 Franchise Detection v3 — Smart Fuzzy Matching\n");

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Clear old franchise data
  await prisma.franchiseItem.deleteMany({});
  await prisma.franchise.deleteMany({});
  console.log("🗑  Cleared old franchise data\n");

  const items = await prisma.item.findMany({
    select: { id: true, title: true, type: true, year: true, cover: true, genre: true },
  });
  console.log(`📊 ${items.length} items loaded\n`);

  const alreadyLinked = new Set<number>();
  let totalFranchises = 0;
  let totalLinked = 0;

  // Process each franchise definition
  for (const def of FRANCHISE_DEFS) {
    const matchedItems: DbItem[] = [];

    for (const item of items) {
      if (alreadyLinked.has(item.id)) continue;
      const titleLower = item.title.toLowerCase();

      for (const keyword of def.keywords) {
        if (titleLower.includes(keyword.toLowerCase())) {
          matchedItems.push(item);
          break;
        }
      }
    }

    if (matchedItems.length < 2) continue;

    // Deduplicate by ID
    const uniqueIds = [...new Set(matchedItems.map((i) => i.id))];
    if (uniqueIds.length < 2) continue;

    try {
      const f = await prisma.franchise.create({
        data: {
          name: def.name,
          icon: def.icon,
          description: `${uniqueIds.length} items across ${new Set(matchedItems.map((i) => i.type)).size} media types`,
          cover: matchedItems[0]?.cover || "",
          autoGenerated: true,
          confidenceTier: 1,
          items: {
            create: uniqueIds.map((id) => ({ itemId: id, addedBy: "smart_match" })),
          },
        },
      });

      uniqueIds.forEach((id) => alreadyLinked.add(id));
      totalFranchises++;
      totalLinked += uniqueIds.length;

      const types = [...new Set(matchedItems.map((i) => i.type))].join(", ");
      const titles = matchedItems.slice(0, 4).map((i) => i.title).join(", ");
      console.log(`  ✓ ${def.icon} ${def.name} — ${uniqueIds.length} items (${types}): ${titles}${uniqueIds.length > 4 ? "..." : ""}`);
    } catch (e: any) {
      console.warn(`  ⚠ Failed "${def.name}": ${e.message?.slice(0, 80)}`);
    }
  }

  // ── SECOND PASS: catch remaining exact title matches across types ────
  console.log("\n── Second pass: remaining cross-type exact title matches ──\n");

  function normalizeTitle(title: string): string {
    return title.toLowerCase()
      .replace(/[:–—]\s.*$/, "")
      .replace(/\s*\(.*?\)\s*/g, "")
      .replace(/\s*(season|part|vol|volume)\s*\d+.*$/i, "")
      .replace(/\s*\d+$/, "")  // trailing numbers
      .trim();
  }

  const titleGroups = new Map<string, DbItem[]>();
  for (const item of items) {
    if (alreadyLinked.has(item.id)) continue;
    const norm = normalizeTitle(item.title);
    if (norm.length < 3) continue; // Skip very short titles
    if (!titleGroups.has(norm)) titleGroups.set(norm, []);
    titleGroups.get(norm)!.push(item);
  }

  for (const [normTitle, group] of titleGroups) {
    if (group.length < 2) continue;
    const types = new Set(group.map((i) => i.type));
    if (types.size < 2) continue; // Must span multiple media types

    const uniqueIds = [...new Set(group.map((i) => i.id))];
    try {
      const f = await prisma.franchise.create({
        data: {
          name: group[0].title.replace(/[:–—]\s.*$/, "").replace(/\s*\(.*?\)\s*/g, "").trim(),
          icon: "🔗",
          description: `Cross-media: ${uniqueIds.length} items across ${types.size} media types`,
          cover: group[0]?.cover || "",
          autoGenerated: true,
          confidenceTier: 2,
          items: {
            create: uniqueIds.map((id) => ({ itemId: id, addedBy: "exact_title" })),
          },
        },
      });
      uniqueIds.forEach((id) => alreadyLinked.add(id));
      totalFranchises++;
      totalLinked += uniqueIds.length;
      const itemDescs = group.map((i) => `${i.title} (${i.type})`).join(", ");
      console.log(`  ✓ 🔗 ${normTitle} — ${uniqueIds.length} items: ${itemDescs}`);
    } catch {}
  }

  // ── THIRD PASS: group same-type items with same base title ──────────
  console.log("\n── Third pass: same-type sequel/series grouping ──\n");

  const seriesGroups = new Map<string, DbItem[]>();
  for (const item of items) {
    if (alreadyLinked.has(item.id)) continue;
    const norm = normalizeTitle(item.title);
    if (norm.length < 3) continue;
    const key = `${norm}|${item.type}`;
    if (!seriesGroups.has(key)) seriesGroups.set(key, []);
    seriesGroups.get(key)!.push(item);
  }

  for (const [key, group] of seriesGroups) {
    if (group.length < 2) continue;
    const norm = key.split("|")[0];
    const uniqueIds = [...new Set(group.map((i) => i.id))];

    try {
      const f = await prisma.franchise.create({
        data: {
          name: group[0].title.replace(/[:–—]\s.*$/, "").replace(/\s*\(.*?\)\s*/g, "").replace(/\s*\d+$/, "").trim(),
          icon: "📚",
          description: `Series: ${uniqueIds.length} items`,
          cover: group[0]?.cover || "",
          autoGenerated: true,
          confidenceTier: 2,
          items: {
            create: uniqueIds.map((id) => ({ itemId: id, addedBy: "series_group" })),
          },
        },
      });
      uniqueIds.forEach((id) => alreadyLinked.add(id));
      totalFranchises++;
      totalLinked += uniqueIds.length;
      console.log(`  ✓ 📚 ${norm} — ${uniqueIds.length} ${group[0].type} items`);
    } catch {}
  }

  // ══════════════════════════════════════════════════════════════════════
  console.log("\n════════════════════════════════════════════════════════");
  console.log("📊 FRANCHISE DETECTION v3 SUMMARY");
  console.log("════════════════════════════════════════════════════════\n");
  console.log(`  Total franchises:   ${totalFranchises}`);
  console.log(`  Total items linked: ${totalLinked}`);
  console.log(`  Items NOT linked:   ${items.length - alreadyLinked.size} (standalone items)`);
  console.log(`  Link rate:          ${((totalLinked / items.length) * 100).toFixed(1)}%`);
  console.log(`════════════════════════════════════════════════════════\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Detection failed:", e);
  process.exit(1);
});
