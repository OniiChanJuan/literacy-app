/**
 * Populate platform links for all items that don't have them yet.
 * Generates URLs based on item metadata (spotifyId, googleBooksId, title, etc.)
 * Run: npx tsx prisma/populate-platform-links.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DB_URL = "postgresql://postgres:Baylorlawsucks2021@db.shlyuoeabdaifketvaeo.supabase.co:5432/postgres";
const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

function searchQuery(title: string): string {
  return encodeURIComponent(title);
}

interface ItemRow {
  id: number;
  title: string;
  type: string;
  platforms: any;
  spotifyId: string | null;
  googleBooksId: string | null;
  tmdbId: number | null;
  igdbId: number | null;
  malId: number | null;
  comicVineId: number | null;
}

/**
 * Build URL for a given platform + item metadata
 */
function buildUrl(platform: string, item: ItemRow): string | null {
  const q = searchQuery(item.title);

  switch (platform) {
    // Video streaming
    case "netflix":    return `https://www.netflix.com/search?q=${q}`;
    case "prime":      return `https://www.amazon.com/s?k=${q}&i=instant-video`;
    case "hbo":        return `https://play.max.com/search?q=${q}`;
    case "hulu":       return `https://www.hulu.com/search?q=${q}`;
    case "apple":      return `https://tv.apple.com/search?term=${q}`;
    case "disney":     return `https://www.disneyplus.com/search/${q}`;
    case "theaters":   return `https://www.fandango.com/search?q=${q}`;

    // Books
    case "kindle":     return `https://www.amazon.com/s?k=${q}&i=digital-text`;
    case "audible":    return `https://www.audible.com/search?keywords=${q}`;
    case "library":    return `https://www.worldcat.org/search?q=${q}`;
    case "google_books":
      return item.googleBooksId
        ? `https://books.google.com/books?id=${item.googleBooksId}`
        : `https://books.google.com/books?q=${q}`;

    // Gaming
    case "steam":      return `https://store.steampowered.com/search/?term=${q}`;
    case "ps5": case "ps4": case "ps":
      return `https://store.playstation.com/search/${q}`;
    case "xsx": case "xone": case "xbox":
      return `https://www.xbox.com/games/store/search/${q}`;
    case "switch": case "switch2":
      return `https://www.nintendo.com/us/search/#q=${q}&cat=games`;

    // Music
    case "spotify":
      return item.spotifyId
        ? `https://open.spotify.com/album/${item.spotifyId}`
        : `https://open.spotify.com/search/${q}`;
    case "apple_music": return `https://music.apple.com/search?term=${q}`;

    // Podcasts
    case "apple_pod":  return `https://podcasts.apple.com/search?term=${q}`;

    // Comics/Manga
    case "mangaplus":  return `https://mangaplus.shueisha.co.jp/search_result?keyword=${q}`;
    case "viz":        return `https://www.viz.com/search?search=${q}`;
    case "comixology": return `https://www.amazon.com/s?k=${q}&i=comics-702702`;

    default: return null;
  }
}

async function main() {
  // Fetch all items that have platforms but no platform_links
  const items = await prisma.$queryRaw<ItemRow[]>`
    SELECT id, title, type, platforms, spotify_id as "spotifyId",
           google_books_id as "googleBooksId", tmdb_id as "tmdbId",
           igdb_id as "igdbId", mal_id as "malId", comic_vine_id as "comicVineId"
    FROM items
    WHERE platform_links IS NULL
    AND platforms IS NOT NULL
  `;

  console.log(`Populating platform links for ${items.length} items...`);
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const platforms: any[] = Array.isArray(item.platforms) ? item.platforms : [];
    if (platforms.length === 0) {
      skipped++;
      continue;
    }

    const links: Record<string, string> = {};

    for (const p of platforms) {
      const key = typeof p === "string" ? p : p?.key || "";
      if (!key) continue;

      const url = buildUrl(key, item);
      if (url) {
        links[key] = url;
      }
    }

    if (Object.keys(links).length > 0) {
      await prisma.item.update({
        where: { id: item.id },
        data: { platformLinks: links },
      });
      updated++;
    } else {
      skipped++;
    }

    if ((updated + skipped) % 200 === 0) {
      console.log(`  ${updated + skipped}/${items.length} (${updated} updated, ${skipped} skipped)`);
    }
  }

  // Stats
  const total = await prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int as c FROM items WHERE platform_links IS NOT NULL`;
  console.log(`\nDone! ${updated} items updated, ${skipped} skipped`);
  console.log(`Total items with platform links: ${total[0].c}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
