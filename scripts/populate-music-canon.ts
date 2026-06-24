/**
 * Music canon ingestion — pilot batch (MusicBrainz primary; Cover Art Archive
 * for covers). Adds a curated set of canonical albums the catalog is missing.
 *
 * Source policy (locked): MusicBrainz catalog (User-Agent header, ~1 req/s,
 * back off on 503). Covers from the Cover Art Archive. NO Spotify. Last.fm
 * popularity only if LASTFM_API_KEY is set (it isn't → skipped). Popularity
 * never feeds the CrossShelf Score, so these items carry no ext score and show
 * a dash until a real critic score (e.g. Pitchfork) is ingested later.
 *
 * New items insert with item_dimensions = NULL (SQL NULL); run
 * `npx tsx scripts/calculate-dimensions.ts` afterward to vector them.
 *
 * Run:  npx tsx scripts/populate-music-canon.ts --dry-run   (no writes; report)
 *       npx tsx scripts/populate-music-canon.ts             (ingest)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { writeFileSync } from 'fs';
import { makeSlugFromTitle } from '../src/lib/slugs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const UA = 'CrossShelf/1.0 ( hello@crossshelf.app )';
const DRY = process.argv.includes('--dry-run');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Curated canonical seed (album, artist) — pilot tier drawn from the
// consensus canon (Pitchfork / Rolling Stone 500 / AOTY top tiers). Year +
// clean title come from MusicBrainz. ──────────────────────────────────────────
const SEED: [string, string][] = [
  ['To Pimp a Butterfly', 'Kendrick Lamar'], ['good kid, m.A.A.d city', 'Kendrick Lamar'],
  ['Blonde', 'Frank Ocean'], ['Channel Orange', 'Frank Ocean'],
  ['My Beautiful Dark Twisted Fantasy', 'Kanye West'],
  ['Kid A', 'Radiohead'], ['In Rainbows', 'Radiohead'], ['OK Computer', 'Radiohead'],
  ['The Dark Side of the Moon', 'Pink Floyd'],
  ['Abbey Road', 'The Beatles'], ['Revolver', 'The Beatles'],
  ['Pet Sounds', 'The Beach Boys'], ['Rumours', 'Fleetwood Mac'],
  ['Thriller', 'Michael Jackson'], ['Purple Rain', 'Prince'], ['Nevermind', 'Nirvana'],
  ['Illmatic', 'Nas'], ['The Miseducation of Lauryn Hill', 'Lauryn Hill'],
  ['Ready to Die', 'The Notorious B.I.G.'], ['Enter the Wu-Tang (36 Chambers)', 'Wu-Tang Clan'],
  ['Madvillainy', 'Madvillain'], ['Aquemini', 'OutKast'], ['The Blueprint', 'JAY-Z'],
  ['Songs in the Key of Life', 'Stevie Wonder'], ["What's Going On", 'Marvin Gaye'],
  ['Blood on the Tracks', 'Bob Dylan'], ['Highway 61 Revisited', 'Bob Dylan'],
  ['London Calling', 'The Clash'], ['The Velvet Underground & Nico', 'The Velvet Underground'],
  ['Remain in Light', 'Talking Heads'], ['Unknown Pleasures', 'Joy Division'],
  ['Loveless', 'My Bloody Valentine'], ['Doolittle', 'Pixies'],
  ['The Queen Is Dead', 'The Smiths'], ['Disintegration', 'The Cure'],
  ['Graceland', 'Paul Simon'], ['Back to Black', 'Amy Winehouse'],
  ['Discovery', 'Daft Punk'], ['Random Access Memories', 'Daft Punk'],
  ['Funeral', 'Arcade Fire'], ['Sound of Silver', 'LCD Soundsystem'],
  ['Is This It', 'The Strokes'], ['Currents', 'Tame Impala'], ['Lonerism', 'Tame Impala'],
  ['Norman Fucking Rockwell!', 'Lana Del Rey'], ['IGOR', 'Tyler, the Creator'],
  ['Lemonade', 'Beyoncé'], ['A Seat at the Table', 'Solange'],
  ['Punisher', 'Phoebe Bridgers'], ['Carrie & Lowell', 'Sufjan Stevens'],
];

// ── MusicBrainz genre/tag → app genre, and genre → vibes (mirrors seed-music) ─
const GENRE_KEYWORDS: [string, string][] = [
  ['hip hop', 'Hip-Hop'], ['rap', 'Hip-Hop'], ['r&b', 'R&B'], ['rnb', 'R&B'],
  ['soul', 'Soul'], ['funk', 'Funk'], ['jazz', 'Jazz'], ['classical', 'Classical'],
  ['electronic', 'Electronic'], ['house', 'Electronic'], ['techno', 'Electronic'], ['ambient', 'Ambient'],
  ['art rock', 'Alternative'], ['alternative', 'Alternative'], ['indie', 'Indie'],
  ['punk', 'Punk'], ['metal', 'Metal'], ['rock', 'Rock'],
  ['art pop', 'Pop'], ['synth', 'Pop'], ['pop', 'Pop'],
  ['folk', 'Folk'], ['country', 'Country'], ['blues', 'Blues'],
  ['shoegaze', 'Shoegaze'], ['experimental', 'Experimental'], ['singer-songwriter', 'Folk'],
];
function mapGenres(mb: string[]): string[] {
  const out = new Set<string>();
  for (const raw of mb) {
    const low = raw.toLowerCase();
    for (const [kw, g] of GENRE_KEYWORDS) { if (low.includes(kw)) { out.add(g); break; } }
    if (out.size >= 4) break;
  }
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
  if (g.has('pop')) v.push('Uplifting');
  if (g.has('rock') || g.has('alternative')) v.push('Intense', 'Epic');
  return [...new Set(v)].slice(0, 3); // empty is fine — honest-neutral
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function firstArtist(people: any): string {
  if (!Array.isArray(people)) return '';
  const a = people.find((p) => /artist/i.test(p.role || '')) || people[0];
  return a?.name || '';
}

// ── MusicBrainz fetch — UA header, >=1.1s spacing, 503 backoff ───────────────
let lastMb = 0;
async function mb(path: string, retries = 0): Promise<any> {
  const wait = 1100 - (Date.now() - lastMb);
  if (wait > 0) await sleep(wait);
  lastMb = Date.now();
  let res: Response;
  try { res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); }
  catch { if (retries < 3) { await sleep(1500); return mb(path, retries + 1); } return null; }
  if (res.status === 503) { if (retries < 4) { console.log('   503 — backing off 2.5s'); await sleep(2500); return mb(path, retries + 1); } return null; }
  if (!res.ok) return null;
  return res.json();
}

/** Cover Art Archive — returns the stable coverartarchive.org URL if a front
 *  cover exists (which redirects to *.archive.org, allowed by the CSP). */
