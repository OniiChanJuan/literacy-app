/**
 * Shared item-page render logic.
 * Used by both /item/[id] (legacy redirect) and /[type]/[slug] (primary route).
 */

import Image from "next/image";
import Link from "next/link";
import { TYPES, VIBES, hexToRgba, type Item, type MediaType, type Person } from "@/lib/data";
import { ExpandableText } from "@/components/expandable-text";
import BackButton from "@/components/back-button";
import CommunityReviews from "@/components/community-reviews";
import Recommendations from "@/components/recommendations";
import UpcomingDetailSidebar from "@/components/upcoming-detail-sidebar";
import WhereTo from "@/components/where-to";
import FranchiseBadge from "@/components/franchise-badge";
import FranchiseUniverse from "@/components/franchise-universe";
import AwardBadges from "@/components/award-badges";
import DlcSection, { DlcBadge } from "@/components/dlc-section";
import ItemSubBanner from "@/components/item-sub-banner";
import ErrorBoundary from "@/components/error-boundary";
import { getTopTags, getTagDisplayName } from "@/lib/tags";
import TagSuggest from "@/components/tag-suggest";
import ShareButton from "@/components/share-button";
import { isUpcoming } from "@/lib/data";

// ── Re-export dbItemToItem so callers don't need to duplicate it ─────────────

export function dbItemToItem(dbItem: any): Item & { primaryColor?: string | null; secondaryColor?: string | null } {
  return {
    id: dbItem.id,
    title: dbItem.title,
    type: dbItem.type,
    genre: dbItem.genre || [],
    vibes: dbItem.vibes || [],
    year: dbItem.year ?? 0,
    cover: dbItem.cover ?? "",
    desc: dbItem.description ?? "",
    people: (dbItem.people as any[] | null) ?? [],
    awards: (dbItem.awards as any[] | null) ?? [],
    platforms: (dbItem.platforms as any[] | null) ?? [],
    ext: (dbItem.ext as Record<string, number> | null) ?? {},
    totalEp: dbItem.totalEp ?? 0,
    tmdbId: dbItem.tmdbId ?? undefined,
    primaryColor: dbItem.primaryColor || null,
    secondaryColor: dbItem.secondaryColor || null,
    itemTags: dbItem.itemTags || null,
    slug: dbItem.slug || null,
    ...(dbItem.isUpcoming ? {
      isUpcoming: true,
      releaseDate: dbItem.releaseDate || "",
      hypeScore: dbItem.hypeScore || 0,
      wantCount: dbItem.wantCount || 0,
    } : {}),
  } as Item & { primaryColor?: string | null; secondaryColor?: string | null };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  return people[0];
}

function getQuickFacts(item: Item): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  facts.push({ label: "Year", value: String(item.year || "—") });

  switch (item.type) {
    case "book":
      if (item.totalEp > 0) facts.push({ label: "Pages", value: item.totalEp.toLocaleString() });
      break;
    case "movie":
      if (item.totalEp > 1) facts.push({ label: "Runtime", value: `${item.totalEp} min` });
      break;
    case "tv":
      if (item.totalEp > 0) facts.push({ label: "Episodes", value: item.totalEp.toLocaleString() });
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
  return facts;
}

