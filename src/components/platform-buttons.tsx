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

interface PlatformObj {
  key: string;
  label: string;
  color: string;
  icon: string;
}

export default function PlatformButtons({ platforms, mediaType }: { platforms: any[]; mediaType: MediaType }) {
  if (!platforms || platforms.length === 0) return null;

  const label = ACTION_LABELS[mediaType];

  // Normalize platform data — handle both string keys and object format
  const normalized: { key: string; display: { label: string; icon: string; color: string; bg: string } }[] = [];
  const seen = new Set<string>();

  for (const p of platforms) {
    let key: string;
    let display: { label: string; icon: string; color: string; bg: string };

    if (typeof p === "string") {
      key = p;
      display = CONSOLE_STYLES[p] || { label: p, icon: "🎮", color: "#fff", bg: "#555" };
    } else if (p && typeof p === "object" && p.key) {
      key = p.key;
      // Use our curated styles if available, otherwise use IGDB data
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
    normalized.push({ key, display });
  }

  if (normalized.length === 0) return null;

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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {normalized.map(({ key, display }) => (
          <div
            key={key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              background: display.bg,
              borderRadius: 8,
              cursor: "default",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = `0 4px 12px ${display.bg}55`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.boxShadow = "";
            }}
          >
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
          </div>
        ))}
      </div>
    </section>
  );
}
