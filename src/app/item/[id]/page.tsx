import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ALL_ITEMS, TYPES, VIBES, isUpcoming, type Item } from "@/lib/data";
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
    // Check if already imported
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

  // Fetch DLC data for games
  let dlcs: any[] = [];
  let parentGame: { id: number; title: string } | null = null;
  let itemSubtype: string | null = null;

  if (item.type === "game" && !isExternal) {
    const numericId = typeof item.id === "number" ? item.id : parseInt(id);

    // Check if this item IS a DLC (has a parent)
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

  return (
    <div>
      <BackButton />

      {/* DLC badge — if this is a DLC, show link back to base game */}
      {parentGame && <DlcBadge parentId={parentGame.id} parentTitle={parentGame.title} subtype={itemSubtype} />}

      {/* Franchise badge */}
      <FranchiseBadge routeId={id} />

      {/* Hero banner */}
      <div style={{
        background: hasImageCover ? "#1a1a2e" : item.cover,
        borderRadius: 20,
        padding: "48px 36px 36px",
        marginBottom: 36,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Blurred poster background for image covers */}
        {hasImageCover && (
          <Image
            src={item.cover}
            alt=""
            fill
            sizes="100vw"
            quality={30}
            style={{
              objectFit: "cover",
              filter: "blur(20px) brightness(0.4)",
            }}
          />
        )}
        <div style={{
          position: "absolute",
          inset: 0,
          background: hasImageCover
            ? "linear-gradient(to top, rgba(11,11,16,0.9) 0%, rgba(11,11,16,0.3) 60%, rgba(11,11,16,0.5) 100%)"
            : "linear-gradient(to top, rgba(11,11,16,0.85) 0%, rgba(11,11,16,0.2) 60%, transparent 100%)",
          borderRadius: 20,
        }} />

        <div style={{ position: "relative", display: "flex", gap: 24, alignItems: "flex-end" }}>
          {/* Poster thumbnail for image covers */}
          {hasImageCover && (
            <Image
              src={item.cover}
              alt={item.title}
              width={140}
              height={210}
              priority
              sizes="140px"
              style={{
                objectFit: "cover",
                borderRadius: 12,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                flexShrink: 0,
              }}
            />
          )}
          <div>
          {/* Type badge */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: t.color,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 12px",
            borderRadius: 8,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 16,
          }}>
            {t.icon} {t.label.replace(/s$/, "")}
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: "var(--font-serif)",
            fontSize: 42,
            fontWeight: 900,
            lineHeight: 1.1,
            color: "#fff",
            marginBottom: 12,
            maxWidth: 700,
          }}>
            {item.title}
          </h1>

          {/* Year + genres */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, color: "var(--text-muted)", fontWeight: 500 }}>
              {item.year}
            </span>
            <span style={{ color: "var(--text-faint)" }}>·</span>
            {item.genre.map((g) => (
              <span key={g} style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                background: "var(--surface-4)",
                padding: "3px 10px",
                borderRadius: 6,
              }}>
                {g}
              </span>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" }}>

        {/* Left column */}
        <div>
          {/* Description */}
          <section style={{ marginBottom: 32 }}>
            <h2 style={{
              fontFamily: "var(--font-serif)",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: 12,
            }}>
              About
            </h2>
            <p style={{
              fontSize: 15,
              color: "var(--text-secondary)",
              lineHeight: 1.75,
            }}>
              {item.desc}
            </p>
          </section>

          {/* Vibe tags */}
          {item.vibes.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{
                fontFamily: "var(--font-serif)",
                fontSize: 16,
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: 12,
              }}>
                Vibes
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {item.vibes.map((v) => {
                  const vibe = VIBES[v];
                  if (!vibe) return null;
                  return (
                    <Link key={v} href={`/vibe/${v}`} style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      color: "#fff",
                      background: vibe.color + "33",
                      border: `1px solid ${vibe.color}55`,
                      padding: "6px 14px",
                      borderRadius: 20,
                      textDecoration: "none",
                      transition: "transform 0.1s",
                    }}>
                      <span>{vibe.icon}</span>
                      {vibe.label}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Awards */}
          <AwardBadges awards={item.awards} />

          {/* Platforms — real TMDB watch providers for movie/tv, static for others */}
          {(item.type === "movie" || item.type === "tv") ? (
            <WatchProviders
              title={item.title}
              year={item.year}
              mediaType={item.type}
              tmdbId={tmdbParsed ? item.id : undefined}
            />
          ) : (
            <PlatformButtons platforms={item.platforms} mediaType={item.type} />
          )}

          {/* This universe — franchise mini cards */}
          <FranchiseUniverse itemId={typeof item.id === 'number' ? item.id : parseInt(id)} />

          {/* DLC, Expansions & Editions — right after franchise, before People */}
          {dlcs.length > 0 && (
            <DlcSection dlcs={dlcs} baseGameTitle={item.title} typeColor={t.color} />
          )}

          {/* People */}
          {item.people.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <h2 style={{
                fontFamily: "var(--font-serif)",
                fontSize: 16,
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: 12,
              }}>
                People
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {item.people.map((p, i) => (
                  <div key={i} style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "var(--surface-1)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                  }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--surface-4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      flexShrink: 0,
                    }}>
                      {p.name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{p.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Community Reviews — only for released items */}
          {!upcoming && (
            <section style={{ marginBottom: 32 }}>
              <CommunityReviews itemId={item.id} />
            </section>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {upcoming ? (
            /* Upcoming: hype score, want count, Want To button */
            <UpcomingDetailSidebar item={item} />
          ) : (
            <>
              {/* Community aggregate score */}
              <div style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 24,
              }}>
                <div style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  marginBottom: 16,
                }}>
                  Community Score
                </div>
                <AggregateScorePanel itemId={item.id} />
              </div>

              {/* External scores */}
              <ExternalScoresPanel itemId={item.id} fallbackExt={item.ext} />

              {/* Your rating */}
              <RatingPanel itemId={item.id} />

              {/* Status tracking */}
              <StatusTracker item={item} />
            </>
          )}
        </div>
      </div>

      {/* Recommendation columns — only for released local items */}
      {!upcoming && !isExternal && <Recommendations item={item} />}
    </div>
  );
}
