/**
 * Discography-depth pass — CALIBRATION build.
 *
 * For artists already in the catalog, add their other notable albums. Walks
 * each artist's MusicBrainz release-GROUPS (reissues/remasters collapse to one
 * RG, so the reissue swamp is sidestepped) and applies a PLUGGABLE notability
 * gate: an RG is ingested iff no EXCLUSION fires AND ≥1 NOTABILITY condition
 * passes. Both are extensible arrays — add conditions later without a rewrite.
 *
 * Artist identity is resolved from an EXISTING catalog album's stored RG-MBID
 * (authoritative — no fuzzy name search), so we never walk the wrong artist.
 *
 * Genre is inherited from the artist's existing catalog items; vibes derived
 * from it. item_dimensions=NULL → run calculate-dimensions.ts after.
 *
 * Run: npx tsx scripts/discography-depth.ts [--dry-run] [--limit=N]
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
const LIMIT = parseInt(argOf('limit') || '0') || 0;
const OUT = 'scripts/discography-depth-created-ids.json';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const firstArtist = (people: any): string => Array.isArray(people) ? ((people.find((p) => /artist/i.test(p.role || '')) || people[0])?.name || '') : '';

// ── Calibration slice: 20 metal artists spanning notability tiers ──────────
const SLICE = [
  // mega (deep catalogs, huge live/comp noise — edition-risk test)
  'Metallica', 'Iron Maiden', 'Black Sabbath', 'Megadeth', 'Slayer', 'Judas Priest',
  // mid
  'Opeth', 'Mastodon', 'Meshuggah', 'Sepultura', 'Deftones', 'Tool', 'Death', 'Gojira',
  // cult (gate-floor test)
  'Diamond Head', 'Mercyful Fate', 'Bathory', 'Darkthrone', 'Mayhem', 'Celtic Frost',
];

const REISSUE_RE = /\b(deluxe|remaster|remastered|anniversary|expanded|edition|reissue|mono version|stereo version|demos?|karaoke|super deluxe|box set|bonus)\b/i;
const NOISE_SECONDARY = new Set(['Compilation', 'Remix', 'DJ-mix', 'Mixtape/Street', 'Interview', 'Audiobook', 'Soundtrack', 'Spokenword', 'Demo']);

interface RG { id: string; title: string; primaryType: string | null; secondaryTypes: string[]; year: number; ratingVotes: number; }

// ── PLUGGABLE notability gate ──────────────────────────────────────────────
// qualifies iff NO exclusion fires AND ≥1 notability condition passes.
type Ctx = { existingMbids: Set<string>; isDupTitle: (t: string) => boolean };

const NOTABILITY: { name: string; test: (rg: RG) => boolean }[] = [
  // v1 conditions — extend later (on-acclaim-list, completes-franchise, in-corpus, demand-signal, notable-debut, …).
  // Studio-albumhood is the always-on notability signal (MB ratings proved too
  // sparse to gate on). Live albums are handled by DEFINITIVE_LIVE below — NOT
  // blanket-skipped, but capped so a prolific band's whole live catalog (rated
  // on MB) doesn't leak in; only its single best-rated live album qualifies.
  { name: 'studio-album', test: (rg) => rg.primaryType === 'Album' && rg.secondaryTypes.length === 0 },
];
// At most one live album per artist: the highest-voted, and only if genuinely rated.
const DEFINITIVE_LIVE = { minVotes: 3 };

const CUR_YEAR = 2026;
const EXCLUSIONS: { name: string; test: (rg: RG, ctx: Ctx) => boolean }[] = [
  { name: 'dedup', test: (rg, ctx) => ctx.existingMbids.has(rg.id) || ctx.isDupTitle(rg.title) },
  { name: 'not-album-form', test: (rg) => rg.primaryType !== 'Album' }, // drop Single/EP/Broadcast/Other from this pass
  { name: 'comp-remix-demo-etc', test: (rg) => rg.secondaryTypes.some((t) => NOISE_SECONDARY.has(t)) },
  { name: 'split-or-future', test: (rg) => / \/ /.test(rg.title) || rg.year > CUR_YEAR + 1 }, // splits (two-artist) + bogus future dates
  { name: 'reissue-title', test: (rg) => REISSUE_RE.test(rg.title) || /:\s*original\b/i.test(rg.title) }, // + ": Original" reissue suffix (Goatlord: Original)
];
// require-cover lever (on by default): drop the peripheral no-cover releases MB
// mislabels as "Album" (livestreams/outtakes/bootlegs) — the no-cover signal
// flags them cleanly. --allow-no-cover to disable.
const REQUIRE_COVER = !process.argv.includes('--allow-no-cover');

async function mb(path: string, retries = 0): Promise<any> {
  await sleep(1100);
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 503 && retries < 4) { await sleep(2500); return mb(path, retries + 1); }
    return res.ok ? res.json() : null;
  } catch { if (retries < 3) return mb(path, retries + 1); return null; }
}
async function coverUrl(rg: string): Promise<string | null> {
  const u = `https://coverartarchive.org/release-group/${rg}/front-500`;
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' }); if (r.ok && (r.headers.get('content-type') || '').startsWith('image')) return u; } catch { /* */ }
  return null;
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
  if (g.has('country')) v.push('Heartfelt', 'Emotional');
  if (g.has('blues')) v.push('Melancholic', 'Emotional');
  if (g.has('funk')) v.push('Uplifting', 'Stylish');
  return [...new Set(v)].slice(0, 3);
}

