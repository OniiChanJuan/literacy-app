/**
 * Phase 1 Franchise Fix Script
 * 1A: Import The Animatrix + link Matrix games
 * 1B: Fix Cosmere duplicates/orphans
 * 1C: Delete empty franchises
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

const TMDB_KEY = process.env.TMDB_API_KEY!;
const MATRIX_FRANCHISE_ID = 399;
const STORMLIGHT_FRANCHISE_ID = 552;
const COSMERE_FRANCHISE_ID = 551;

async function tmdbGet(path: string) {
  const url = `https://api.themoviedb.org/3${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${path} → ${res.status}`);
  return res.json();
}

async function linkToFranchise(itemId: number, franchiseId: number, label: string) {
  const existing = await prisma.franchiseItem.findUnique({
    where: { franchiseId_itemId: { franchiseId, itemId } },
  });
  if (existing) {
    console.log(`  ⏭  Already linked: ${label}`);
    return false;
  }
  await prisma.franchiseItem.create({
    data: { franchiseId, itemId, addedBy: 'manual' },
  });
  console.log(`  ✅ Linked: ${label}`);
  return true;
}

// ═══════════════════════════════════════════════
// PHASE 1A — The Animatrix + Matrix games
// ═══════════════════════════════════════════════
async function phase1A() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('PHASE 1A: THE ANIMATRIX + MATRIX GAMES');
  console.log('══════════════════════════════════════════════════');

  // --- Import The Animatrix ---
  const existing = await prisma.item.findFirst({
    where: { title: { contains: 'animatrix', mode: 'insensitive' } },
  });

  if (existing) {
    console.log(`  ⏭  The Animatrix already in DB as item #${existing.id}`);
    await linkToFranchise(existing.id, MATRIX_FRANCHISE_ID, `"${existing.title}" → Matrix franchise`);
  } else {
    console.log('  Fetching The Animatrix from TMDB (id: 14103)...');
    const [movie, credits] = await Promise.all([
      tmdbGet('/movie/14103'),
      tmdbGet('/movie/14103/credits'),
    ]);

    const year = movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : 2003;
    const cover = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : '';

    // Build people array: directors first, then top billed cast
    const directors = (credits.crew || [])
      .filter((c: any) => c.job === 'Director')
      .slice(0, 5)
      .map((c: any) => ({ name: c.name, role: 'Director' }));

    const cast = (credits.cast || [])
      .slice(0, 5)
      .map((c: any) => ({ name: c.name, role: 'Star' }));

    const people = [...directors, ...cast];
    const genres = (movie.genres || []).map((g: any) => g.name);

    // Build ext with tmdb score
    const ext: Record<string, any> = {};
    if (movie.vote_average && movie.vote_count > 10) {
      ext.tmdb = parseFloat(movie.vote_average.toFixed(1));
    }

    const animatrix = await prisma.item.create({
      data: {
        title: movie.title || 'The Animatrix',
        type: 'movie',
        year,
        description: movie.overview || 'An anthology of nine short anime films set in the Matrix universe.',
        cover,
        genre: genres,
        vibes: ['Mind-Bending', 'Atmospheric', 'Stylish'],
        people: people as any,
        awards: [] as any,
        platforms: [] as any,
        ext: ext as any,
        tmdbId: movie.id,
        isUpcoming: false,
        popularityScore: movie.popularity || 0,
        voteCount: movie.vote_count || 0,
      },
    });

    console.log(`  ✅ Created The Animatrix: item #${animatrix.id} (${year})`);
    console.log(`     Genres: ${genres.join(', ')}`);
    console.log(`     People: ${people.map((p: any) => p.name).join(', ')}`);
    console.log(`     TMDB score: ${ext.tmdb || 'n/a'}`);

    await linkToFranchise(animatrix.id, MATRIX_FRANCHISE_ID, '"The Animatrix" → Matrix franchise');
  }

  // --- Link Matrix games ---
  console.log('\n  Linking Matrix games...');
  const matrixGames = await prisma.item.findMany({
    where: {
      type: 'game',
      OR: [
        { title: { contains: 'Enter the Matrix', mode: 'insensitive' } },
        { title: { contains: 'Path of Neo', mode: 'insensitive' } },
      ],
    },
    select: { id: true, title: true },
  });

  for (const game of matrixGames) {
    await linkToFranchise(game.id, MATRIX_FRANCHISE_ID, `"${game.title}" → Matrix franchise`);
  }

  // Verify Matrix franchise
  const matrixItems = await prisma.franchiseItem.findMany({
    where: { franchiseId: MATRIX_FRANCHISE_ID },
    include: { item: { select: { title: true, type: true, year: true } } },
    orderBy: { item: { year: 'asc' } },
  });
  console.log(`\n  Matrix franchise now contains ${matrixItems.length} items:`);
  matrixItems.forEach(fi =>
    console.log(`    [${fi.item.type}] "${fi.item.title}" (${fi.item.year})`)
  );
}

// ═══════════════════════════════════════════════
// PHASE 1B — Cosmere fixes
// ═══════════════════════════════════════════════
async function phase1B() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('PHASE 1B: COSMERE DUPLICATES + ORPHANS');
  console.log('══════════════════════════════════════════════════');

  // --- "Mistborn" (id 15903) vs "The Final Empire" (id 2014) ---
  // "Mistborn" is the 10th anniversary collector's edition (2016), 0 ratings, 0 reviews
  // "The Final Empire" is the original 2009 edition, already in franchises, 0 ratings, 0 reviews
  // Action: delete the duplicate "Mistborn" entry (same book, different edition title)
  console.log('\n  [1B-1] Mistborn duplicate: deleting item #15903 ("Mistborn" 2016 anniversary edition)');
  console.log('  Reason: Same book as "The Final Empire" (#2014). Both have 0 ratings/reviews.');
  console.log('  Keeping: "The Final Empire" (#2014), already linked to The Cosmere + Mistborn Era 1');

  const mistbornDuplicate = await prisma.item.findUnique({ where: { id: 15903 } });
  if (mistbornDuplicate) {
    // Remove franchise links first (though there are none)
    await prisma.franchiseItem.deleteMany({ where: { itemId: 15903 } });
    await prisma.item.delete({ where: { id: 15903 } });
    console.log('  ✅ Deleted "Mistborn" #15903');
  } else {
    console.log('  ⏭  Item #15903 already removed');
  }

  // --- "The Way of Kings" duplicate ---
  // #2007 (2024 edition, 0 ratings) vs #2008 (2023 edition, 1 rating, already in franchises)
  // Action: delete #2007 (newer edition, less connected)
  console.log('\n  [1B-2] Way of Kings duplicate: deleting item #2007 (2024 edition, 0 ratings)');
  console.log('  Keeping: item #2008 (2023 edition, 1 rating, already in Stormlight + Cosmere)');

  const wokDuplicate = await prisma.item.findUnique({ where: { id: 2007 } });
  if (wokDuplicate) {
    await prisma.franchiseItem.deleteMany({ where: { itemId: 2007 } });
    await prisma.item.delete({ where: { id: 2007 } });
    console.log('  ✅ Deleted "The Way of Kings" #2007 (2024 duplicate)');
  } else {
    console.log('  ⏭  Item #2007 already removed');
  }

  // --- Link split editions to franchises ---
  console.log('\n  [1B-3] Linking split/part editions to Stormlight Archive + Cosmere...');

  const partEditions = [
    { id: 15905, title: 'The Way of Kings Part Two' },
    { id: 15901, title: 'Rhythm of War Part Two' },
    { id: 15902, title: 'Rhythm of War Part One' },
  ];

  for (const edition of partEditions) {
    const item = await prisma.item.findUnique({ where: { id: edition.id } });
    if (!item) {
      console.log(`  ⚠  Item #${edition.id} not found`);
      continue;
    }
    await linkToFranchise(edition.id, STORMLIGHT_FRANCHISE_ID, `"${edition.title}" → Stormlight Archive`);
    await linkToFranchise(edition.id, COSMERE_FRANCHISE_ID, `"${edition.title}" → The Cosmere`);
  }

  // --- Check for any other unlinked Cosmere/Stormlight books ---
  console.log('\n  [1B-4] Checking for other unlinked Cosmere books...');

  // Check "Mistborn" main entry still there - should be "The Final Empire"
  // Also check for any Sanderson book we might have missed
  const cosmereOrphans = await prisma.item.findMany({
    where: {
      type: 'book',
      OR: [
        { title: { contains: 'stormlight', mode: 'insensitive' } },
        { title: 'Elantris' },
        { title: 'Warbreaker' },
      ],
      franchiseItems: { none: {} },
      isUpcoming: false,
    },
    select: { id: true, title: true, year: true },
  });

  if (cosmereOrphans.length === 0) {
    console.log('  ✅ No additional Cosmere orphans found');
  } else {
    for (const book of cosmereOrphans) {
      console.log(`  Found orphan: [#${book.id}] "${book.title}" (${book.year})`);
      await linkToFranchise(book.id, COSMERE_FRANCHISE_ID, `"${book.title}" → The Cosmere`);
    }
  }

  // Verify Stormlight franchise
  const stormlightItems = await prisma.franchiseItem.findMany({
    where: { franchiseId: STORMLIGHT_FRANCHISE_ID },
    include: { item: { select: { title: true, year: true } } },
    orderBy: { item: { year: 'asc' } },
  });
  console.log(`\n  Stormlight Archive franchise now contains ${stormlightItems.length} items:`);
  stormlightItems.forEach(fi => console.log(`    "${fi.item.title}" (${fi.item.year})`));
}

// ═══════════════════════════════════════════════
// PHASE 1C — Delete empty franchises
// ═══════════════════════════════════════════════
async function phase1C() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('PHASE 1C: DELETE EMPTY FRANCHISES');
  console.log('══════════════════════════════════════════════════');

  // Empty franchises from diagnostic:
  // #570 "Fate/stay night" (child of #569)
  // #571 "Fate/Zero" (child of #569)
  // #573 "Kara no Kyoukai" (child of #569)
  // #574 "Tsukihime" (child of #569)
  // #584 "The Flash" (child of #537)
  // #585 "Aquaman" (child of #537)
  // #593 "Warhammer" (no parent, but HAS children — handle carefully)

  // Check #593 "Warhammer" children before deleting
  const warhammer = await prisma.franchise.findUnique({
    where: { id: 593 },
    include: {
      _count: { select: { items: true } },
      childFranchises: { select: { id: true, name: true } },
    },
  });

  if (warhammer) {
    console.log(`\n  Franchise #593 "Warhammer": ${warhammer._count.items} items, ${warhammer.childFranchises.length} children`);
    warhammer.childFranchises.forEach(c => console.log(`    Child: #${c.id} "${c.name}"`));

    if (warhammer.childFranchises.length > 0) {
      // Reparent children to null before deleting
      console.log('  Reparenting children to null (removing parent link)...');
      await prisma.franchise.updateMany({
        where: { parentFranchiseId: 593 },
        data: { parentFranchiseId: null },
      });
      console.log('  ✅ Children reparented');
    }
  }

  // Now delete all 7 empty franchises
  const toDelete = [570, 571, 573, 574, 584, 585, 593];
  let deleted = 0;

  for (const id of toDelete) {
    const franchise = await prisma.franchise.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!franchise) {
      console.log(`  ⏭  Franchise #${id} not found (already deleted?)`);
      continue;
    }
    if (franchise._count.items > 0) {
      console.log(`  ⚠  Franchise #${id} "${franchise.name}" has ${franchise._count.items} items — SKIPPING`);
      continue;
    }
    await prisma.franchise.delete({ where: { id } });
    console.log(`  ✅ Deleted franchise #${id} "${franchise.name}"`);
    deleted++;
  }

  console.log(`\n  Deleted ${deleted} empty franchises`);
}

// ═══════════════════════════════════════════════
// PHASE 1E — Single-item franchise analysis
// ═══════════════════════════════════════════════
async function phase1E() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('PHASE 1E: SINGLE-ITEM FRANCHISE ANALYSIS');
  console.log('══════════════════════════════════════════════════');

  // From diagnostic:
  // #468 "Sekiro" → "Sekiro: Shadows Die Twice" (game, 2019)
  // #470 "Disco Elysium" → "Disco Elysium" (game, 2019)
  // #494 "100% Electronica" → "100% Electronica" (music, 2015)
  // #572 "Fate/Grand Order" → "Fate/Grand Order" (game, 2015)
  // #583 "Wonder Woman" → "Wonder Woman" (comic, 2006)

  const analyses = [
    {
      id: 468,
      name: 'Sekiro',
      verdict: 'STANDALONE',
      reason: "FromSoftware's Sekiro: Shadows Die Twice is a standalone IP with no sequels. Leave as-is.",
    },
    {
      id: 470,
      name: 'Disco Elysium',
      verdict: 'STANDALONE',
      reason: "Standalone RPG by ZA/UM. No sequels, no other media in DB. Leave as-is.",
    },
    {
      id: 494,
      name: '100% Electronica',
      verdict: 'STANDALONE',
      reason: "100% Electronica is a record label, not a franchise. One album in DB. Leave as-is.",
    },
    {
      id: 572,
      name: 'Fate/Grand Order',
      verdict: 'NEEDS EXPANSION',
      reason: "Fate/Grand Order is part of the larger Fate franchise. FGO also has anime spin-offs. The parent Fate franchise should absorb this or FGO should be its own sub-franchise with anime entries linked.",
    },
    {
      id: 583,
      name: 'Wonder Woman',
      verdict: 'NEEDS EXPANSION',
      reason: "Wonder Woman (comic, 2006) is a single issue/run. More Wonder Woman comics, the 2017 movie, and 1984 sequel are in the DB. Should search and link those.",
    },
  ];

  // Check for Wonder Woman expansion opportunities
  const wonderWoman = await prisma.item.findMany({
    where: {
      title: { contains: 'wonder woman', mode: 'insensitive' },
      franchiseItems: { none: {} },
      isUpcoming: false,
    },
    select: { id: true, title: true, type: true, year: true },
    orderBy: { year: 'asc' },
  });

  // Check for Fate/Grand Order related anime
  const fateGO = await prisma.item.findMany({
    where: {
      title: { contains: 'fate/grand order', mode: 'insensitive' },
      franchiseItems: { none: {} },
      isUpcoming: false,
    },
    select: { id: true, title: true, type: true, year: true },
    orderBy: { year: 'asc' },
  });

  for (const a of analyses) {
    console.log(`\n  [#${a.id}] "${a.name}" → ${a.verdict}`);
    console.log(`    ${a.reason}`);
  }

  if (wonderWoman.length > 0) {
    console.log('\n  Wonder Woman unlinked items that could be added to franchise #583:');
    wonderWoman.forEach(i => console.log(`    [${i.id}] "${i.title}" (${i.type}, ${i.year})`));
  }

  if (fateGO.length > 0) {
    console.log('\n  Fate/Grand Order unlinked items that could be added to franchise #572:');
    fateGO.forEach(i => console.log(`    [${i.id}] "${i.title}" (${i.type}, ${i.year})`));
  }

  console.log('\n  RECOMMENDED ACTIONS:');
  console.log('  - Keep Sekiro, Disco Elysium, 100% Electronica as single-item (genuinely standalone)');
  console.log('  - Expand Wonder Woman (#583) with movies + other comics (pending 1D approval)');
  console.log('  - Fate/Grand Order (#572): decide if it should link to parent Fate franchise or stay separate');
}

// ═══════════════════════════════════════════════
// FINAL COVERAGE REPORT
// ═══════════════════════════════════════════════
async function coverageReport() {
  console.log('\n══════════════════════════════════════════════════');
  console.log('FINAL COVERAGE REPORT');
  console.log('══════════════════════════════════════════════════');

  const [totalFranchises, totalItems, unlinkedItems] = await Promise.all([
    prisma.franchise.count(),
    prisma.item.count({ where: { isUpcoming: false } }),
    prisma.item.count({ where: { franchiseItems: { none: {} }, isUpcoming: false } }),
  ]);

  const linkedItems = totalItems - unlinkedItems;

  console.log(`\n  Franchises: ${totalFranchises}`);
  console.log(`  Total items: ${totalItems}`);
  console.log(`  Items WITH franchise: ${linkedItems} (${((linkedItems / totalItems) * 100).toFixed(1)}%)`);
  console.log(`  Items WITHOUT franchise: ${unlinkedItems} (${((unlinkedItems / totalItems) * 100).toFixed(1)}%)`);
  console.log(`\n  Previous: 1,198 items in franchise (5.3%)`);
  console.log(`  Delta: +${linkedItems - 1198} items linked in Phase 1`);
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════
async function main() {
  console.log('Starting Phase 1 franchise fixes...\n');

  await phase1A();
  await phase1B();
  await phase1C();
  await phase1E();
  await coverageReport();

  console.log('\n\n✅ Phase 1 complete. Review Phase 1D proposals above for approval.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
