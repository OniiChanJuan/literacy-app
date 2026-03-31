import type { Item, MediaType } from "@/lib/data";
import WatchProviders from "./watch-providers";
import PlatformButtons from "./platform-buttons";

interface WhereToProps {
  item: Item;
}

/**
 * Determines and renders the appropriate "Where to watch/read/play/listen"
 * section based on media type.
 *
 * - movie / tv  → WatchProviders (live TMDB data via JustWatch)
 * - game        → PlatformButtons with stored IGDB platform keys
 * - all others  → PlatformButtons with type-specific default platform keys
 */
export default function WhereTo({ item }: WhereToProps) {
  const { type, title, year, platforms, people, genre } = item;

  // ── Movie / TV: live streaming data from TMDB ─────────────────────
  if (type === "movie" || type === "tv") {
    return (
      <WatchProviders
        title={title}
        year={year}
        mediaType={type}
        tmdbId={item.tmdbId}
        itemId={item.id}
      />
    );
  }

  // ── Games: use stored platform keys from IGDB (accurate per-game) ─
  if (type === "game") {
    if (!platforms || platforms.length === 0) return null;
    return (
      <PlatformButtons
        platforms={platforms}
        mediaType={type}
        itemId={item.id}
        showAffiliate={false}
      />
    );
  }

  // ── Books ─────────────────────────────────────────────────────────
  if (type === "book") {
    const bookPlatforms = ["kindle", "bookshop", "google_books", "library", "audible", "apple_books"];
    return (
      <PlatformButtons
        platforms={bookPlatforms}
        mediaType={type}
        itemId={item.id}
        showAffiliate={false}
      />
    );
  }

  // ── Manga ─────────────────────────────────────────────────────────
  if (type === "manga") {
    const mangaPlatforms = ["mangaplus", "viz", "comixology", "amazon_manga", "bookshop", "library"];
    return (
      <PlatformButtons
        platforms={mangaPlatforms}
        mediaType={type}
        itemId={item.id}
        showAffiliate={false}
      />
    );
  }

  // ── Comics ────────────────────────────────────────────────────────
  if (type === "comic") {
    // Detect publisher from people array
    const publisher = detectPublisher(people as any[]);
    let comicPlatforms: string[];
    if (publisher === "marvel") {
      comicPlatforms = ["marvel_unlimited", "comixology", "amazon_books", "bookshop"];
    } else if (publisher === "dc") {
      comicPlatforms = ["dc_unlimited", "comixology", "amazon_books", "bookshop"];
    } else {
      comicPlatforms = ["comixology", "amazon_books", "bookshop"];
    }
    return (
      <PlatformButtons
        platforms={comicPlatforms}
        mediaType={type}
        itemId={item.id}
        showAffiliate={false}
      />
    );
  }

  // ── Music ─────────────────────────────────────────────────────────
  if (type === "music") {
    const musicPlatforms = ["spotify", "apple_music", "youtube_music", "tidal", "amazon_music", "bandcamp"];
    return (
      <PlatformButtons
        platforms={musicPlatforms}
        mediaType={type}
        itemId={item.id}
        showAffiliate={false}
      />
    );
  }

  // ── Podcasts ──────────────────────────────────────────────────────
  if (type === "podcast") {
    const podcastPlatforms = ["spotify", "apple_pod", "youtube_pod", "pocket_casts", "overcast"];
    return (
      <PlatformButtons
        platforms={podcastPlatforms}
        mediaType={type}
        itemId={item.id}
        showAffiliate={false}
      />
    );
  }

  return null;
}

/** Detect Marvel or DC publisher from item's people array. */
function detectPublisher(people: Array<{ name: string; role: string }> | null): "marvel" | "dc" | null {
  if (!people) return null;
  for (const person of people) {
    const name = (person.name || "").toLowerCase();
    const role = (person.role || "").toLowerCase();
    if (role.includes("publisher")) {
      if (name.includes("marvel")) return "marvel";
      if (name.includes("dc comics") || name === "dc") return "dc";
    }
  }
  return null;
}
