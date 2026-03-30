"use client";

import type { MediaType } from "@/lib/data";

// Console-specific colors and icons
const CONSOLE_STYLES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  // PC
  pc:       { label: "PC",                icon: "💻", color: "#fff",    bg: "#171a21" },
  mac:      { label: "Mac",               icon: "🍎", color: "#fff",    bg: "#555" },
  linux:    { label: "Linux",             icon: "🐧", color: "#333",    bg: "#FCC624" },
  dos:      { label: "DOS",               icon: "💾", color: "#0f0",    bg: "#0a0a0a" },

  // PlayStation
  ps5:      { label: "PS5",               icon: "🎮", color: "#fff",    bg: "#003087" },
  ps4:      { label: "PS4",               icon: "🎮", color: "#fff",    bg: "#003087" },
  ps3:      { label: "PS3",               icon: "🎮", color: "#fff",    bg: "#003791" },
  ps2:      { label: "PS2",               icon: "🎮", color: "#fff",    bg: "#003791" },
  ps1:      { label: "PS1",               icon: "🎮", color: "#fff",    bg: "#003791" },
  psp:      { label: "PSP",               icon: "🎮", color: "#fff",    bg: "#003087" },
  vita:     { label: "PS Vita",           icon: "🎮", color: "#fff",    bg: "#003087" },
  ps:       { label: "PlayStation",       icon: "🎮", color: "#fff",    bg: "#003791" },

  // Xbox
  xsx:      { label: "Xbox Series X|S",   icon: "🎮", color: "#fff",    bg: "#107C10" },
  xone:     { label: "Xbox One",          icon: "🎮", color: "#fff",    bg: "#107C10" },
  x360:     { label: "Xbox 360",          icon: "🎮", color: "#fff",    bg: "#5dc21e" },
  xbox:     { label: "Xbox",              icon: "🎮", color: "#fff",    bg: "#107C10" },

  // Nintendo
  switch:   { label: "Nintendo Switch",   icon: "🎮", color: "#fff",    bg: "#E60012" },
  switch2:  { label: "Switch 2",          icon: "🎮", color: "#fff",    bg: "#E60012" },
  wiiu:     { label: "Wii U",             icon: "🎮", color: "#fff",    bg: "#009AC7" },
  wii:      { label: "Wii",              icon: "🎮", color: "#333",    bg: "#BFBFBF" },
  gc:       { label: "GameCube",          icon: "🎮", color: "#fff",    bg: "#6A0DAD" },
  n64:      { label: "N64",              icon: "🎮", color: "#fff",    bg: "#2F9B2F" },
  snes:     { label: "SNES",             icon: "🎮", color: "#333",    bg: "#7B7B7B" },
  nes:      { label: "NES",              icon: "🎮", color: "#333",    bg: "#C4C4C4" },
  "3ds":    { label: "3DS",              icon: "🎮", color: "#fff",    bg: "#CE1111" },
  ds:       { label: "Nintendo DS",       icon: "🎮", color: "#333",    bg: "#BFBFBF" },
  gba:      { label: "GBA",              icon: "🎮", color: "#fff",    bg: "#4B0082" },
  gbc:      { label: "Game Boy Color",    icon: "🎮", color: "#fff",    bg: "#6B238E" },
  gb:       { label: "Game Boy",          icon: "🎮", color: "#333",    bg: "#8B956D" },

  // Sega
  dc:       { label: "Dreamcast",         icon: "🌀", color: "#fff",    bg: "#FF6600" },
  genesis:  { label: "Sega Genesis",      icon: "🎮", color: "#fff",    bg: "#171717" },
  saturn:   { label: "Sega Saturn",       icon: "🎮", color: "#fff",    bg: "#1A1A2E" },
  segacd:   { label: "Sega CD",           icon: "🎮", color: "#fff",    bg: "#171717" },
  gg:       { label: "Game Gear",         icon: "🎮", color: "#fff",    bg: "#171717" },
  sms:      { label: "Master System",     icon: "🎮", color: "#fff",    bg: "#171717" },

  // Mobile
  ios:      { label: "iOS",               icon: "📱", color: "#fff",    bg: "#555" },
  android:  { label: "Android",           icon: "📱", color: "#fff",    bg: "#3DDC84" },

  // Other
  browser:  { label: "Browser",           icon: "🌐", color: "#fff",    bg: "#4285F4" },
  arcade:   { label: "Arcade",            icon: "🕹️", color: "#333",    bg: "#FFD700" },
  stadia:   { label: "Stadia",            icon: "☁️", color: "#fff",    bg: "#CD2640" },

  // Retro
  amiga:    { label: "Amiga",             icon: "💻", color: "#fff",    bg: "#FF4500" },
  c64:      { label: "Commodore 64",      icon: "💻", color: "#fff",    bg: "#A0522D" },
  atari2600:{ label: "Atari 2600",        icon: "🎮", color: "#fff",    bg: "#A0522D" },
  jaguar:   { label: "Atari Jaguar",      icon: "🎮", color: "#fff",    bg: "#A0522D" },

  // Streaming / media
  steam:       { label: "Steam",         icon: "S",  color: "#fff",    bg: "#1b2838" },
  netflix:     { label: "Netflix",       icon: "N",  color: "#fff",    bg: "#E50914" },
  prime:       { label: "Prime Video",   icon: "▶",  color: "#fff",    bg: "#00A8E1" },
  hbo:         { label: "Max",           icon: "M",  color: "#fff",    bg: "#5822b4" },
  hulu:        { label: "Hulu",          icon: "H",  color: "#fff",    bg: "#1CE783" },
  apple:       { label: "Apple TV+",     icon: "▶",  color: "#fff",    bg: "#555" },
  disney:      { label: "Disney+",       icon: "D",  color: "#fff",    bg: "#113CCF" },
  kindle:      { label: "Kindle",        icon: "K",  color: "#fff",    bg: "#FF9900" },
  audible:     { label: "Audible",       icon: "A",  color: "#fff",    bg: "#F8991C" },
  library:     { label: "Library",       icon: "📚", color: "#fff",    bg: "#4a6741" },
  mangaplus:   { label: "Manga Plus",    icon: "M",  color: "#fff",    bg: "#E84855" },
  viz:         { label: "VIZ",           icon: "V",  color: "#fff",    bg: "#1C1C1C" },
  comixology:  { label: "ComiXology",    icon: "C",  color: "#fff",    bg: "#2A2A2A" },
  spotify:     { label: "Spotify",       icon: "S",  color: "#fff",    bg: "#1DB954" },
  apple_music: { label: "Apple Music",   icon: "♪",  color: "#fff",    bg: "#FA243C" },
  apple_pod:   { label: "Apple Podcasts",icon: "🎙", color: "#fff",    bg: "#872EC4" },
  theaters:    { label: "Theaters",      icon: "🎬", color: "#fff",    bg: "#E84855" },
  google_books:{ label: "Google Books",  icon: "G",  color: "#fff",    bg: "#4285F4" },
  bookshop:       { label: "Bookshop.org",     icon: "📚", color: "#fff", bg: "#2B8A3E" },
  apple_books:    { label: "Apple Books",       icon: "📖", color: "#fff", bg: "#FA243C" },
  amazon_books:   { label: "Amazon",            icon: "A",  color: "#fff", bg: "#FF9900" },
  youtube_music:  { label: "YouTube Music",     icon: "▶",  color: "#fff", bg: "#FF0000" },
  tidal:          { label: "Tidal",             icon: "~",  color: "#fff", bg: "#000" },
  amazon_music:   { label: "Amazon Music",      icon: "♪",  color: "#333", bg: "#25D1DA" },
  bandcamp:       { label: "Bandcamp",          icon: "B",  color: "#fff", bg: "#1DA0C3" },
  pocket_casts:   { label: "Pocket Casts",      icon: "▶",  color: "#fff", bg: "#F43E37" },
  overcast:       { label: "Overcast",          icon: "📻", color: "#fff", bg: "#FC7E0F" },
  youtube_pod:    { label: "YouTube",           icon: "▶",  color: "#fff", bg: "#FF0000" },
  gog:            { label: "GOG",               icon: "G",  color: "#fff", bg: "#86328A" },
  epic:           { label: "Epic Games",        icon: "E",  color: "#fff", bg: "#2A2A2A" },
  gamepass:       { label: "Game Pass",         icon: "G",  color: "#fff", bg: "#107C10" },
  marvel_unlimited:{ label: "Marvel Unlimited", icon: "M",  color: "#fff", bg: "#ED1D24" },
  dc_unlimited:   { label: "DC Universe",       icon: "D",  color: "#fff", bg: "#0476F2" },
  amazon_manga:   { label: "Amazon",            icon: "A",  color: "#fff", bg: "#FF9900" },
  crunchyroll:    { label: "Crunchyroll",       icon: "▶",  color: "#fff", bg: "#F47521" },
  hidive:         { label: "HiDive",            icon: "▶",  color: "#fff", bg: "#00BAFF" },
};