async function main() {
  const music = await prisma.item.findMany({ where: { type: 'music' }, select: { id: true, title: true, genre: true, people: true, ext: true, slug: true } });
  const allMbids = new Set(music.map((m) => (m.ext as any)?.musicbrainz_id).filter(Boolean) as string[]);
  const allSlugs = new Set(music.map((m) => m.slug).filter(Boolean) as string[]);
  // per-artist: an existing RG-mbid (for authoritative artist resolution), genre, existing normalized titles
  const artistInfo = new Map<string, { seedRg: string; genre: string[]; titles: Set<string> }>();
  for (const m of music) {
    const a = firstArtist(m.people); if (!a) continue;
    const key = norm(a);
    if (!artistInfo.has(key)) artistInfo.set(key, { seedRg: '', genre: (m.genre as string[]) || [], titles: new Set() });
    const info = artistInfo.get(key)!;
    info.titles.add(norm(m.title));
    if (!info.seedRg && (m.ext as any)?.musicbrainz_id) info.seedRg = (m.ext as any).musicbrainz_id;
  }

  const created: number[] = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')).ids || []) : [];
  // --genre=X walks every distinct catalog artist carrying that genre tag; else
  // falls back to the hardcoded calibration SLICE. Cross-batch dedup is safe
  // (existing RG-MBIDs reloaded from the catalog each run).
  const GENRE = argOf('genre');
  let slice: string[];
  if (GENRE) {
    const set = new Set<string>();
    for (const m of music) {
      if (!((m.genre as string[]) || []).includes(GENRE)) continue;
      const a = firstArtist(m.people); if (a && norm(a) !== 'variousartists') set.add(a);
    }
    slice = [...set].sort();
  } else slice = SLICE;
  if (LIMIT) slice = slice.slice(0, LIMIT);
  console.log(`discography-depth — ${DRY ? 'DRY' : 'LIVE'}${GENRE ? ` — genre=${GENRE}` : ''} — ${slice.length} artists — require-cover=${REQUIRE_COVER}\n`);

  const perArtist: { artist: string; included: number; excl: Record<string, number>; created: string[]; note?: string }[] = [];
  const globalExcl: Record<string, number> = { dedup: 0, 'not-album-form': 0, 'comp-remix-demo-etc': 0, 'split-or-future': 0, 'reissue-title': 0, 'no-cover': 0, 'failed-notability': 0 };
  let totalIncluded = 0, withCover = 0;

  for (const artistName of slice) {
    const info = artistInfo.get(norm(artistName));
    if (!info || !info.seedRg) { perArtist.push({ artist: artistName, included: 0, excl: {}, created: [], note: 'no seed RG in catalog — skipped' }); continue; }
    // authoritative artist MBID from an existing catalog album's RG
    const seed = await mb(`release-group/${info.seedRg}?inc=artist-credits&fmt=json`);
    const artistMbid = seed?.['artist-credit']?.[0]?.artist?.id;
    if (!artistMbid) { perArtist.push({ artist: artistName, included: 0, excl: {}, created: [], note: 'artist MBID unresolved — skipped' }); continue; }

    // paginate all primary-type=Album RGs (studio + live + comp), with ratings
    const rgs: RG[] = [];
    let off = 0;
    while (true) {
      const j = await mb(`release-group?artist=${artistMbid}&type=album&inc=ratings&limit=100&offset=${off}&fmt=json`);
      const page: any[] = j?.['release-groups'] || [];
      for (const r of page) rgs.push({ id: r.id, title: r.title, primaryType: r['primary-type'], secondaryTypes: r['secondary-types'] || [], year: parseInt((r['first-release-date'] || '').slice(0, 4)) || 0, ratingVotes: (r.rating || {})['votes-count'] || 0 });
      const tot = j?.['release-group-count'] ?? rgs.length;
      if (rgs.length >= tot || page.length === 0) break;
      off += 100;
    }

    const ctx: Ctx = { existingMbids: allMbids, isDupTitle: (t) => info.titles.has(norm(t)) };
    const excl: Record<string, number> = { dedup: 0, 'not-album-form': 0, 'comp-remix-demo-etc': 0, 'split-or-future': 0, 'reissue-title': 0, 'failed-notability': 0 };
    const toCreate: RG[] = [];
    const liveCandidates: RG[] = [];
    for (const rg of rgs) {
      let excluded = false;
      for (const e of EXCLUSIONS) if (e.test(rg, ctx)) { excl[e.name]++; globalExcl[e.name]++; excluded = true; break; }
      if (excluded) continue;
      if (NOTABILITY.some((c) => c.test(rg))) { toCreate.push(rg); continue; }
      // not a studio album → hold as a live candidate if it's a rated live album; else fails notability
      if (rg.secondaryTypes.includes('Live') && rg.ratingVotes >= DEFINITIVE_LIVE.minVotes) { liveCandidates.push(rg); continue; }
      excl['failed-notability']++; globalExcl['failed-notability']++;
    }
    // add at most ONE live album — the single best-rated (the "definitive live album")
    if (liveCandidates.length) {
      liveCandidates.sort((a, b) => b.ratingVotes - a.ratingVotes);
      toCreate.push(liveCandidates[0]);
      const dropped = liveCandidates.length - 1;
      excl['failed-notability'] += dropped; globalExcl['failed-notability'] += dropped; // the non-best live albums
    }

    const createdTitles: string[] = [];
    let madeCount = 0;
    for (const rg of toCreate) {
      const cover = await coverUrl(rg.id);
      if (!cover && REQUIRE_COVER) { excl['no-cover']++; globalExcl['no-cover']++; continue; } // require-cover lever
      if (cover) withCover++;
      madeCount++;
      createdTitles.push(`${rg.title} (${rg.year || '????'})${rg.secondaryTypes.includes('Live') ? ' [live]' : ''}${cover ? '' : ' [no cover]'}`);
      if (!DRY) {
        const genre = info.genre.length ? info.genre : ['Metal'];
        let slug = makeSlugFromTitle(rg.title); if (allSlugs.has(slug)) slug = `${slug}-${rg.year || 'album'}`;
        let n = 2; while (allSlugs.has(slug)) slug = `${makeSlugFromTitle(rg.title)}-${rg.year}-${n++}`;
        allSlugs.add(slug);
        const item = await prisma.item.create({ data: {
          title: rg.title, type: 'music', genre, vibes: deriveVibes(genre), year: rg.year, cover: cover || '',
          description: `${rg.title} is an album by ${artistName}${rg.year ? `, released in ${rg.year}` : ''}.`,
          people: [{ role: 'Artist', name: artistName }] as any, awards: [] as any, platforms: [] as any,
          ext: { musicbrainz_id: rg.id } as any, totalEp: 0, popularityScore: 0, voteCount: 0, slug, lastSyncedAt: new Date(),
        }, select: { id: true } });
        created.push(item.id); allMbids.add(rg.id);
        writeFileSync(OUT, JSON.stringify({ batch: 'discography-depth', ids: created }, null, 1));
      }
    }
    totalIncluded += madeCount;
    perArtist.push({ artist: artistName, included: madeCount, excl, created: createdTitles });
    console.log(`  ${artistName.padEnd(18)} walked ${String(rgs.length).padStart(4)} RGs → +${madeCount}  (excl: dedup ${excl.dedup}, live/other-unrated ${excl['failed-notability']}, comp ${excl['comp-remix-demo-etc']}, no-cover ${excl['no-cover']}, reissue ${excl['reissue-title']})`);
  }

  console.log(`\n──────── DISCOGRAPHY-DEPTH ${GENRE ? `[${GENRE}] ` : ''}(${DRY ? 'dry' : 'live'}) ────────`);
  console.log(`artists: ${slice.length}   albums ${DRY ? 'would-add' : 'added'}: ${totalIncluded}   avg/artist: ${(totalIncluded / slice.length).toFixed(1)}`);
  console.log(`cover coverage: ${withCover}/${totalIncluded} (${totalIncluded ? Math.round(withCover / totalIncluded * 100) : 0}%)`);
  console.log(`\nGATE SELECTIVITY — excluded by reason (global):`);
  for (const [k, v] of Object.entries(globalExcl)) console.log(`  ${k.padEnd(22)} ${v}`);
  const totalWalked = Object.values(globalExcl).reduce((a, b) => a + b, 0) + totalIncluded;
  console.log(`  ${'→ included'.padEnd(22)} ${totalIncluded}   of ${totalWalked} walked (${Math.round(totalIncluded / totalWalked * 100)}% pass rate)`);
  console.log(`\nPER-ARTIST (flag counts >15 for reissue/comp leakage):`);
  for (const pa of perArtist) console.log(`  ${pa.artist.padEnd(16)} +${pa.included}${pa.included > 15 ? '  ⚠ HIGH' : ''}${pa.note ? '  (' + pa.note + ')' : ''}`);
  // dump created titles for spot-checking
  console.log(`\nADDED ALBUMS (spot-check editions):`);
  for (const pa of perArtist) if (pa.created.length) console.log(`  ${pa.artist}:\n    ${pa.created.join('\n    ')}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
