import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ALL_ITEMS, TYPES, VIBES, isUpcoming, type Item, type MediaType, type Person } from "@/lib/data";
import { ExpandableText } from "@/components/expandable-text";
import { prisma } from "@/lib/prisma";
import { parseTmdbId, getTmdbDetails } from "@/lib/tmdb";
import { parseIgdbId, getIgdbDetails } from "@/lib/igdb";
import { parseGbookId, getGoogleBookDetails } from "@/lib/google-books";
import { parseSpotifyId, getSpotifyAlbumDetails, getSpotifyShowDetails } from "@/lib/spotify";
import { parseJikanId, getJikanMangaDetails, getJikanAnimeDetails } from "@/lib/jikan";
import { parseCvId, getComicVineDetails } from "@/lib/comicvine";
import { lookupUpcomingItem } from "@/lib/upcoming";
import BackButton from "@/components/back-button";
import RatingPanel from "@/components/rating-panel";
import { AggregateScorePanel } from "@/components/aggregate-score";
import CommunityReviews from "@/components/community-reviews";
import Recommendations from "@/components/recommendations";
import StatusTracker from "@/components/status-tracker";
import UpcomingDetailSidebar from "@/components/upcoming-detail-sidebar";
import ExternalScores, { ExternalScoresPanel } from "@/components/external-scores";
import PlatformButtons from "@/components/platform-buttons";
import WatchProviders from "@/components/watch-providers";
import FranchiseBadge from "@/components/franchise-badge";
import FranchiseUniverse from "@/components/franchise-universe";
import AwardBadges from "@/components/award-badges";
import DlcSection, { DlcBadge } from "@/components/dlc-section";
import ItemSubBanner from "@/components/item-sub-banner";
import { getTopTags, getTagDisplayName } from "@/lib/tags";
import TagSuggest from "@/components/tag-suggest";

function dbItemToItem(dbItem: any): Item & { primaryColor?: string | null; secondaryColor?: string | null } {
  return {
    id: dbItem.id,
    title: dbItem.title,
    type: dbItem.type,
    genre: dbItem.genre || [],
    vibes: dbItem.vibes || [],
    year: dbItem.year,
    cover: dbItem.cover || "",
    desc: dbItem.description || "",
    people: dbItem.people || [],
    awards: dbItem.awards || [],
    platforms: dbItem.platforms || [],
    ext: dbItem.ext || {},
    totalEp: dbItem.totalEp || 0,
    primaryColor: dbItem.primaryColor || null,
    secondaryColor: dbItem.secondaryColor || null,
    itemTags: dbItem.itemTags || null,
    ...(dbItem.isUpcoming ? {
      isUpcoming: true,
      releaseDate: dbItem.releaseDate || "",
      hypeScore: dbItem.hypeScore || 0,
      wantCount: dbItem.wantCount || 0,
    } : {}),
  } as Item & { primaryColor?: string | null; secondaryColor?: string | null };
}

// ── Helper: extract primary creator based on media type ────────────────
function getPrimaryCreator(people: Person[], type: MediaType): { name: string; role: string } | null {
  if (!people || people.length === 0) return null;

  const roleMap: Record<MediaType, string[]> = {
    book: ["Author", "Writer"],
    movie: ["Director"],
    tv: ["Creator", "Showrunner", "Director"],
    game: ["Developer", "Studio"],
    manga: ["Author", "Artist", "Mangaka"],
    music: ["Artist", "Band", "Performer"],
    comic: ["Writer", "Artist"],
    podcast: ["Host", "Creator"],
  };

  const preferredRoles = roleMap[type] || [];
  for (const role of preferredRoles) {
    const match = people.find((p) => p.role.toLowerCase() === role.toLowerCase());
    if (match) return match;
  }
  return people[0]; // Fallback to first person
}