const ACTION_LABELS: Record<MediaType, string> = {
  movie:   "Where to Watch",
  tv:      "Where to Watch",
  book:    "Where to Read",
  manga:   "Where to Read",
  comic:   "Where to Read",
  game:    "Where to Play",
  music:   "Where to Listen",
  podcast: "Where to Listen",
};

// Platforms that have linkable URLs (non-retro, non-hardware-only)
const LINKABLE_PLATFORMS = new Set([
  "netflix", "prime", "hbo", "hulu", "apple", "disney", "theaters",
  "kindle", "audible", "library", "google_books",
  "steam", "ps5", "ps4", "ps", "xsx", "xone", "xbox", "switch", "switch2",
  "spotify", "apple_music", "apple_pod",
  "mangaplus", "viz", "comixology",
  "bookshop", "apple_books", "amazon_books", "amazon_manga",
  "youtube_music", "tidal", "amazon_music", "bandcamp",
  "pocket_casts", "overcast", "youtube_pod",
  "gog", "epic", "gamepass",
  "marvel_unlimited", "dc_unlimited",
  "crunchyroll", "hidive",
]);

interface PlatformObj {
  key: string;
  label: string;
  color: string;
  icon: string;
}

// Category grouping
const CATEGORY_CONFIG: { key: string; label: string }[] = [
  { key: "stream", label: "Stream" },
  { key: "play", label: "Play On" },
  { key: "buy", label: "Buy / Rent" },
  { key: "free", label: "Free" },
];

