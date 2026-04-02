import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);
const KEY = process.env.TMDB_API_KEY!;

async function tmdbGet(path: string) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.themoviedb.org/3${path}${sep}api_key=${KEY}`;
  const res = await fetch(url);
  return res.json();
}

const MATRIX_FRANCHISE_ID = 399;
const ANIMATRIX_TMDB_ID = 55931;

async function main() {
  // Double-check no animatrix already in DB
  const existing = await prisma.item.findFirst({
    where: { title: { contains: 'animatrix', mode: 'insensitive' } },
  });
  if (existing) {
    console.log(`Already in DB: "${existing.title}" (#${existing.id})`);
    // Link it if not linked
    const linked = await prisma.franchiseItem.findUnique({
      where: { franchiseId_itemId: { franchiseId: MATRIX_FRANCHISE_ID, itemId: existing.id } },
    });
    if (!linked) {
      await prisma.franchiseItem.create({
        data: { franchiseId: MATRIX_FRANCHISE_ID, itemId: existing.id, addedBy: 'manual' },
      });
      console.log('  Linked to Matrix franchise');
    }
    return;
  }

  // Fetch from TMDB
  const [movie, credits] = await Promise.all([
    tmdbGet(`/movie/${ANIMATRIX_TMDB_ID}`),
    tmdbGet(`/movie/${ANIMATRIX_TMDB_ID}/credits`),
  ]);

  console.log(`TMDB data: "${movie.title}" (${movie.release_date})`);
  console.log(`Overview: ${movie.overview?.slice(0, 150)}`);
  console.log(`Genres: ${movie.genres?.map((g: any) => g.name).join(', ')}`);

  const year = movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : 2003;
  const cover = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : '';

  // Directors
  const directors = (credits.crew || [])
    .filter((c: any) => c.job === 'Director')
    .slice(0, 6)
    .map((c: any) => ({ name: c.name, role: 'Director' }));

  const cast = (credits.cast || [])
    .slice(0, 4)
    .map((c: any) => ({ name: c.name, role: 'Star' }));

  const people = [...directors, ...cast];
  const genres = (movie.genres || []).map((g: any) => g.name);

  const ext: Record<string, any> = {};
  if (movie.vote_average && movie.vote_count > 5) {
    ext.tmdb = parseFloat(movie.vote_average.toFixed(1));
  }

  const animatrix = await prisma.item.create({
    data: {
      title: 'The Animatrix',
      type: 'movie',
      year,
      description: movie.overview || 'An anthology of nine short anime films set in the Matrix universe, from the creators of the Matrix trilogy.',
      cover,
      genre: genres.length > 0 ? genres : ['Animation', 'Action', 'Science Fiction'],
      vibes: ['Mind-Bending', 'Atmospheric', 'Stylish', 'Intense'],
      people: people as any,
      awards: [] as any,
      platforms: [] as any,
      ext: ext as any,
      tmdbId: ANIMATRIX_TMDB_ID,
      isUpcoming: false,
      popularityScore: movie.popularity || 0,
      voteCount: movie.vote_count || 0,
    },
  });

  console.log(`\n✅ Created The Animatrix: item #${animatrix.id}`);
  console.log(`   Year: ${year}, TMDB ID: ${ANIMATRIX_TMDB_ID}`);
  console.log(`   People: ${people.map((p: any) => p.name).join(', ')}`);
  console.log(`   Cover: ${cover ? 'YES' : 'NO'}`);
  console.log(`   Ext: ${JSON.stringify(ext)}`);

  // Link to Matrix franchise
  await prisma.franchiseItem.create({
    data: { franchiseId: MATRIX_FRANCHISE_ID, itemId: animatrix.id, addedBy: 'manual' },
  });
  console.log('✅ Linked to Matrix franchise (#399)');

  // Verify full Matrix franchise
  const franchise = await prisma.franchiseItem.findMany({
    where: { franchiseId: MATRIX_FRANCHISE_ID },
    include: { item: { select: { title: true, type: true, year: true } } },
    orderBy: { item: { year: 'asc' } },
  });
  console.log(`\nMatrix franchise now contains ${franchise.length} items:`);
  franchise.forEach(fi =>
    console.log(`  [${fi.item.type}] "${fi.item.title}" (${fi.item.year})`)
  );
}

main().catch(console.error).finally(() => prisma.$disconnect());