// ── Helper: get right-column fact label and value per media type ───────
function getQuickFacts(item: Item): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];

  facts.push({ label: "Year", value: String(item.year || "—") });

  switch (item.type) {
    case "book":
      if (item.totalEp > 0) facts.push({ label: "Pages", value: item.totalEp.toLocaleString() });
      break;
    case "movie":
      // totalEp=1 just means "1 movie" — only show runtime if it's an actual duration (>1)
      if (item.totalEp > 1) facts.push({ label: "Runtime", value: `${item.totalEp} min` });
      break;
    case "tv":
      if (item.totalEp > 0) facts.push({ label: "Episodes", value: item.totalEp.toLocaleString() });
      break;
    case "game":
      // Platforms shown separately
      break;
    case "manga":
      if (item.totalEp > 0) facts.push({ label: "Chapters", value: item.totalEp.toLocaleString() });
      break;
    case "music":
      if (item.totalEp > 0) facts.push({ label: "Tracks", value: String(item.totalEp) });
      break;
    case "comic":
      if (item.totalEp > 0) facts.push({ label: "Issues", value: String(item.totalEp) });
      break;
    case "podcast":
      if (item.totalEp > 0) facts.push({ label: "Episodes", value: item.totalEp.toLocaleString() });
      break;
  }

  // Genre is handled separately in the right panel (not as a simple fact row)

  return facts;
}

// ── Helper: action verb per media type ─────────────────────────────────
function getActionVerb(type: MediaType): string {
  switch (type) {
    case "movie": case "tv": return "watch";
    case "book": case "manga": case "comic": return "read";
    case "game": return "play";
    case "music": case "podcast": return "listen";
  }
}

// ── Hex to RGB for rgba() ──────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

// Platform brand colors (subset for compact display)
const PLATFORM_COLORS: Record<string, string> = {
  steam: "#1b2838", netflix: "#E50914", prime: "#00A8E1", hbo: "#5822b4",
  hulu: "#1CE783", apple: "#555", disney: "#113CCF", kindle: "#FF9900",
  audible: "#F8991C", library: "#4a6741", spotify: "#1DB954", apple_music: "#FA243C",
  apple_pod: "#872EC4", mangaplus: "#E84855", viz: "#1C1C1C", comixology: "#2A2A2A",
  pc: "#171a21", ps5: "#003087", ps4: "#003087", xsx: "#107C10", xone: "#107C10",
  switch: "#E60012", switch2: "#E60012", theaters: "#E84855",
};

