/**
 * Backfill genre→vibe mapping for existing music items in the thin genres
 * (Country, Blues, Funk) that had no deriveVibes branch → empty/thin vibes →
 * near-neutral fingerprints. For music, vibes are effectively the ONLY
 * fingerprint signal (calculateItemDimensions' genre sets are film/book/game
 * genres), so a vibeless music item is invisible to cross-media matching.
 *
 * ADDITIVE-MERGE (non-regressing): adds the genre's vibes to each item's
 * EXISTING stored vibes (union, capped at 3) — never removes a vibe. Mirrors
 * the deriveVibes branches added in populate-music-list.ts. Reggae + genuinely
 * ambiguous genres (Latin/K-Pop/World) and no-genre items are intentionally
 * left neutral.
 *
 * Null-gate: sets item_dimensions = NULL on ONLY the items whose vibes change,
 * so calculate-dimensions.ts re-vectors just those (never a broad re-null).
 *
 * Run: npx tsx scripts/backfill-genre-vibes.ts   [then: npx tsx scripts/calculate-dimensions.ts]
 * Idempotent: re-running is a no-op once vibes already contain the genre's tags.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DRY = process.argv.includes('--dry-run');

// Same mappings as the deriveVibes branches in populate-music-list.ts.
const GENRE_VIBES: Record<string, string[]> = {
  country: ['Heartfelt', 'Emotional'],
  blues: ['Melancholic', 'Emotional'],
  funk: ['Uplifting', 'Stylish'],
};
const eq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// Case-INSENSITIVE dedupe, preserving each vibe's first-seen casing, capped at
// 3. Existing catalog vibes are mixed-case (some older items stored lowercase),
// so a plain Set would keep "heartfelt" AND "Heartfelt" as a duplicate and waste
// a slot. calculateItemDimensions lowercases anyway, so fingerprints are
// unaffected — this only keeps the stored vibes[] clean.
function mergeVibes(cur: string[], add: string[]): string[] {
  const out: string[] = [], seen = new Set<string>();
  for (const v of [...cur, ...add]) {
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(v);
  }
  return out.slice(0, 3);
}

async function main() {
  const music = await prisma.item.findMany({ where: { type: 'music' }, select: { id: true, genre: true, vibes: true } });
  const beforeVibeless = music.filter((m) => !((m.vibes as string[]) || []).length).length;

  let changed = 0, vibelessFixed = 0;
  const perGenre: Record<string, number> = { country: 0, blues: 0, funk: 0 };

  for (const m of music) {
    const g = new Set(((m.genre as string[]) || []).map((s) => s.toLowerCase()));
    const add: string[] = [];
    for (const k of Object.keys(GENRE_VIBES)) if (g.has(k)) add.push(...GENRE_VIBES[k]);
    if (!add.length) continue;

    const cur = (m.vibes as string[]) || [];
    const merged = mergeVibes(cur, add); // case-insensitive, non-regressing
    if (eq(cur, merged)) continue; // no change (already contains them / cap full)

    changed++;
    if (!cur.length) vibelessFixed++;
    for (const k of Object.keys(GENRE_VIBES)) if (g.has(k)) perGenre[k]++;

    if (!DRY) {
      await prisma.item.update({
        where: { id: m.id },
        data: { vibes: merged as any, itemDimensions: Prisma.DbNull }, // null-gate: re-vector just this item
      });
    }
  }

  const afterVibeless = beforeVibeless - vibelessFixed;
  console.log(`\n──────── backfill-genre-vibes (${DRY ? 'DRY' : 'LIVE'}) ────────`);
  console.log(`music items:                ${music.length}`);
  console.log(`vibeless BEFORE:            ${beforeVibeless}`);
  console.log(`items changed (re-vector):  ${changed}`);
  console.log(`  └ vibeless → vibed:       ${vibelessFixed}`);
  console.log(`  └ per genre (overlap):    Country ${perGenre.country}  Blues ${perGenre.blues}  Funk ${perGenre.funk}`);
  console.log(`vibeless AFTER:             ${afterVibeless}   (expected: Reggae-only + no-genre)`);
  console.log(DRY ? `\n(dry run — nothing written)` : `\nNow run: npx tsx scripts/calculate-dimensions.ts  (re-vectors the ${changed} null-gated items)`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
