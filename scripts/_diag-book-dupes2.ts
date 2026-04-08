import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// BigInt-safe serializer
function safe(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v));
}

async function main() {
  console.log('=== QUERY 6 — Exact duplicate titles across all types ===');
  const q6 = await prisma.$queryRawUnsafe(`
    SELECT title, type, COUNT(*) as count, array_agg(id ORDER BY id) as ids,
           array_agg(cover != '' ORDER BY id) as has_covers
    FROM items
    GROUP BY title, type
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, title
    LIMIT 30
  `);
  console.log(JSON.stringify(safe(q6), null, 2));

  // Rhythm of War IDs (from Q1 above): 2012, 15901, 15902
  const idsStr = '2012, 15901, 15902';
  console.log(`\n=== QUERY 7 — Reviews/ratings/library on Rhythm of War items (IDs: ${idsStr}) ===`);

  const q7a = await prisma.$queryRawUnsafe(`
    SELECT item_id, COUNT(*) as reviews FROM reviews WHERE item_id IN (${idsStr}) GROUP BY item_id
  `);
  console.log('Reviews:', JSON.stringify(safe(q7a), null, 2));

  const q7b = await prisma.$queryRawUnsafe(`
    SELECT item_id, COUNT(*) as ratings FROM ratings WHERE item_id IN (${idsStr}) GROUP BY item_id
  `);
  console.log('Ratings:', JSON.stringify(safe(q7b), null, 2));

  const q7c = await prisma.$queryRawUnsafe(`
    SELECT item_id, COUNT(*) as entries FROM library_entries WHERE item_id IN (${idsStr}) GROUP BY item_id
  `);
  console.log('Library entries:', JSON.stringify(safe(q7c), null, 2));

  console.log('\n=== QUERY 8 — Recent franchise_items additions for books (last 100 by item_id desc) ===');
  const q8 = await prisma.$queryRawUnsafe(`
    SELECT fi.item_id, fi.franchise_id, fi.added_by, f.name as franchise_name, i.title, i.cover != '' as has_cover
    FROM franchise_items fi
    JOIN franchises f ON f.id = fi.franchise_id
    JOIN items i ON i.id = fi.item_id
    WHERE i.type = 'book'
    ORDER BY fi.item_id DESC
    LIMIT 100
  `);
  console.log(JSON.stringify(safe(q8), null, 2));

  console.log('\n=== QUERY 9a — Book items in franchise_items table ===');
  const q9a = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT fi.item_id) as items_in_franchise_items FROM franchise_items fi JOIN items i ON i.id = fi.item_id WHERE i.type = 'book'
  `);
  console.log(JSON.stringify(safe(q9a), null, 2));

  console.log('\n(Note: items table has no direct franchiseId column — franchise membership is exclusively via franchise_items join table)');

  console.log('\n=== QUERY 10 — All books in the Cosmere franchise ===');
  const q10 = await prisma.$queryRawUnsafe(`
    SELECT f.id, f.name, i.id as item_id, i.title, i.cover != '' as has_cover, fi.added_by
    FROM franchises f
    JOIN franchise_items fi ON fi.franchise_id = f.id
    JOIN items i ON i.id = fi.item_id
    WHERE f.name ILIKE '%cosmere%'
    ORDER BY i.title
  `);
  console.log(JSON.stringify(safe(q10), null, 2));

  console.log('\n=== QUERY 11 — All Stormlight/related books and their franchise linkage ===');
  const q11 = await prisma.$queryRawUnsafe(`
    SELECT i.id, i.title, fi.franchise_id as fi_franchise_id, f.name as franchise_name, fi.added_by
    FROM items i
    LEFT JOIN franchise_items fi ON fi.item_id = i.id
    LEFT JOIN franchises f ON f.id = fi.franchise_id
    WHERE i.type = 'book' AND (
      i.title ILIKE '%stormlight%' OR
      i.title ILIKE '%way of kings%' OR
      i.title ILIKE '%words of radiance%' OR
      i.title ILIKE '%oathbringer%' OR
      i.title ILIKE '%rhythm of war%' OR
      i.title ILIKE '%wind and truth%' OR
      i.title ILIKE '%edgedancer%' OR
      i.title ILIKE '%dawnshard%'
    )
    ORDER BY i.title
  `);
  console.log(JSON.stringify(safe(q11), null, 2));

  console.log('\n=== QUERY 12 — added_by values in franchise_items ===');
  const q12 = await prisma.$queryRawUnsafe(`
    SELECT added_by, COUNT(*) as count FROM franchise_items GROUP BY added_by ORDER BY count DESC
  `);
  console.log(JSON.stringify(safe(q12), null, 2));
}

main()
  .catch(console.error)
  .finally(() => pool.end());
