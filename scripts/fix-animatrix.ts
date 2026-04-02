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

async function main() {
  // Step 1: Find the correct TMDB ID for The Animatrix
  console.log('Searching TMDB for The Animatrix...');
  const search = await tmdbGet('/search/movie?query=The+Animatrix');
  console.log('Search results:');
  (search.results || []).slice(0, 8).forEach((r: any) =>
    console.log(`  [${r.id}] "${r.title}" (${r.release_date}) — ${r.overview?.slice(0, 80)}`)
  );

  // Step 2: Delete the wrong item (#22517 — "Allan Quatermain and the Temple of Skulls")
  console.log('\nDeleting wrongly imported item #22517...');
  const wrongItem = await prisma.item.findUnique({ where: { id: 22517 } });
  if (wrongItem) {
    console.log(`  Found: "${wrongItem.title}" (${wrongItem.year}) — this is wrong, deleting`);
    await prisma.franchiseItem.deleteMany({ where: { itemId: 22517 } });
    await prisma.item.delete({ where: { id: 22517 } });
    console.log('  ✅ Deleted wrong item #22517');
  } else {
    console.log('  Item #22517 not found');
  }

  // Step 3: Try a few known Animatrix IDs
  const candidateIds = [14103, 22791, 36474, 17213];
  for (const id of candidateIds) {
    const movie = await tmdbGet(`/movie/${id}`);
    if (movie.title?.toLowerCase().includes('animatrix')) {
      console.log(`\n✅ Found The Animatrix at TMDB ID ${id}: "${movie.title}" (${movie.release_date})`);
      console.log(`   Overview: ${movie.overview?.slice(0, 120)}`);
    } else if (!movie.status_message) {
      console.log(`  [${id}] = "${movie.title}" (${movie.release_date})`);
    }
  }

  // Also try direct lookup with the right title
  const search2 = await tmdbGet('/search/movie?query=animatrix+2003');
  console.log('\nDirect 2003 search:');
  (search2.results || []).slice(0, 5).forEach((r: any) =>
    console.log(`  [${r.id}] "${r.title}" (${r.release_date}) pop=${r.popularity?.toFixed(1)} — ${r.overview?.slice(0, 60)}`)
  );
}

main().catch(console.error).finally(() => prisma.$disconnect());
