import { Vibrant } from "node-vibrant/node";

interface ExtractedColors {
  primary: string;
  secondary: string;
}

/**
 * Convert hex to HSL, clamp brightness/saturation, convert back to hex.
 * - Cap lightness at 50% if above 70%
 * - Cap saturation at 60% if above 80%
 */
function safeColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  // Clamp
  if (l > 0.7) l = 0.5;
  if (s > 0.8) s = 0.6;

  // HSL to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r2: number, g2: number, b2: number;
  if (s === 0) {
    r2 = g2 = b2 = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r2 = hue2rgb(p, q, h + 1 / 3);
    g2 = hue2rgb(p, q, h);
    b2 = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

/**
 * Extract dominant + secondary color from an image URL.
 * Returns null if extraction fails.
 */
export async function extractColorsFromUrl(imageUrl: string): Promise<ExtractedColors | null> {
  try {
    const palette = await Vibrant.from(imageUrl).getPalette();

    // Pick primary: Vibrant > Muted > DarkVibrant > DarkMuted
    const primary = palette.Vibrant || palette.Muted || palette.DarkVibrant || palette.DarkMuted;
    // Pick secondary: DarkMuted > DarkVibrant > Muted > LightMuted
    const secondary = palette.DarkMuted || palette.DarkVibrant || palette.Muted || palette.LightMuted;

    if (!primary) return null;

    const primaryHex = primary.hex;
    const secondaryHex = secondary?.hex || primaryHex;

    return {
      primary: safeColor(primaryHex),
      secondary: safeColor(secondaryHex),
    };
  } catch {
    return null;
  }
}
