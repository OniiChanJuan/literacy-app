/**
 * Music-list ingestion — reusable, seed-driven (supersedes the one-off
 * populate-music-canon.ts pilot). Same locked source policy: MusicBrainz
 * primary (UA header, ~1 req/s, 503 backoff), Cover Art Archive covers, NO
 * Spotify, Last.fm only if keyed (absent → skipped). New items get a dash for
 * the CrossShelf Score (no critic score; popularity excluded).
 *
 * Seed JSON: { albums: [{ album, artist, year, genre, subgenre }] }. The seed
 * `year` (the known ORIGINAL release year) is used both as a strong match
 * signal — prefer the release-group whose first-release-date matches it — and
 * to flag reissue/remaster mismatches in the report. Genre comes from the seed
 * (so only ONE MusicBrainz call per album: the search).
 *
 * New items insert with item_dimensions = NULL (SQL NULL); run
 * calculate-dimensions.ts afterward. Idempotent: re-running skips items already
 * in the catalog (dedup by title+artist) and merges created ids.
 *
 * Run: npx tsx scripts/populate-music-list.ts --seed=scripts/seeds/rolling-stone-500.json --batch=rs500 [--dry-run] [--limit=N]
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
const argOf = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const SEED_PATH = argOf('seed')!;
const BATCH = argOf('batch') || 'music-list';
const LIMIT = parseInt(argOf('limit') || '0') || 0;
const OUT = `scripts/${BATCH}-created-ids.json`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Seed { album: string; artist: string; year: number; genre: string; subgenre: string; }

const GENRE_KEYWORDS: [string, string][] = [
  ['hip hop', 'Hip-Hop'], ['hip-hop', 'Hip-Hop'], ['rap', 'Hip-Hop'], ['r&b', 'R&B'], ['rnb', 'R&B'],
  ['soul', 'Soul'], ['funk', 'Funk'], ['jazz', 'Jazz'], ['classical', 'Classical'], ['reggae', 'Reggae'],
  ['electronic', 'Electronic'], ['house', 'Electronic'], ['techno', 'Electronic'], ['ambient', 'Ambient'], ['disco', 'Disco'],
  ['art rock', 'Alternative'], ['alternative', 'Alternative'], ['indie', 'Indie'], ['shoegaze', 'Shoegaze'],
  ['punk', 'Punk'], ['metal', 'Metal'], ['rock', 'Rock'], ['blues', 'Blues'],
  ['art pop', 'Pop'], ['synth', 'Pop'], ['pop', 'Pop'], ['country', 'Country'], ['folk', 'Folk'],
];
function mapGenres(...parts: string[]): string[] {
  const text = parts.join(', ');
  const tokens = text.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const tok of tokens) { const low = tok.toLowerCase(); for (const [kw, g] of GENRE_KEYWORDS) { if (low.includes(kw)) { out.add(g); break; } } }
  return [...out].slice(0, 4);
}
function deriveVibes(genres: string[]): string[] {
  const v: string[] = []; const g = new Set(genres.map((s) => s.toLowerCase()));
  if (g.has('electronic') || g.has('ambient')) v.push('Atmospheric', 'Immersive');
  if (g.has('metal') || g.has('punk')) v.push('Intense', 'Dark');
  if (g.has('r&b') || g.has('soul')) v.push('Emotional', 'Stylish');
  if (g.has('hip-hop')) v.push('Intense', 'Stylish');
  if (g.has('jazz')) v.push('Atmospheric', 'Stylish');
  if (g.has('classical')) v.push('Immersive', 'Epic');
  if (g.has('indie') || g.has('folk') || g.has('shoegaze')) v.push('Melancholic', 'Heartfelt');
  if (g.has('pop') || g.has('disco')) v.push('Uplifting');
  if (g.has('rock') || g.has('alternative')) v.push('Intense', 'Epic');
  return [...new Set(v)].slice(0, 3);
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function firstArtist(people: any): string {
  if (!Array.isArray(people)) return '';
  return (people.find((p) => /artist/i.test(p.role || '')) || people[0])?.name || '';
}

let lastMb = 0;
async function mb(path: string, retries = 0): Promise<any> {
  const wait = 1100 - (Date.now() - lastMb);
  if (wait > 0) await sleep(wait);
  lastMb = Date.now();
  let res: Response;
  try { res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); }
  catch { if (retries < 3) { await sleep(1500); return mb(path, retries + 1); } return null; }
  if (res.status === 503) { if (retries < 5) { await sleep(2500); return mb(path, retries + 1); } return null; }
  if (!res.ok) return null;
  return res.json();
}
async function coverUrl(rgMbid: string): Promise<string | null> {
  const stable = `https://coverartarchive.org/release-group/${rgMbid}/front-500`;
  try { const res = await fetch(stable, { headers: { 'User-Agent': UA }, redirect: 'follow' }); if (res.ok && (res.headers.get('content-type') || '').startsWith('image')) return stable; } catch { /* */ }
  return null;
}