const PLATFORM_LABELS: Record<string, string> = {
  steam: "Steam", netflix: "Netflix", prime: "Prime", hbo: "Max",
  hulu: "Hulu", apple: "Apple TV+", disney: "Disney+", kindle: "Kindle",
  audible: "Audible", library: "Library", spotify: "Spotify", apple_music: "Apple Music",
  apple_pod: "Apple Pods", mangaplus: "Manga+", viz: "VIZ", comixology: "ComiXology",
  pc: "PC", ps5: "PS5", ps4: "PS4", xsx: "Xbox", xone: "Xbox One",
  switch: "Switch", switch2: "Switch 2", theaters: "Theaters",
};

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let item: Item | null = null;
  let isExternal = false;

  // Check if this is an external API ID
  const tmdbParsed = parseTmdbId(id);
  const igdbParsed = parseIgdbId(id);
  const gbookParsed = parseGbookId(id);
  const spotifyParsed = parseSpotifyId(id);
  const jikanParsed = parseJikanId(id);
  const cvParsed = parseCvId(id);

  // Auto-import: fetch from API, save to DB, use local ID
  if (tmdbParsed) {
    const existing = await prisma.item.findFirst({ where: { tmdbId: tmdbParsed.tmdbId, type: tmdbParsed.type } }).catch(() => null);
    if (existing) {
      item = dbItemToItem(existing);
    } else {
      item = await getTmdbDetails(tmdbParsed.type, tmdbParsed.tmdbId);
      if (item) {
        const saved = await prisma.item.create({
          data: { title: item.title, type: item.type, genre: item.genre, vibes: item.vibes || [], year: item.year, cover: item.cover, description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: item.totalEp || 0, tmdbId: tmdbParsed.tmdbId, lastSyncedAt: new Date() },
        }).catch(() => null);
        if (saved) item = { ...item, id: saved.id };
        isExternal = true;
      }
    }
  } else if (igdbParsed) {
    const existing = await prisma.item.findFirst({ where: { igdbId: igdbParsed } }).catch(() => null);
    if (existing) { item = dbItemToItem(existing); }
    else {
      item = await getIgdbDetails(igdbParsed);
      if (item) {
        const saved = await prisma.item.create({
          data: { title: item.title, type: "game", genre: item.genre, vibes: item.vibes || [], year: item.year, cover: item.cover, description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: 0, igdbId: igdbParsed, lastSyncedAt: new Date() },
        }).catch(() => null);
        if (saved) item = { ...item, id: saved.id };
        isExternal = true;
      }
    }
  } else if (gbookParsed) {
    const existing = await prisma.item.findFirst({ where: { googleBooksId: gbookParsed } }).catch(() => null);
    if (existing) { item = dbItemToItem(existing); }
    else {
      item = await getGoogleBookDetails(gbookParsed);
      if (item) {
        const saved = await prisma.item.create({
          data: { title: item.title, type: "book", genre: item.genre, vibes: item.vibes || [], year: item.year, cover: item.cover, description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: 0, googleBooksId: gbookParsed, lastSyncedAt: new Date() },
        }).catch(() => null);
        if (saved) item = { ...item, id: saved.id };
        isExternal = true;
      }
    }
  } else if (spotifyParsed) {
    const existing = await prisma.item.findFirst({ where: { spotifyId: spotifyParsed.spotifyId } }).catch(() => null);
    if (existing) { item = dbItemToItem(existing); }
    else {
      item = spotifyParsed.type === "album"
        ? await getSpotifyAlbumDetails(spotifyParsed.spotifyId)
        : await getSpotifyShowDetails(spotifyParsed.spotifyId);
      if (item) {
        const saved = await prisma.item.create({
          data: { title: item.title, type: item.type, genre: item.genre, vibes: item.vibes || [], year: item.year, cover: item.cover, description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: 0, spotifyId: spotifyParsed.spotifyId, lastSyncedAt: new Date() },
        }).catch(() => null);
        if (saved) item = { ...item, id: saved.id };
        isExternal = true;
      }
    }
  } else if (jikanParsed) {
    const existing = await prisma.item.findFirst({ where: { malId: jikanParsed.malId } }).catch(() => null);
    if (existing) { item = dbItemToItem(existing); }
    else {
      item = jikanParsed.type === "manga"
        ? await getJikanMangaDetails(jikanParsed.malId)
        : await getJikanAnimeDetails(jikanParsed.malId);
      if (item) {
        const saved = await prisma.item.create({
          data: { title: item.title, type: item.type, genre: item.genre, vibes: item.vibes || [], year: item.year, cover: item.cover, description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: item.totalEp || 0, malId: jikanParsed.malId, lastSyncedAt: new Date() },
        }).catch(() => null);
        if (saved) item = { ...item, id: saved.id };
        isExternal = true;
      }
    }
  } else if (cvParsed) {
    const existing = await prisma.item.findFirst({ where: { comicVineId: cvParsed } }).catch(() => null);
    if (existing) { item = dbItemToItem(existing); }
    else {
      item = await getComicVineDetails(cvParsed);
      if (item) {
        const saved = await prisma.item.create({
          data: { title: item.title, type: "comic", genre: item.genre, vibes: item.vibes || [], year: item.year, cover: item.cover, description: item.desc || "", people: (item.people || []) as any, awards: (item.awards || []) as any, platforms: (item.platforms || []) as any, ext: (item.ext || {}) as any, totalEp: 0, comicVineId: cvParsed, lastSyncedAt: new Date() },
        }).catch(() => null);
        if (saved) item = { ...item, id: saved.id };
        isExternal = true;
      }
    }
  } else {
    const numId = parseInt(id);

    // Try static data first (instant, no DB needed)
    if (!isNaN(numId)) {
      item = ALL_ITEMS.find((i) => i.id === numId) || null;
    }

    // If not in static data, check if it's an upcoming item from API (offset IDs 600000+)
    if (!item && !isNaN(numId) && numId >= 600000 && numId < 1000000) {
      item = await lookupUpcomingItem(numId);
    }

    // If not in static data or upcoming, fetch from database
    if (!item && !isNaN(numId)) {
      try {
        const dbItem = await prisma.item.findUnique({ where: { id: numId } });
        if (dbItem) {
          item = dbItemToItem(dbItem);
        }
      } catch (e) {
        console.error("Failed to fetch item from DB:", e);
      }
    }
  }

  if (!item) notFound();

  // Fetch stored colors from DB (for items loaded from static data or without colors in the object)
  let primaryColor: string | null = (item as any).primaryColor || null;
  let secondaryColor: string | null = (item as any).secondaryColor || null;

  if (!primaryColor && typeof item.id === "number") {
    try {
      const dbColors = await prisma.item.findUnique({
        where: { id: item.id },
        select: { primaryColor: true, secondaryColor: true },
      });
      if (dbColors?.primaryColor) {
        primaryColor = dbColors.primaryColor;
        secondaryColor = dbColors.secondaryColor || null;
      }
    } catch {}
  }

  const upcoming = !isExternal && isUpcoming(item);
  const hasImageCover = item.cover?.startsWith("http") ?? false;

  const t = TYPES[item.type];
  const rgb = hexToRgb(t.color);
  // Artwork-based colors for hero/sub-banner, falling back to media type color
  const heroRgb = primaryColor ? hexToRgb(primaryColor) : rgb;
  const heroRgb2 = secondaryColor ? hexToRgb(secondaryColor) : heroRgb;
  const creator = getPrimaryCreator(item.people, item.type);
  const quickFacts = getQuickFacts(item);
  const actionVerb = getActionVerb(item.type);

  // Fetch DLC data for games
  let dlcs: any[] = [];
  let parentGame: { id: number; title: string } | null = null;
  let itemSubtype: string | null = null;

  if (item.type === "game" && !isExternal) {
    const numericId = typeof item.id === "number" ? item.id : parseInt(id);

    try {
      const dbItem = await prisma.item.findUnique({
        where: { id: numericId },
        select: {
          parentItemId: true,
          itemSubtype: true,
          parentItem: { select: { id: true, title: true } },
          dlcs: {
            select: {
              id: true, title: true, type: true, year: true, cover: true, itemSubtype: true,
              externalScores: {
                select: { source: true, score: true, maxScore: true },
                take: 1,
                orderBy: { score: "desc" },
              },
            },
            orderBy: { year: "asc" },
          },
        },
      });

      if (dbItem?.parentItem) {
        parentGame = dbItem.parentItem;
        itemSubtype = dbItem.itemSubtype || null;
      }

      if (dbItem?.dlcs && dbItem.dlcs.length > 0) {
        dlcs = dbItem.dlcs.map((d: any) => ({
          ...d,
          bestScore: d.externalScores?.[0] || null,
        }));
      }
    } catch (e) {
      // Silently skip if DB query fails
    }
  }

  // Compact platform pills for right column — deduplicate by key
  const seenPlatforms = new Set<string>();
  const compactPlatforms = (item.platforms || [])
    .map((p: any) => {
      const key = typeof p === "string" ? p : p?.key || "";
      return {
        key,
        label: PLATFORM_LABELS[key] || key,
        color: PLATFORM_COLORS[key] || "#555",
      };
    })
    .filter((p) => {
      if (seenPlatforms.has(p.key)) return false;
      seenPlatforms.add(p.key);
      return true;
    })
    .slice(0, 4);

  // Deduplicate game platforms for display
  const seenGamePlatforms = new Set<string>();
  const dedupedGamePlatforms = (item.platforms || [])
    .map((p: any) => typeof p === "string" ? p : p?.key || "")
    .filter((key: string) => {
      if (seenGamePlatforms.has(key)) return false;
      seenGamePlatforms.add(key);
      return true;
    });

  return (
    <div style={{ overflowX: "hidden" }}>
      {/* Back button + badges — constrained width */}
      <div className="content-width">
        <BackButton />
        {parentGame && <DlcBadge parentId={parentGame.id} parentTitle={parentGame.title} subtype={itemSubtype} />}
        <FranchiseBadge routeId={id} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 1 — HERO BANNER (full-width background)
          ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: `linear-gradient(135deg, rgba(${heroRgb}, 0.12), rgba(${heroRgb2}, 0.06), rgba(11,11,16, 0.95))`,
        marginBottom: 0,
      }}>
        <div className="content-width" style={{ paddingTop: 18, paddingBottom: 18 }}>
          {/* Three-column layout */}
          <div className="hero-layout" style={{
            display: "flex",
            gap: 20,
            alignItems: "stretch",
            minHeight: 180,
          }}>
            {/* Left — Cover art (fills full hero height) */}
            <div className="hero-cover" style={{ flexShrink: 0, width: 120, maxWidth: 120, position: "relative" }}>
              {hasImageCover ? (
                <Image
                  src={item.cover}
                  alt={item.title}
                  width={120}
                  height={180}
                  priority
                  sizes="120px"
                  style={{
                    objectFit: "cover",
                    borderRadius: 8,
                    border: "0.5px solid rgba(255,255,255,0.1)",
                    width: 120,
                    height: "100%",
                  }}
                />
              ) : (
                <div style={{
                  width: 120,
                  height: "100%",
                  borderRadius: 8,
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  background: item.cover || `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}>
                  <span style={{ fontSize: 24 }}>{t.icon}</span>
                  <span style={{
                    fontSize: 8,
                    color: "rgba(255,255,255,0.3)",
                    textAlign: "center",
                    padding: "0 4px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as any,
                  }}>
                    {item.title}
                  </span>
                </div>
              )}
            </div>

            {/* Middle — Info (flex: 1) */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Type badge */}
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                background: t.color,
                color: "#fff",
                fontSize: 9,
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: 8,
                marginBottom: 6,
              }}>
                {t.label.replace(/s$/, "")}
              </div>

              {/* Title */}
              <h1 className="hero-title" style={{
                fontFamily: "var(--font-serif)",
                fontSize: 22,
                fontWeight: 500,
                lineHeight: 1.2,
                color: "#fff",
                margin: "0 0 4px 0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as any,
              }}>
                {item.title}
              </h1>

              {/* Tags (weighted) — falls back to vibes if no tags */}
              {(() => {
                const tags = getTopTags((item as any).itemTags, 7, 0.4);
                if (tags.length > 0) {
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {tags.map((t) => (
                        <Link key={t.slug} href={`/explore?tag=${t.slug}`} style={{
                          fontSize: 9,
                          padding: "2px 7px",
                          borderRadius: 8,
                          background: `rgba(255,255,255,${0.03 + t.weight * 0.04})`,
                          border: `0.5px solid rgba(255,255,255,${0.05 + t.weight * 0.06})`,
                          color: `rgba(255,255,255,${0.35 + t.weight * 0.25})`,
                          textDecoration: "none",
                        }}>
                          {getTagDisplayName(t.slug)}
                        </Link>
                      ))}
                    </div>
                  );
                }
                // Fallback to vibes
                if (item.vibes.length > 0) {
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {item.vibes.slice(0, 5).map((v) => {
                        const vibe = VIBES[v];
                        if (!vibe) return null;
                        return (
                          <Link key={v} href={`/vibe/${v}`} style={{
                            fontSize: 9,
                            padding: "2px 7px",
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.04)",
                            border: "0.5px solid rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.45)",
                            textDecoration: "none",
                          }}>
                            {vibe.label}
                          </Link>
                        );
                      })}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Suggest a tag link */}
              {!upcoming && typeof item.id === "number" && (
                <div style={{ marginBottom: 6 }}>
                  <TagSuggest itemId={item.id} itemType={item.type} />
                </div>
              )}

              {/* Description — compact with line clamp */}
              <ExpandableText text={item.desc} compact toggleColor={t.color} />
            </div>

            {/* Right — Quick reference (25% width) */}
            <div className="hero-right" style={{
              flex: "0 0 25%",
              minWidth: 180,
              maxWidth: 360,
              borderLeft: "0.5px solid rgba(255,255,255,0.06)",
              paddingLeft: 16,
            }}>
              {/* Creator */}
              {creator && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: t.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#fff",
                    flexShrink: 0,
                  }}>
                    {creator.name[0]}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.85)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {creator.name}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                      {creator.role}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick facts */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {quickFacts.map((f) => (
                  <div key={f.label} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{f.label}</span>
                    <span style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.7)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 160,
                      textAlign: "right",
                    }}>
                      {f.value}
                    </span>
                  </div>
                ))}

                {/* Genre row — show all genres */}
                {item.genre.length > 0 && (
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: item.genre.length > 3 ? "flex-start" : "center",
                  }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>Genre</span>
                    {item.genre.length <= 3 ? (
                      <span style={{
                        fontSize: 13,
                        color: "rgba(255,255,255,0.7)",
                        textAlign: "right",
                      }}>
                        {item.genre.join(", ")}
                      </span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                        {item.genre.map((g) => (
                          <span key={g} style={{
                            fontSize: 10,
                            padding: "2px 7px",
                            borderRadius: 6,
                            background: "rgba(255,255,255,0.04)",
                            border: "0.5px solid rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.6)",
                          }}>
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Game platforms as fact row */}
                {item.type === "game" && dedupedGamePlatforms.length > 0 && (
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Platforms</span>
                    <span style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.7)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 160,
                      textAlign: "right",
                    }}>
                      {dedupedGamePlatforms.slice(0, 3).map((key: string) =>
                        PLATFORM_LABELS[key] || key
                      ).join(", ")}
                    </span>
                  </div>
                )}
              </div>

              {/* Where to [verb] */}
              {item.type !== "game" && compactPlatforms.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.2)",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 6,
                  }}>
                    Where to {actionVerb}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {compactPlatforms.map((p) => (
                      <a
                        key={p.key}
                        href={`/api/go/${item.id}/${p.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 10,
                          padding: "4px 10px",
                          borderRadius: 5,
                          background: p.color,
                          color: "#fff",
                          fontWeight: 500,
                          textDecoration: "none",
                          transition: "transform 0.15s",
                        }}
                      >
                        {p.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 2 — SCORES AND ACTIONS SUB-BANNER (full-width background)
          ═══════════════════════════════════════════════════════════════════ */}
      {upcoming ? (
        <div className="content-width" style={{ padding: "12px 24px" }}>
          <UpcomingDetailSidebar item={item} />
        </div>
      ) : (
        <div style={{
          background: `rgba(${heroRgb}, 0.03)`,
          borderTop: `1px solid rgba(${heroRgb}, 0.1)`,
          borderBottom: "0.5px solid rgba(255,255,255,0.04)",
        }}>
          <div className="content-width">
            <ItemSubBanner item={item} typeColor={t.color} heroColor={primaryColor || t.color} />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 3 — CONTENT (constrained width)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="content-width">
        {/* A. Franchise universe */}
        <div style={{ marginTop: 12, marginBottom: 0 }}>
          <FranchiseUniverse itemId={typeof item.id === "number" ? item.id : parseInt(id)} />
        </div>

        {/* B. DLC / Expansions */}
        {dlcs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <DlcSection dlcs={dlcs} baseGameTitle={item.title} typeColor={t.color} />
          </div>
        )}

        {/* C. Awards */}
        <AwardBadges awards={item.awards} />

        {/* C2. Platform links (full section) */}
        {!upcoming && (item.platforms || []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <PlatformButtons
              platforms={item.platforms}
              mediaType={item.type as any}
              itemId={item.id}
              showAffiliate={false}
            />
          </div>
        )}

        {/* D. Community reviews */}
        {!upcoming && (
          <section style={{ marginTop: 16, marginBottom: 20 }}>
            <CommunityReviews itemId={item.id} heroColor={primaryColor || t.color} />
          </section>
        )}

        {/* E. Recommendations */}
        {!upcoming && !isExternal && <Recommendations item={item} />}
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 1024px) and (min-width: 769px) {
          .hero-layout {
            flex-wrap: wrap !important;
          }
          .hero-right {
            flex: 0 0 100% !important;
            min-width: 0 !important;
            max-width: none !important;
            border-left: none !important;
            padding-left: 0 !important;
            border-top: 0.5px solid rgba(255,255,255,0.06) !important;
            padding-top: 10px !important;
            margin-top: 4px !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 12px !important;
            align-items: center !important;
          }
        }
        @media (max-width: 768px) {
          .hero-layout {
            flex-direction: column !important;
            align-items: center !important;
          }
          .hero-right {
            flex: 0 0 100% !important;
            min-width: 0 !important;
            max-width: none !important;
            border-left: none !important;
            padding-left: 0 !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
            justify-content: center !important;
            padding-top: 8px !important;
            border-top: 0.5px solid rgba(255,255,255,0.06) !important;
          }
        }
      `}</style>
    </div>
  );
}