const PLATFORM_CATEGORIES: Record<string, string> = {
  netflix: "stream", prime: "stream", hbo: "stream", hulu: "stream",
  apple: "stream", disney: "stream", theaters: "stream",
  spotify: "stream", apple_music: "stream", apple_pod: "stream",
  viz: "stream",
  bookshop: "buy", apple_books: "buy", amazon_books: "buy", amazon_manga: "buy",
  youtube_music: "stream", tidal: "stream", amazon_music: "stream", bandcamp: "stream",
  pocket_casts: "stream", overcast: "stream", youtube_pod: "stream",
  gog: "play", epic: "play", gamepass: "stream",
  marvel_unlimited: "stream", dc_unlimited: "stream",
  crunchyroll: "stream", hidive: "stream",
  kindle: "buy", audible: "buy", comixology: "buy", google_books: "buy",
  library: "free", mangaplus: "free", browser: "free",
  steam: "play", pc: "play", mac: "play", linux: "play",
  ps5: "play", ps4: "play", ps3: "play", ps2: "play", ps1: "play", ps: "play",
  psp: "play", vita: "play",
  xsx: "play", xone: "play", x360: "play", xbox: "play",
  switch: "play", switch2: "play", wiiu: "play", wii: "play",
  gc: "play", n64: "play", snes: "play", nes: "play",
  "3ds": "play", ds: "play", gba: "play", gbc: "play", gb: "play",
  dc: "play", genesis: "play", saturn: "play", segacd: "play",
  gg: "play", sms: "play",
  ios: "play", android: "play",
  arcade: "play", stadia: "play",
  amiga: "play", c64: "play", atari2600: "play", jaguar: "play",
  dos: "play",
};

