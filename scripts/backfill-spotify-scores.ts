/**
 * Backfill spotify_popularity into ext JSON for music and podcast items
 * by searching Spotify by title + artist name.
 *
 * Skips "Various Artists" compilations and items already scored.
 *
 * Run: npx tsx scripts/backfill-spotify-scores.ts
 * Options:
 *   --dry-run    Print what would change without writing
 *   --type=music|podcast  Only process one type (default: both)
 *   --limit=N    Process only N items
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const typeArg = args.find((a) => a.startsWith("--type="))?.split("=")[1];
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;
const DELAY_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let spotifyToken: string | null = null;
let tokenExpiry = 0;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < tokenExpiry - 60_000) return spotifyToken;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${process.env.SPOTIFY_CLIENT_ID}&client_secret=${process.env.SPOTIFY_CLIENT_SECRET}`,
  });
  const data = await res.json();
  spotifyToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return spotifyToken!;
}

async function searchSpotify(
  title: string,
  artist: string,
  itemType: "music" | "podcast"
): Promise<{ popularity: number; spotifyId: string } | null> {
  const token = await getSpotifyToken();
  const searchType = itemType === "podcast" ? "show" : "album";

  // Build query: title + artist (if not Various Artists)
  const artistPart =
    artist && artist !== "Various Artists" ? ` artist:${artist}` : "";
  const query = encodeURIComponent(`album:"${title}"${artistPart}`);
  const showQuery = encodeURIComponent(`"${title}"`);

  const url =
    itemType === "podcast"
      ? `https://api.spotify.com/v1/search?q=${showQuery}&type=show&limit=5&market=US`
      : `https://api.spotify.com/v1/search?q=${query}&type=album&limit=5&market=US`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();

    if (itemType === "podcast") {
      const shows = data.shows?.items || [];
      if (shows.length === 0) return null;
      const match = shows.find(
        (s: any) => s.name.toLowerCase() === title.toLowerCase()
      ) || shows[0];
      return { popularity: match.total_episodes || 0, spotifyId: match.id };
    }

    const albums = data.albums?.items || [];
    if (albums.length === 0) {
      // Fallback: broader search without quote-matching
      const fallbackQ = encodeURIComponent(
        `${title}${artistPart || (artist && artist !== "Various Artists" ? ` ${artist}` : "")}`
      );
      const r2 = await fetch(
        `https://api.spotify.com/v1/search?q=${fallbackQ}&type=album&limit=5&market=US`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r2.ok) return null;
      const d2 = await r2.json();
      const a2 = d2.albums?.items || [];
      if (a2.length === 0) return null;
      // Get full album to fetch popularity
      return await fetchAlbumPopularity(a2[0].id, token);
    }

    return await fetchAlbumPopularity(albums[0].id, token);
  } catch {
    return null;
  }
}

async function fetchAlbumPopularity(
  albumId: string,
  token: string
): Promise<{ popularity: number; spotifyId: string } | null> {
  await sleep(DELAY_MS);
  try {
    const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { popularity: data.popularity ?? 0, spotifyId: albumId };
  } catch {
    return null;
  }
}

async function main() {
  console.log(`🎵 Spotify score backfill${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  const types = typeArg
    ? [typeArg as "music" | "podcast"]
    : (["music", "podcast"] as const);

  for (const type of types) {
    const allItems = await prisma.item.findMany({
      where: { type },
      select: { id: true, title: true, people: true, ext: true },
      orderBy: { voteCount: "desc" },
    });

    // Filter: skip already-scored, skip compilations with generic titles
    const items = allItems
      .filter((item) => {
        const ext = (item.ext || {}) as Record<string, any>;
        if (ext.spotify_popularity !== undefined) return false; // already scored
        const artist =
          (item.people as any[])?.[0]?.name || "Various Artists";
        // Skip pure compilations with no specific artist
        if (
          artist === "Various Artists" &&
          (item.title.toLowerCase().includes("top") ||
            item.title.toLowerCase().includes("hits") ||
            item.title.toLowerCase().includes("best of") ||
            item.title.toLowerCase().includes("essentials") ||
            item.title.toLowerCase().includes("classic") ||
            item.title.toLowerCase().includes("vol.") ||
            item.title.toLowerCase().includes("mixtape"))
        ) {
          return false;
        }
        return true;
      })
      .slice(0, LIMIT < Infinity ? LIMIT : undefined);

    console.log(
      `\n${type.toUpperCase()}: ${allItems.length} total, ${items.length} to process\n`
    );

    const stats = { updated: 0, notFound: 0, skipped: 0 };

    for (const item of items) {
      const artist =
        (item.people as any[])?.[0]?.name || "Various Artists";
      const result = await searchSpotify(item.title, artist, type);
      await sleep(DELAY_MS);

      if (!result || result.popularity === 0) {
        console.log(`  — [${item.id}] "${item.title.slice(0, 40)}" — not found`);
        stats.notFound++;
        continue;
      }

      const ext = (item.ext || {}) as Record<string, any>;
      const newExt = { ...ext, spotify_popularity: result.popularity };

      console.log(
        `  ✓ [${item.id}] "${item.title.slice(0, 40)}" — popularity: ${result.popularity}`
      );

      if (!DRY_RUN) {
        await prisma.item.update({
          where: { id: item.id },
          data: { ext: newExt as any },
        });
      }
      stats.updated++;
    }

    console.log(
      `\n${type}: Updated: ${stats.updated} | Not found: ${stats.notFound}`
    );
  }

  console.log(`\n✅ Done`);
  await prisma.$disconnect();
}

main().catch(console.error);
