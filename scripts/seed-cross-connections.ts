/**
 * seed-cross-connections.ts
 *
 * Parses scripts/data/cross-connections-seed-data.md and inserts every
 * connection whose source AND every recommended item exist in our
 * catalog. Skips connections where any referenced item is missing.
 *
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/seed-cross-connections.ts
 * Re-run safely — dedups on (source_item_id, recommended_items fingerprint).
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Media-type normalization ─────────────────────────────────────────────────
// The seed file uses human labels that need mapping to our `items.type`.
const TYPE_MAP: Record<string, string> = {
  game: "game",
  book: "book",
  manga: "manga",
  anime: "tv", // anime in our DB is type=tv with anime flag; the seed labels will still try anime first
  "tv show": "tv",
  tv: "tv",
  movie: "movie",
  comic: "comic",
  podcast: "podcast",
  music: "music",
  album: "music",
};

function normalizeType(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  return TYPE_MAP[key] ?? null;
}

// Common title-suffix noise that shouldn't affect matching.
const TITLE_STRIP = [
  / trilogy$/i,
  / \(2018\)$/i,
  / saga$/i,
  /^the\s+/i, // tolerate missing/extra leading "The"
];

function titleVariants(raw: string): string[] {
  const t = raw.trim();
  const out = new Set<string>([t]);
  for (const re of TITLE_STRIP) out.add(t.replace(re, "").trim());
  // Also try without colon-suffix: "Attack on Titan: Final" → "Attack on Titan"
  if (t.includes(":")) out.add(t.split(":")[0].trim());
  return [...out].filter((s) => s.length > 0);
}

interface ParsedConnection {
  source: { title: string; type: string };
  recs: Array<{ title: string; type: string }>;
  theme: string;
  reason: string;
}

// Connection block format:
//   N. Source Title (type) → Rec A Title (type) → Rec B Title (type)
//      Theme: comma, separated
//      Reason: "..."
function parseConnections(text: string): ParsedConnection[] {
  const out: ParsedConnection[] = [];
  const lines = text.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // A connection block starts with a number followed by a dot.
    const m = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (!m) { i++; continue; }
    const headLine = m[2];
    // If the head line doesn't look like a connection (no arrows + no parens-type), skip.
    if (!/→|->/.test(headLine) || !/\(/.test(headLine)) { i++; continue; }

    const parts = headLine.split(/→|->/).map((p) => p.trim()).filter(Boolean);
    const parsed = parts.map((p) => {
      // "Dark Souls (game)"
      const tm = p.match(/^(.+)\s+\(([^)]+)\)\s*$/);
      if (!tm) return null;
      return { title: tm[1].trim(), typeRaw: tm[2].trim() };
    });
    if (parsed.some((x) => !x)) { i++; continue; }
    const [src, ...recs] = parsed as Array<{ title: string; typeRaw: string }>;

    // Gather theme + reason from following lines until the next numbered block.
    let theme = "";
    let reason = "";
    let j = i + 1;
    while (j < lines.length && !/^\s*\d+\.\s+/.test(lines[j])) {
      const tline = lines[j].trim();
      const themeMatch = tline.match(/^Theme:\s*(.+)$/i);
      const reasonMatch = tline.match(/^Reason:\s*["“](.+?)["”]?\s*$/i) || tline.match(/^Reason:\s*(.+)$/i);
      if (themeMatch) theme = themeMatch[1].trim();
      if (reasonMatch) reason = reasonMatch[1].replace(/^["“]|["”]$/g, "").trim();
      j++;
    }

    const srcType = normalizeType(src.typeRaw);
    if (!srcType || !reason) { i = j; continue; }
    const recsTyped: Array<{ title: string; type: string }> = [];
    for (const r of recs) {
      const rt = normalizeType(r.typeRaw);
      if (!rt) break;
      recsTyped.push({ title: r.title, type: rt });
    }
    if (recsTyped.length !== recs.length) { i = j; continue; }

    out.push({
      source: { title: src.title, type: srcType },
      recs: recsTyped,
      theme,
      reason,
    });
    i = j;
  }
  return out;
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  const mdPath = join(process.cwd(), "scripts/data/cross-connections-seed-data.md");
  const text = readFileSync(mdPath, "utf8");
  const parsed = parseConnections(text);
  console.log(`Parsed ${parsed.length} connections from markdown.`);

  // Build an item lookup by (type, lowercase-title) with a few variants.
  console.log("Loading catalog for matching...");
  const allItems = await prisma.item.findMany({
    where: { parentItemId: null },
    select: { id: true, title: true, type: true },
  });
  console.log(`Catalog: ${allItems.length} items.`);

  const byKey = new Map<string, { id: number; title: string; type: string }>();
  for (const it of allItems) {
    const variants = titleVariants(it.title);
    for (const v of variants) {
      const key = `${it.type}::${v.toLowerCase()}`;
      // Don't overwrite — first (canonical-title) match wins.
      if (!byKey.has(key)) byKey.set(key, it);
    }
  }

  function findItem(title: string, type: string): { id: number; title: string; type: string } | null {
    const variants = titleVariants(title);
    // For "anime" entries normalized to "tv": also try type=tv and fallback to manga (since some connections mislabel).
    const typesToTry = [type];
    if (type === "tv") typesToTry.push("manga"); // very soft fallback for anime/manga confusion
    for (const t of typesToTry) {
      for (const v of variants) {
        const hit = byKey.get(`${t}::${v.toLowerCase()}`);
        if (hit) return hit;
      }
    }
    return null;
  }

  let imported = 0;
  let skipped = 0;
  const missingExamples: string[] = [];

  for (const c of parsed) {
    const src = findItem(c.source.title, c.source.type);
    if (!src) {
      skipped++;
      if (missingExamples.length < 10) missingExamples.push(`src ${c.source.type}/"${c.source.title}"`);
      continue;
    }
    const recs = c.recs.map((r) => ({ raw: r, item: findItem(r.title, r.type) }));
    if (recs.some((r) => !r.item)) {
      skipped++;
      const miss = recs.find((r) => !r.item)!;
      if (missingExamples.length < 10) missingExamples.push(`rec ${miss.raw.type}/"${miss.raw.title}"`);
      continue;
    }

    const recommendedItems = recs.map((r) => ({
      item_id: r.item!.id,
      title: r.item!.title,
      type: r.item!.type,
    }));
    const themeTags = c.theme
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    // Idempotency: skip if an identical source + first-rec already exists.
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM cross_connections WHERE source_item_id = $1 AND (recommended_items->0->>'item_id')::int = $2 LIMIT 1`,
      src.id,
      recommendedItems[0].item_id,
    );
    if (existing.length > 0) {
      // Already seeded; count as imported for reporting purposes.
      imported++;
      continue;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO cross_connections
         (source_item_id, recommended_items, reason, theme_tags, created_by, quality_score)
       VALUES ($1, $2::jsonb, $3, $4, 'editorial', 1.0)`,
      src.id,
      JSON.stringify(recommendedItems),
      c.reason,
      themeTags,
    );
    imported++;
  }

  console.log(`\n════════════════════════════════════`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped:  ${skipped}  (source or recommended item not in catalog)`);
  if (missingExamples.length > 0) {
    console.log(`\nSample missing items (first ${missingExamples.length}):`);
    missingExamples.forEach((m) => console.log(`  - ${m}`));
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