async function coverUrl(rgMbid: string): Promise<string | null> {
  const stable = `https://coverartarchive.org/release-group/${rgMbid}/front-500`;
  try {
    const res = await fetch(stable, { method: 'GET', headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (res.ok && (res.headers.get('content-type') || '').startsWith('image')) return stable;
  } catch { /* ignore */ }
  return null;
}

async function main() {
  console.log(`Music canon ingestion — ${DRY ? 'DRY RUN (no writes)' : 'LIVE'}\n`);
  const before = await prisma.item.count({ where: { type: 'music' } });
  const existing = await prisma.item.findMany({ where: { type: 'music' }, select: { id: true, title: true, slug: true, people: true } });
  const existingKeys = new Set(existing.map((e) => `${norm(e.title)}|${norm(firstArtist(e.people))}`));
  const existingSlugs = new Set(existing.map((e) => e.slug).filter(Boolean) as string[]);
  console.log(`existing music items: ${before}\n`);

  const created: number[] = [];
  const mbMissing: string[] = [], deduped: string[] = [], noCover: string[] = [], lowConfidence: string[] = [];
  let withCover = 0;

  for (const [album, artist] of SEED) {
    const seedKey = `${norm(album)}|${norm(artist)}`;
    if (existingKeys.has(seedKey)) { deduped.push(`${album} — ${artist}`); continue; }

    const search = await mb(`release-group/?query=${encodeURIComponent(`releasegroup:"${album}" AND artist:"${artist}"`)}&fmt=json&limit=6`);
    const rgs: any[] = search?.['release-groups'] || [];
    if (!rgs.length) { mbMissing.push(`${album} — ${artist}`); continue; }
    // Rank candidates: exact title > contains-title; studio Album > other;
    // earliest first-release-date wins (avoids reissues/demos like the 2020
    // "Purple Rain Debut" beating the 1984 album). Artist must match.
    const matchScore = (r: any): number => {
      const ca = (r['artist-credit'] || []).map((a: any) => a.name).join(', ');
      const artistOk = norm(ca).includes(norm(artist)) || norm(artist).includes(norm(ca));
      if (!artistOk || (r.score ?? 0) < 88) return -1;
      let s = 0;
      if (norm(r.title) === norm(album)) s += 1000;
      else if (norm(r.title).includes(norm(album))) s += 100;
      if (r['primary-type'] === 'Album') s += 50;
      if (!(r['secondary-types']?.length)) s += 25; // studio (no live/comp/soundtrack)
      const y = parseInt((r['first-release-date'] || '9999').slice(0, 4)) || 9999;
      return s - y / 100; // earliest original wins
    };
    const ranked = rgs.map((r) => ({ r, s: matchScore(r) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
    if (!ranked.length) { lowConfidence.push(`${album} — ${artist} (no confident match)`); continue; }
    const best = ranked[0].r;

    const mbTitle: string = best.title;
    const mbArtist: string = (best['artist-credit'] || []).map((a: any) => a.name).join(', ');
    const year = parseInt((best['first-release-date'] || '').slice(0, 4)) || 0;

    const mbKey = `${norm(mbTitle)}|${norm(mbArtist)}`;
    if (existingKeys.has(mbKey)) { deduped.push(`${album} — ${artist} (as "${mbTitle}")`); continue; }

    const lookup = await mb(`release-group/${best.id}?inc=genres+tags&fmt=json`);
    const mbGenres: string[] = (lookup?.genres || []).sort((a: any, b: any) => b.count - a.count).map((g: any) => g.name);
    const genre = mapGenres(mbGenres);
    const vibes = deriveVibes(genre);
    const cover = await coverUrl(best.id);
    if (cover) withCover++; else noCover.push(`${mbTitle} — ${mbArtist}`);

    // Unique slug among music.
    let slug = makeSlugFromTitle(mbTitle);
    if (existingSlugs.has(slug)) slug = `${slug}-${year || 'album'}`;
    let n = 2; while (existingSlugs.has(slug)) slug = `${makeSlugFromTitle(mbTitle)}-${year}-${n++}`;
    existingSlugs.add(slug);

    const desc = `${mbTitle} is an album by ${mbArtist}${year ? `, released in ${year}` : ''}.`;
    console.log(`  ${cover ? '🖼' : '··'} "${mbTitle}" — ${mbArtist} (${year})  [${genre.join(', ') || 'no genre'}]`);

    if (!DRY) {
      const item = await prisma.item.create({
        data: {
          title: mbTitle, type: 'music', genre, vibes, year, cover: cover || '',
          description: desc, people: [{ role: 'Artist', name: mbArtist }] as any,
          awards: [] as any, platforms: [] as any, ext: { musicbrainz_id: best.id } as any,
          totalEp: 0, popularityScore: 0, voteCount: 0, slug, lastSyncedAt: new Date(),
          // item_dimensions omitted → SQL NULL → calculate-dimensions vectors it.
        },
        select: { id: true },
      });
      created.push(item.id);
      existingKeys.add(mbKey);
    }
  }

  if (!DRY && created.length) {
    writeFileSync('scripts/music-canon-created-ids.json', JSON.stringify({ batch: 'music-canon-pilot', ids: created }, null, 2));
  }
  const after = DRY ? before : await prisma.item.count({ where: { type: 'music' } });

  const attempted = SEED.length;
  console.log(`\n──────── SUMMARY (${DRY ? 'dry-run' : 'live'}) ────────`);
  console.log(`seed albums:            ${attempted}`);
  console.log(`already in catalog:     ${deduped.length}  (deduped)`);
  console.log(`MB no match:            ${mbMissing.length}`);
  console.log(`low confidence skipped: ${lowConfidence.length}`);
  const processed = attempted - deduped.length - mbMissing.length - lowConfidence.length;
  console.log(`matched & ingestible:   ${processed}`);
  console.log(`  └ with cover:         ${withCover}  (${processed ? Math.round((withCover / processed) * 100) : 0}% cover coverage)`);
  console.log(`  └ NO cover:           ${noCover.length}`);
  console.log(`created (rows):         ${created.length}`);
  console.log(`music count: ${before} → ${after}`);
  if (deduped.length) console.log(`\ndeduped:\n  ${deduped.join('\n  ')}`);
  if (mbMissing.length) console.log(`\nMB missing:\n  ${mbMissing.join('\n  ')}`);
  if (lowConfidence.length) console.log(`\nlow confidence:\n  ${lowConfidence.join('\n  ')}`);
  if (noCover.length) console.log(`\nno cover:\n  ${noCover.join('\n  ')}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
