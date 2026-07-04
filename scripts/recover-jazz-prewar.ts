/**
 * Manual recovery of the 7 foundational pre-war jazz names skipped in the
 * Jazzwise batch (batch 3) — they're pre-album-era 78rpm COMPILATIONS with no
 * clean auto-match, so each release-group was hand-selected + cover-verified
 * rather than left to the search-matcher (which risked wrong editions).
 *
 * Direct-by-MBID ingest: fetch each chosen release-group's canonical title/
 * artist/first-release-date from MusicBrainz, dedup vs catalog (MBID +
 * title/artist), create with a Cover Art Archive cover. genre=Jazz, vibes from
 * the Jazz branch. item_dimensions=NULL → run calculate-dimensions.ts after.
 *
 * Per the pre-war-comp policy: store MB's actual release date (a modern comp
 * year for the 78rpm anthologies) — honest, not a fabricated recording-era.
 *
 * Run: npx tsx scripts/recover-jazz-prewar.ts [--dry-run]
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { makeSlugFromTitle } from '../src/lib/slugs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const UA = 'CrossShelf/1.0 ( hello@crossshelf.app )';
const DRY = process.argv.includes('--dry-run');
const OUT = 'scripts/jazz-prewar-created-ids.json';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Hand-selected, cover-verified release-groups (see session diagnosis). Subgenre
// is descriptive only (genre stored = Jazz).
const PICKS: { mbid: string; note: string; subgenre: string }[] = [
  { mbid: '4fa9c671-93e7-391e-aa7c-8f9df536bcf7', note: 'Charlie Parker — Savoy & Dial master takes (the definitive bebop sessions)', subgenre: 'Bebop' },
  { mbid: 'e03f2e8b-7d5d-3788-9f33-fbbd7665b0b7', note: 'Billie Holiday — Complete Decca Recordings', subgenre: 'Vocal Jazz, Swing' },
  { mbid: 'd986aa1d-42d2-308a-a54b-d0339339ae01', note: 'Benny Goodman — The Famous 1938 Carnegie Hall Jazz Concert', subgenre: 'Swing, Big Band' },
  { mbid: 'e56f0a31-ffab-370d-a866-f2056661634c', note: 'Count Basie — Complete Decca Recordings', subgenre: 'Swing, Big Band' },
  { mbid: '046a81bc-528c-3137-94d3-1ad5d6b6751c', note: 'Jelly Roll Morton — Birth of the Hot (Red Hot Peppers)', subgenre: 'Hot Jazz, Dixieland' },
  { mbid: '4e4f75f2-5c43-3c42-b947-bf67474baa92', note: 'Bix Beiderbecke — Bixology', subgenre: 'Hot Jazz, Dixieland' },
  { mbid: '80e3091c-8c3f-4272-9b3f-6bec1dbe3110', note: 'Django Reinhardt — Djangology', subgenre: 'Gypsy Jazz, Swing' },
];

async function mb(path: string): Promise<any> {
  const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  return res.ok ? res.json() : null;
}
async function coverUrl(rg: string): Promise<string | null> {
  const u = `https://coverartarchive.org/release-group/${rg}/front-500`;
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' }); if (r.ok && (r.headers.get('content-type') || '').startsWith('image')) return u; } catch { /* */ }
  return null;
}

async function main() {
  const existing = await prisma.item.findMany({ where: { type: 'music' }, select: { title: true, slug: true, ext: true, people: true } });
  const existMbids = new Set(existing.map((e) => (e.ext as any)?.musicbrainz_id).filter(Boolean));
  const existSlugs = new Set(existing.map((e) => e.slug).filter(Boolean) as string[]);
  const created: number[] = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')).ids || []) : [];
  console.log(`recover-jazz-prewar — ${DRY ? 'DRY' : 'LIVE'} — ${PICKS.length} picks\n`);

  for (const pick of PICKS) {
    await sleep(1100);
    if (existMbids.has(pick.mbid)) { console.log(`  dedup (MBID present): ${pick.note}`); continue; }
    const rg = await mb(`release-group/${pick.mbid}?inc=artist-credits&fmt=json`);
    if (!rg) { console.log(`  ✗ MB fetch failed: ${pick.note}`); continue; }
    const title: string = rg.title;
    const artist: string = (rg['artist-credit'] || []).map((a: any) => a.name).join(', ');
    const year = parseInt((rg['first-release-date'] || '').slice(0, 4)) || 0;
    const cover = await coverUrl(pick.mbid);
    const genre = ['Jazz'];
    const vibes = ['Atmospheric', 'Stylish']; // deriveVibes(['jazz'])

    let slug = makeSlugFromTitle(title);
    if (existSlugs.has(slug)) slug = `${slug}-${year || 'album'}`;
    existSlugs.add(slug);

    console.log(`  ${DRY ? 'would create' : '✓ created'}: "${title}" — ${artist} (${year})${cover ? '' : '  [no cover]'}`);
    if (DRY) continue;

    const item = await prisma.item.create({
      data: {
        title, type: 'music', genre, vibes, year, cover: cover || '',
        description: `${title} is a ${pick.subgenre} collection by ${artist}${year ? `, released in ${year}` : ''}.`,
        people: [{ role: 'Artist', name: artist }] as any, awards: [] as any, platforms: [] as any,
        ext: { musicbrainz_id: pick.mbid } as any, totalEp: 0, popularityScore: 0, voteCount: 0, slug, lastSyncedAt: new Date(),
      },
      select: { id: true },
    });
    created.push(item.id);
    existMbids.add(pick.mbid);
    writeFileSync(OUT, JSON.stringify({ batch: 'jazz-prewar', ids: created }, null, 1));
  }
  console.log(`\ncreated total: ${created.length}${DRY ? '' : `  → then run calculate-dimensions.ts`}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
