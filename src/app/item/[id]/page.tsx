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

function dbItemToItem(dbItem: any): Item {
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
    ...(dbItem.isUpcoming ? {
      isUpcoming: true,
      releaseDate: dbItem.releaseDate || "",
      hypeScore: dbItem.hypeScore || 0,
      wantCount: dbItem.wantCount || 0,
    } : {}),
  } as Item;
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

  if (item.genre.length > 0) {
    facts.push({ label: "Genre", value: item.genre[0] });
  }

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

    // If not in static data, fetch from database
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

  const upcoming = !isExternal && isUpcoming(item);
  const hasImageCover = item.cover?.startsWith("http") ?? false;

  const t = TYPES[item.type];
  const rgb = hexToRgb(t.color);
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

  // Compact platform pills for right column
  const compactPlatforms = (item.platforms || []).slice(0, 4).map((p: any) => {
    const key = typeof p === "string" ? p : p?.key || "";
    return {
      key,
      label: PLATFORM_LABELS[key] || key,
      color: PLATFORM_COLORS[key] || "#555",
    };
  });

  return (
    <div style={{ maxWidth: "100vw", overflowX: "hidden" }}>
      <BackButton />

      {/* DLC badge */}
      {parentGame && <DlcBadge parentId={parentGame.id} parentTitle={parentGame.title} subtype={itemSubtype} />}

      {/* Franchise badge */}
      <FranchiseBadge routeId={id} />

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 1 — COMPACT HERO BANNER
          ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: `linear-gradient(135deg, rgba(${rgb}, 0.08), rgba(${rgb}, 0.02))`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 0,
      }}>
        {/* Three-column layout */}
        <div className="hero-layout" style={{
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}>
          {/* Left — Cover art */}
          <div style={{ flexShrink: 0, width: 95, height: (item.type === "book" || item.type === "manga") ? 145 : 140 }}>
            {hasImageCover ? (
              <Image
                src={item.cover}
                alt={item.title}
                width={95}
                height={(item.type === "book" || item.type === "manga") ? 145 : 140}
                priority
                sizes="95px"
                style={{
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  width: 95,
                  height: (item.type === "book" || item.type === "manga") ? 145 : 140,
                }}
              />
            ) : (
              <div style={{
                width: 95,
                height: (item.type === "book" || item.type === "manga") ? 145 : 140,
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

          {/* Middle — Info */}
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
            <h1 style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              fontWeight: 500,
              lineHeight: 1.2,
              color: "#fff",
              marginBottom: 4,
              margin: "0 0 4px 0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as any,
            }}>
              {item.title}
            </h1>

            {/* Vibe tags */}
            {item.vibes.length > 0 && (
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
            )}

            {/* Description — compact with line clamp */}
            <ExpandableText text={item.desc} compact toggleColor={t.color} />
          </div>

          {/* Right — Quick reference */}
          <div className="hero-right" style={{ width: 140, flexShrink: 0 }}>
            {/* Creator */}
            {creator && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: t.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}>
                  {creator.name[0]}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.8)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {creator.name}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
                    {creator.role}
                  </div>
                </div>
              </div>
            )}

            {/* Quick facts */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {quickFacts.map((f) => (
                <div key={f.label} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{f.label}</span>
                  <span style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.6)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 80,
                    textAlign: "right",
                  }}>
                    {f.value}
                  </span>
                </div>
              ))}

              {/* Game platforms as fact row */}
              {item.type === "game" && item.platforms.length > 0 && (
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Platforms</span>
                  <span style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.6)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 80,
                    textAlign: "right",
                  }}>
                    {item.platforms.slice(0, 3).map((p: any) =>
                      PLATFORM_LABELS[typeof p === "string" ? p : p?.key] || (typeof p === "string" ? p : p?.key || "")
                    ).join(", ")}
                  </span>
                </div>
              )}
            </div>

            {/* Where to [verb] */}
            {item.type !== "game" && compactPlatforms.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{
                  fontSize: 8,
                  color: "rgba(255,255,255,0.2)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 5,
                }}>
                  Where to {actionVerb}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {compactPlatforms.map((p) => (
                    <div key={p.key} style={{
                      fontSize: 8,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: p.color,
                      color: "#fff",
                      fontWeight: 500,
                    }}>
                      {p.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 2 — SCORES AND ACTIONS SUB-BANNER
          ═══════════════════════════════════════════════════════════════════ */}
      {upcoming ? (
        <div style={{ padding: "12px 16px" }}>
          <UpcomingDetailSidebar item={item} />
        </div>
      ) : (
        <ItemSubBanner item={item} typeColor={t.color} />
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 3 — CONTENT (full width, no sidebar)
          ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: "0 16px" }}>
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

        {/* D. Community reviews */}
        {!upcoming && (
          <section style={{ marginTop: 16, marginBottom: 20 }}>
            <CommunityReviews itemId={item.id} />
          </section>
        )}

        {/* E. Recommendations */}
        {!upcoming && !isExternal && <Recommendations item={item} />}
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .hero-layout {
            flex-direction: column !important;
            align-items: center !important;
          }
          .hero-right {
            width: 100% !important;
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