export default function PlatformButtons({
  platforms,
  mediaType,
  itemId,
  showAffiliate,
}: {
  platforms: any[];
  mediaType: MediaType;
  itemId: number | string;
  showAffiliate?: boolean;
}) {
  if (!platforms || platforms.length === 0) return null;

  const label = ACTION_LABELS[mediaType];

  // Normalize platform data — handle both string keys and object format
  const normalized: { key: string; display: { label: string; icon: string; color: string; bg: string }; hasLink: boolean }[] = [];
  const seen = new Set<string>();

  for (const p of platforms) {
    let key: string;
    let display: { label: string; icon: string; color: string; bg: string };

    if (typeof p === "string") {
      key = p;
      display = CONSOLE_STYLES[p] || { label: p, icon: "🎮", color: "#fff", bg: "#555" };
    } else if (p && typeof p === "object" && p.key) {
      key = p.key;
      display = CONSOLE_STYLES[p.key] || {
        label: p.label || p.key,
        icon: p.icon || "🎮",
        color: "#fff",
        bg: p.color || "#555",
      };
    } else {
      continue;
    }

    // Deduplicate
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ key, display, hasLink: LINKABLE_PLATFORMS.has(key) });
  }

  if (normalized.length === 0) return null;

  // Group by category
  const grouped: Record<string, typeof normalized> = {};
  for (const item of normalized) {
    const cat = PLATFORM_CATEGORIES[item.key] || "play";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  // Check if we should show grouped view (multiple categories with links) or flat
  const categoriesWithItems = CATEGORY_CONFIG.filter(c => grouped[c.key]?.length);
  const showGrouped = categoriesWithItems.length > 1 && normalized.some(n => n.hasLink);

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{
        fontFamily: "var(--font-serif)",
        fontSize: 14,
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "1px",
        marginBottom: 10,
      }}>
        {label}
      </h2>

      {showGrouped ? (
        // Grouped by category
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {categoriesWithItems.map(cat => (
            <div key={cat.key}>
              <div style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.3)",
                textTransform: "uppercase",
                letterSpacing: 1,
                fontWeight: 600,
                marginBottom: 6,
              }}>
                {cat.label}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {grouped[cat.key]!.map(({ key, display, hasLink }) => (
                  <PlatformPill
                    key={key}
                    platformKey={key}
                    display={display}
                    hasLink={hasLink}
                    itemId={itemId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat list
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {normalized.map(({ key, display, hasLink }) => (
            <PlatformPill
              key={key}
              platformKey={key}
              display={display}
              hasLink={hasLink}
              itemId={itemId}
            />
          ))}
        </div>
      )}

      {/* FTC affiliate disclosure */}
      {showAffiliate && (
        <div style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.2)",
          marginTop: 8,
          lineHeight: 1.4,
        }}>
          Some links may earn us a commission at no extra cost to you.
        </div>
      )}
    </section>
  );
}

function PlatformPill({
  platformKey,
  display,
  hasLink,
  itemId,
}: {
  platformKey: string;
  display: { label: string; icon: string; color: string; bg: string };
  hasLink: boolean;
  itemId: number | string;
}) {
  const inner = (
    <>
      <span style={{
        fontSize: display.icon.length > 1 ? 12 : 11,
        fontWeight: 900,
        color: display.color,
      }}>
        {display.icon}
      </span>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: display.color,
      }}>
        {display.label}
      </span>
      {hasLink && (
        <span style={{
          fontSize: 9,
          color: display.color,
          opacity: 0.5,
          marginLeft: 2,
        }}>
          ↗
        </span>
      )}
    </>
  );

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    background: display.bg,
    borderRadius: 8,
    transition: "transform 0.15s, box-shadow 0.15s",
    textDecoration: "none",
    cursor: hasLink ? "pointer" : "default",
  };

  const handleEnter = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = "translateY(-1px)";
    e.currentTarget.style.boxShadow = `0 4px 12px ${display.bg}55`;
  };
  const handleLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = "";
    e.currentTarget.style.boxShadow = "";
  };

  if (hasLink) {
    return (
      <a
        href={`/api/go/${itemId}/${platformKey}`}
        target="_blank"
        rel="noopener noreferrer"
        style={baseStyle}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {inner}
      </a>
    );
  }

  return (
    <div
      style={baseStyle}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {inner}
    </div>
  );
}
