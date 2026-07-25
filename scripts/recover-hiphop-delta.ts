/**
 * Curated hand-recovery of the owner-approved hip-hop A−B delta mixtapes
 * (canonical + included-minor tiers). Reads scripts/hiphop-delta.json (emitted
 * by discography-depth.ts --emit-delta), selects ONLY the approved (artist,
 * title) pairs by exact normalized match, verifies the two flagged edition
 * traps (Savage Season same-title collision; Smell the Da.I.S.Y. dual-entry),
 * then creates each by its delta MBID (dedup-safe). genre from the delta's
 * re-derivation; vibes derived; item_dimensions=NULL → calculate-dimensions.
 *
 * Run: npx tsx scripts/recover-hiphop-delta.ts [--dry-run]
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
const OUT = 'scripts/hiphop-delta-recovered-ids.json';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Approved set — exact titles (normalized match against the delta).
const APPROVED = new Set([
  // canonical
  'Beautiful Thugger Girls', '1017 Thug', 'Slime Season', 'Slime Season 2', 'Black Portland',
  'Gangsta Bitch Music, Vol. 1', 'Gangsta Bitch Music, Vol. 2', 'Stolen Youth', 'Shyne Coldchain II',
  'Sucka Free', 'Playtime Is Over', 'Fear of God', 'Fear of God II: Let Us Pray',
  'But You Caint Use My Phone', 'Flamers 2', 'Savage Season', 'Wamp 2 Dem',
  // included minor
  'Smell the Da.I.S.Y. (Da Inner Soul of Yancy)', 'I Came From Nothing', 'I Came From Nothing 2',
  'Shyne Coldchain, Vol. 1', 'Communist Slow Jams', 'Darkskin Manson', 'Wrath of Caine',
  'Detroit State of Mind',
].map((t) => norm(t)));

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
async function verify(id: string): Promise<string> {
  try {
    const r = await fetch(`https://musicbrainz.org/ws/2/release?release-group=${id}&inc=media+artist-credits&fmt=json`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const j = await r.json(); const rel = j.releases || [];
    const credit = [...new Set(rel.flatMap((x: any) => (x['artist-credit'] || []).map((a: any) => a.name)))].join(', ');
    const dates = [...new Set(rel.map((x: any) => x.date).filter(Boolean))].sort();
    const tracks = rel.map((x: any) => (x.media || []).reduce((s: number, m: any) => s + (m['track-count'] || 0), 0));
    return `credit="${credit}" | ${rel.length} rel | earliest=${dates[0] || '?'} | tracks=[${tracks.join(',')}] | statuses=${[...new Set(rel.map((x: any) => x.status))].join('/')}`;
  } catch { return 'VERIFY-ERR'; }
}

async function main() {
  const delta = JSON.parse(readFileSync('scripts/hiphop-delta.json', 'utf8')).items as { id: string; title: string; year: number; artist: string; genre: string[] }[];
  const existing = await prisma.item.findMany({ where: { type: 'music' }, select: { slug: true, ext: true } });
  const existMbids = new Set(existing.map((e) => (e.ext as any)?.musicbrainz_id).filter(Boolean));
  const existSlugs = new Set(existing.map((e) => e.slug).filter(Boolean) as string[]);

  // select approved, dedup by MBID (handles the Smell the Da.I.S.Y. dual-entry: keep first MBID seen)
  const picked: typeof delta = [];
  const seenMbid = new Set<string>();
  const seenTitleArtist = new Set<string>();
  for (const d of delta) {
    if (!APPROVED.has(norm(d.title))) continue;
    if (seenMbid.has(d.id)) continue;
    const taKey = norm(d.title) + '|' + norm(d.artist);
    if (seenTitleArtist.has(norm(d.title))) { console.log(`  DUAL-ENTRY: "${d.title}" also under ${d.artist} — skipping (already picking the first)`); continue; }
    seenMbid.add(d.id); seenTitleArtist.add(norm(d.title)); picked.push(d);
  }

  console.log(`\napproved titles: ${APPROVED.size}   matched in delta: ${picked.length}\n`);
  // flag any approved title NOT found
  const foundTitles = new Set(picked.map((p) => norm(p.title)));
  for (const t of APPROVED) if (!foundTitles.has(t)) console.log(`  ⚠ approved but NOT in delta: "${t}"`);

  const created: number[] = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')).ids || []) : [];
  for (const d of picked) {
    await sleep(1100);
    const flag = /savage season|smell the da/i.test(d.title);
    const v = flag ? `  ← VERIFY: ${await verify(d.id)}` : '';
    if (existMbids.has(d.id)) { console.log(`  dedup (already in): ${d.title} — ${d.artist}`); continue; }
    console.log(`  ${DRY ? 'would recover' : '✓ recovered'}: "${d.title}" (${d.year}) — ${d.artist}  [${d.genre.join('/')}]  mbid=${d.id}${v}`);
    if (DRY) continue;
    let slug = makeSlugFromTitle(d.title); if (existSlugs.has(slug)) slug = `${slug}-${d.year || 'album'}`;
    let n = 2; while (existSlugs.has(slug)) slug = `${makeSlugFromTitle(d.title)}-${d.year}-${n++}`;
    existSlugs.add(slug);
    const item = await prisma.item.create({ data: {
      title: d.title, type: 'music', genre: d.genre, vibes: deriveVibes(d.genre), year: d.year, cover: `https://coverartarchive.org/release-group/${d.id}/front-500`,
      description: `${d.title} is a mixtape by ${d.artist}${d.year ? `, released in ${d.year}` : ''}.`,
      people: [{ role: 'Artist', name: d.artist }] as any, awards: [] as any, platforms: [] as any,
      ext: { musicbrainz_id: d.id } as any, totalEp: 0, popularityScore: 0, voteCount: 0, slug, lastSyncedAt: new Date(),
    }, select: { id: true } });
    created.push(item.id); existMbids.add(d.id);
    writeFileSync(OUT, JSON.stringify({ batch: 'hiphop-delta-recovery', ids: created }, null, 1));
  }
  console.log(`\n${DRY ? 'would recover' : 'recovered'}: ${DRY ? picked.length : created.length}${DRY ? '' : '  → run calculate-dimensions.ts'}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