const REISSUE_RE = /\b(deluxe|remaster|remastered|anniversary|expanded|edition|reissue|mono version|stereo version|live|demos?|instrumental|karaoke|super deluxe)\b/i;

async function main() {
  const seedFile = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  let albums: Seed[] = seedFile.albums || seedFile;
  if (LIMIT) albums = albums.slice(0, LIMIT);
  console.log(`${BATCH} — ${DRY ? 'DRY RUN' : 'LIVE'} — ${albums.length} seed albums from ${SEED_PATH}\n`);

  const before = await prisma.item.count({ where: { type: 'music' } });
  const existing = await prisma.item.findMany({ where: { type: 'music' }, select: { title: true, slug: true, people: true } });
  const existingKeys = new Set(existing.map((e) => `${norm(e.title)}|${norm(firstArtist(e.people))}`));
  const existingSlugs = new Set(existing.map((e) => e.slug).filter(Boolean) as string[]);
  const created: number[] = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')).ids || []) : [];
  console.log(`existing music: ${before}  (already-recorded created ids: ${created.length})\n`);

  const mbMissing: string[] = [], deduped: string[] = [], noCover: string[] = [], lowConf: string[] = [], yearFlag: string[] = [];
  let withCover = 0, processed = 0, i = 0;

  for (const seed of albums) {
    i++;
    const { album, artist, year: csvYear } = seed;
    if (existingKeys.has(`${norm(album)}|${norm(artist)}`)) { deduped.push(`${album} — ${artist}`); continue; }

    // Clean the CSV's display formatting for the MB query: drop embedded
    // double-quotes ('The Beatles ("The White Album")') and take the first
    // artist before a slash ('John Lennon / Plastic Ono Band' → 'John Lennon').
    const qAlbum = album.replace(/["""]/g, '').trim();
    const qArtist = artist.replace(/["""]/g, '').split(/\s*\/\s*/)[0].trim();
    // limit=20: with many same-titled release-groups (e.g. several self-titled
    // "Santana" reissues/comps), a small limit can omit the original edition
    // from the candidate pool, so the year-bonus below can't pick it. A wider
    // pool + the year signal makes reissue-matching robust at scale.
    const search = await mb(`release-group/?query=${encodeURIComponent(`releasegroup:"${qAlbum}" AND artist:"${qArtist}"`)}&fmt=json&limit=20`);
    const rgs: any[] = search?.['release-groups'] || [];
    if (!rgs.length) { mbMissing.push(`${album} — ${artist}`); continue; }

    const matchScore = (r: any): number => {
      const ca = (r['artist-credit'] || []).map((a: any) => a.name).join(', ');
      const artistOk = norm(ca).includes(norm(artist)) || norm(artist).includes(norm(ca));
      if (!artistOk || (r.score ?? 0) < 88) return -1;
      let s = 0;
      if (norm(r.title) === norm(album)) s += 1000;
      else if (norm(r.title).includes(norm(album))) s += 100;
      if (r['primary-type'] === 'Album') s += 50;
      if (!(r['secondary-types']?.length)) s += 25;
      if (REISSUE_RE.test(r.title)) s -= 300; // demote deluxe/remaster/live titles
      const y = parseInt((r['first-release-date'] || '9999').slice(0, 4)) || 9999;
      if (csvYear) { const d = Math.abs(y - csvYear); if (d <= 1) s += 400; else if (d <= 3) s += 100; } // prefer the known original year
      return s - y / 100; // tiebreak: earliest
    };
    const ranked = rgs.map((r) => ({ r, s: matchScore(r) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
    if (!ranked.length) { lowConf.push(`${album} — ${artist}`); continue; }
    const best = ranked[0].r;
    const mbTitle: string = best.title;
    const mbArtist: string = (best['artist-credit'] || []).map((a: any) => a.name).join(', ');
    const mbYear = parseInt((best['first-release-date'] || '').slice(0, 4)) || 0;
    if (existingKeys.has(`${norm(mbTitle)}|${norm(mbArtist)}`)) { deduped.push(`${album} — ${artist} (as "${mbTitle}")`); continue; }

    if (csvYear && mbYear && Math.abs(mbYear - csvYear) > 2) yearFlag.push(`${mbTitle} — ${mbArtist}: MB ${mbYear} vs list ${csvYear}`);

    const genre = mapGenres(seed.genre, seed.subgenre);
    const vibes = deriveVibes(genre);
    const cover = await coverUrl(best.id);
    if (cover) withCover++; else noCover.push(`${mbTitle} — ${mbArtist}`);
    processed++;

    let slug = makeSlugFromTitle(mbTitle);
    if (existingSlugs.has(slug)) slug = `${slug}-${mbYear || 'album'}`;
    let n = 2; while (existingSlugs.has(slug)) slug = `${makeSlugFromTitle(mbTitle)}-${mbYear}-${n++}`;
    existingSlugs.add(slug);

    if (i % 25 === 0) console.log(`  …${i}/${albums.length}  created=${created.length}`);

    if (!DRY) {
      const item = await prisma.item.create({
        data: {
          title: mbTitle, type: 'music', genre, vibes, year: mbYear, cover: cover || '',
          description: `${mbTitle} is an album by ${mbArtist}${mbYear ? `, released in ${mbYear}` : ''}.`,
          people: [{ role: 'Artist', name: mbArtist }] as any, awards: [] as any, platforms: [] as any,
          ext: { musicbrainz_id: best.id } as any, totalEp: 0, popularityScore: 0, voteCount: 0, slug, lastSyncedAt: new Date(),
        },
        select: { id: true },
      });
      created.push(item.id);
      existingKeys.add(`${norm(mbTitle)}|${norm(mbArtist)}`);
      writeFileSync(OUT, JSON.stringify({ batch: BATCH, ids: created }, null, 1)); // incremental, resumable
    }
  }

  const after = DRY ? before : await prisma.item.count({ where: { type: 'music' } });
  console.log(`\n──────── ${BATCH} SUMMARY (${DRY ? 'dry' : 'live'}) ────────`);
  console.log(`seed albums:            ${albums.length}`);
  console.log(`already in catalog:     ${deduped.length}`);
  console.log(`MB no match:            ${mbMissing.length}`);
  console.log(`low confidence:         ${lowConf.length}`);
  console.log(`matched & ingestible:   ${processed}`);
  console.log(`  └ with cover:         ${withCover}  (${processed ? Math.round((withCover / processed) * 100) : 0}%)`);
  console.log(`  └ no cover:           ${noCover.length}`);
  console.log(`year/reissue flags:     ${yearFlag.length}`);
  console.log(`created total (rows):   ${created.length}`);
  console.log(`music count: ${before} → ${after}`);
  if (mbMissing.length) console.log(`\nMB missing:\n  ${mbMissing.join('\n  ')}`);
  if (lowConf.length) console.log(`\nlow confidence:\n  ${lowConf.join('\n  ')}`);
  if (yearFlag.length) console.log(`\n⚠ year/reissue flags (spot-check these):\n  ${yearFlag.join('\n  ')}`);
  if (noCover.length) console.log(`\nno cover:\n  ${noCover.join('\n  ')}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