function getActionVerb(type: MediaType): string {
  switch (type) {
    case "movie": case "tv": return "watch";
    case "book": case "manga": case "comic": return "read";
    case "game": return "play";
    case "music": case "podcast": return "listen";
  }
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

const PLATFORM_COLORS: Record<string, string> = {
  steam: "#1b2838", netflix: "#E50914", prime: "#00A8E1", hbo: "#5822b4",
  hulu: "#1CE783", apple: "#555", disney: "#113CCF", kindle: "#FF9900",
  audible: "#F8991C", library: "#4a6741", spotify: "#1DB954", apple_music: "#FA243C",
  apple_pod: "#872EC4", mangaplus: "#E84855", viz: "#1C1C1C", comixology: "#2A2A2A",
  pc: "#171a21", ps5: "#003087", ps4: "#003087", xsx: "#107C10", xone: "#107C10",
  switch: "#E60012", switch2: "#E60012", theaters: "#E84855",
};

export const PLATFORM_LABELS: Record<string, string> = {
  steam: "Steam", netflix: "Netflix", prime: "Prime", hbo: "Max",
  hulu: "Hulu", apple: "Apple TV+", disney: "Disney+", kindle: "Kindle",
  audible: "Audible", library: "Library", spotify: "Spotify", apple_music: "Apple Music",
  apple_pod: "Apple Pods", mangaplus: "Manga+", viz: "VIZ", comixology: "ComiXology",
  pc: "PC", ps5: "PS5", ps4: "PS4", xsx: "Xbox", xone: "Xbox One",
  switch: "Switch", switch2: "Switch 2", theaters: "Theaters",
};

// ── Render component ──────────────────────────────────────────────────────────

export interface ItemPageRenderProps {
  item: Item;
  /** The string ID used in the original route (for FranchiseBadge/DlcBadge API calls) */
  routeId: string;
  isExternal: boolean;
  primaryColor: string | null;
  secondaryColor: string | null;
  dlcs: any[];
  parentGame: { id: number; title: string } | null;
  itemSubtype: string | null;
}

export function ItemPageRender({
  item,
  routeId,
  isExternal,
  primaryColor,
  secondaryColor,
  dlcs,
  parentGame,
  itemSubtype,
}: ItemPageRenderProps) {
  const upcoming = !isExternal && isUpcoming(item);
  const hasImageCover = item.cover?.startsWith("http") ?? false;

  const t = TYPES[item.type];
  const rgb = hexToRgb(t.color);
  const heroRgb = primaryColor ? hexToRgb(primaryColor) : rgb;
  const heroRgb2 = secondaryColor ? hexToRgb(secondaryColor) : heroRgb;
  const creator = getPrimaryCreator(item.people, item.type);
  const quickFacts = getQuickFacts(item);
  const actionVerb = getActionVerb(item.type);

  // Compact platform pills for right column
  const seenPlatforms = new Set<string>();
  const compactPlatforms = (item.platforms || [])
    .map((p: any) => {
      const key = typeof p === "string" ? p : p?.key || "";
      return { key, label: PLATFORM_LABELS[key] || key, color: PLATFORM_COLORS[key] || "#555" };
    })
    .filter((p) => {
      if (seenPlatforms.has(p.key)) return false;
      seenPlatforms.add(p.key);
      return true;
    })
    .slice(0, 4);

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
      {/* Back button + badges */}
      <div className="content-width">
        <BackButton />
        {parentGame && <DlcBadge parentId={parentGame.id} parentTitle={parentGame.title} subtype={itemSubtype} />}
        <FranchiseBadge routeId={routeId} />
      </div>

      {/* ZONE 1 — HERO BANNER */}
      <div style={{
        background: `linear-gradient(135deg, rgba(${heroRgb}, 0.12), rgba(${heroRgb2}, 0.06), rgba(11,11,16, 0.95))`,
        marginBottom: 0,
      }}>
        <div className="content-width" style={{ paddingTop: 18, paddingBottom: 18 }}>
          <div className="hero-layout" style={{ display: "flex", gap: 20, alignItems: "stretch", minHeight: 180 }}>
            {/* Cover */}
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
                    objectFit: "cover", borderRadius: 8,
                    border: "0.5px solid rgba(255,255,255,0.1)",
                    width: 120, height: "100%",
                  }}
                />
              ) : (
                <div style={{
                  width: 120, height: "100%", borderRadius: 8,
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  background: (item.cover && item.cover.startsWith("http")) ? item.cover : `linear-gradient(135deg, ${t.color}22, ${t.color}08)`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <span style={{ fontSize: 24 }}>{t.icon}</span>
                  <span style={{
                    fontSize: 8, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "0 4px",
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
                  }}>
                    {item.title}
                  </span>
                </div>
              )}
            </div>

            {/* Middle — Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: "inline-flex", alignItems: "center",
                background: hexToRgba(t.color, 0.85), color: "#fff", fontSize: 9, fontWeight: 500,
                padding: "2px 8px", borderRadius: 8, marginBottom: 6,
              }}>
                {t.label.replace(/s$/, "")}
              </div>

              <h1 className="hero-title" style={{
                fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 500,
                lineHeight: 1.2, color: "#fff", margin: "0 0 4px 0",
                overflow: "hidden", textOverflow: "ellipsis",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any,
              }}>
                {item.title}
              </h1>

              <div style={{ marginBottom: 6 }}>
                <ShareButton title={item.title} />
              </div>

              {(() => {
                const tags = getTopTags((item as any).itemTags, 7, 0.4);
                if (tags.length > 0) {
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {tags.map((tg) => (
                        <Link key={tg.slug} href={`/explore?tag=${tg.slug}`} style={{
                          fontSize: 9, padding: "2px 7px", borderRadius: 8,
                          background: `rgba(255,255,255,${0.03 + tg.weight * 0.04})`,
                          border: `0.5px solid rgba(255,255,255,${0.05 + tg.weight * 0.06})`,
                          color: `rgba(255,255,255,${0.35 + tg.weight * 0.25})`,
                          textDecoration: "none",
                        }}>
                          {getTagDisplayName(tg.slug)}
                        </Link>
                      ))}
                    </div>
                  );
                }
                if ((item.vibes ?? []).length > 0) {
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {(item.vibes ?? []).slice(0, 5).map((v) => {
                        const vibe = VIBES[v];
                        if (!vibe) return null;
                        return (
                          <Link key={v} href={`/vibe/${v}`} style={{
                            fontSize: 9, padding: "2px 7px", borderRadius: 8,
                            background: "rgba(255,255,255,0.04)",
                            border: "0.5px solid rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.45)", textDecoration: "none",
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

              {!upcoming && typeof item.id === "number" && (
                <div style={{ marginBottom: 6 }}>
                  <TagSuggest itemId={item.id} itemType={item.type} />
                </div>
              )}

              <ExpandableText text={item.desc ?? ''} compact toggleColor={t.color} />
            </div>

            {/* Right — Quick reference */}
            <div className="hero-right" style={{
              flex: "0 0 25%", minWidth: 180, maxWidth: 360,
              borderLeft: "0.5px solid rgba(255,255,255,0.06)", paddingLeft: 16,
            }}>
              {creator && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: t.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 500, color: "#fff", flexShrink: 0,
                  }}>
                    {creator.name[0]}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {creator.name}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{creator.role}</div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {quickFacts.map((f) => (
                  <div key={f.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{f.label}</span>
                    <span style={{
                      fontSize: 13, color: "rgba(255,255,255,0.7)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      maxWidth: 160, textAlign: "right",
                    }}>
                      {f.value}
                    </span>
                  </div>
                ))}

                {(item.genre ?? []).length > 0 && (
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: (item.genre ?? []).length > 3 ? "flex-start" : "center",
                  }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>Genre</span>
                    {(item.genre ?? []).length <= 3 ? (
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", textAlign: "right" }}>
                        {(item.genre ?? []).join(", ")}
                      </span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                        {(item.genre ?? []).map((g) => (
                          <span key={g} style={{
                            fontSize: 10, padding: "2px 7px", borderRadius: 6,
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

                {item.type === "game" && dedupedGamePlatforms.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Platforms</span>
                    <span style={{
                      fontSize: 13, color: "rgba(255,255,255,0.7)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      maxWidth: 160, textAlign: "right",
                    }}>
                      {dedupedGamePlatforms.slice(0, 3).map((key: string) =>
                        PLATFORM_LABELS[key] || key
                      ).join(", ")}
                    </span>
                  </div>
                )}
              </div>

              {item.type !== "game" && compactPlatforms.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{
                    fontSize: 10, color: "rgba(255,255,255,0.2)",
                    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
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
                          fontSize: 10, padding: "4px 10px", borderRadius: 5,
                          background: p.color, color: "#fff", fontWeight: 500,
                          textDecoration: "none", transition: "transform 0.15s",
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

      {/* ZONE 2 — SCORES AND ACTIONS */}
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
            <ErrorBoundary>
              <ItemSubBanner item={item} typeColor={t.color} heroColor={primaryColor || t.color} />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* ZONE 3 — CONTENT */}
      <div className="content-width">
        <div style={{ marginTop: 12, marginBottom: 0 }}>
          <ErrorBoundary>
            <FranchiseUniverse itemId={typeof item.id === "number" ? item.id : 0} />
          </ErrorBoundary>
        </div>

        {dlcs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <DlcSection dlcs={dlcs} baseGameTitle={item.title} typeColor={t.color} />
          </div>
        )}

        <AwardBadges awards={item.awards ?? []} />

        {!upcoming && (
          <div style={{ marginTop: 16 }}>
            <WhereTo item={item} />
          </div>
        )}

        {!upcoming && (
          <section style={{ marginTop: 16, marginBottom: 20 }}>
            <ErrorBoundary>
              <CommunityReviews itemId={item.id} heroColor={primaryColor || t.color} />
            </ErrorBoundary>
          </section>
        )}

        {!upcoming && !isExternal && <ErrorBoundary><Recommendations item={item} /></ErrorBoundary>}
      </div>

      <style>{`
        @media (max-width: 1024px) and (min-width: 769px) {
          .hero-layout { flex-wrap: wrap !important; }
          .hero-right {
            flex: 0 0 100% !important; min-width: 0 !important; max-width: none !important;
            border-left: none !important; padding-left: 0 !important;
            border-top: 0.5px solid rgba(255,255,255,0.06) !important; padding-top: 10px !important;
            margin-top: 4px !important; display: flex !important; flex-wrap: wrap !important;
            gap: 12px !important; align-items: center !important;
          }
        }
        @media (max-width: 768px) {
          .hero-layout { flex-direction: column !important; align-items: center !important; }
          .hero-right {
            flex: 0 0 100% !important; min-width: 0 !important; max-width: none !important;
            border-left: none !important; padding-left: 0 !important;
            display: flex !important; flex-wrap: wrap !important; gap: 8px !important;
            justify-content: center !important; padding-top: 8px !important;
            border-top: 0.5px solid rgba(255,255,255,0.06) !important;
          }
        }
      `}</style>
    </div>
  );
}
