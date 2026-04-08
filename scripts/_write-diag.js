// This script writes the TypeScript diagnostic file
const fs = require('fs');
const path = require('path');

const lines = [];
lines.push("import 'dotenv/config';");
lines.push("import { PrismaClient } from '@prisma/client';");
lines.push("import { PrismaPg } from '@prisma/adapter-pg';");
lines.push("import * as dotenvLocal from 'dotenv';");
lines.push("import * as path from 'path';");
lines.push("dotenvLocal.config({ path: path.join(process.cwd(), '.env.local') });");
lines.push("");
lines.push("function sep(t: string) { console.log('\\n' + '='.repeat(60) + '\\n' + t + '\\n' + '='.repeat(60)); }");
lines.push("");
lines.push("async function main() {");
lines.push("  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;");
lines.push("  const adapter = new PrismaPg({ connectionString: connUrl });");
lines.push("  const prisma = new PrismaClient({ adapter } as any);");
lines.push("");

// Q1
lines.push("  sep('QUERY 1 — Little Prince items');");
lines.push("  const q1: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT id, title, type, slug, ext, genres, \\\"createdAt\\\" FROM items WHERE title ILIKE '%little prince%' OR title ILIKE '%petit prince%'\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q1, null, 2));");
lines.push("  const lpIds: string[] = q1.map((r: any) => r.id);");
lines.push("  console.log('IDs found:', lpIds);");
lines.push("");

// Q2
lines.push("  sep('QUERY 2 — Reviews per Little Prince item');");
lines.push("  if (lpIds.length > 0) {");
lines.push("    const idList = lpIds.map((id: string) => \"'\" + id + \"'\").join(',');");
lines.push("    const q2: any[] = await prisma.$queryRawUnsafe(");
lines.push("      `SELECT \"itemId\", COUNT(*) as review_count FROM reviews WHERE \"itemId\" IN (${idList}) GROUP BY \"itemId\"`");
lines.push("    );");
lines.push("    console.log(JSON.stringify(q2, null, 2));");
lines.push("  } else { console.log('No IDs.'); }");
lines.push("");

// Q3
lines.push("  sep('QUERY 3 — Ratings per Little Prince item');");
lines.push("  if (lpIds.length > 0) {");
lines.push("    const idList = lpIds.map((id: string) => \"'\" + id + \"'\").join(',');");
lines.push("    const q3: any[] = await prisma.$queryRawUnsafe(");
lines.push("      `SELECT \"itemId\", COUNT(*) as rating_count, AVG(score) as avg_score FROM ratings WHERE \"itemId\" IN (${idList}) GROUP BY \"itemId\"`");
lines.push("    );");
lines.push("    console.log(JSON.stringify(q3, null, 2));");
lines.push("  } else { console.log('No IDs.'); }");
lines.push("");

// Q4
lines.push("  sep('QUERY 4 — Library entries per Little Prince item');");
lines.push("  if (lpIds.length > 0) {");
lines.push("    const idList = lpIds.map((id: string) => \"'\" + id + \"'\").join(',');");
lines.push("    const q4: any[] = await prisma.$queryRawUnsafe(");
lines.push("      `SELECT \"itemId\", status, COUNT(*) FROM library_entries WHERE \"itemId\" IN (${idList}) GROUP BY \"itemId\", status`");
lines.push("    );");
lines.push("    console.log(JSON.stringify(q4, null, 2));");
lines.push("  } else { console.log('No IDs.'); }");
lines.push("");

// Q5
lines.push("  sep('QUERY 5 — Same Google Books ID');");
lines.push("  const q5: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.ext->>'google_books_id' as gbooks_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.ext->>'google_books_id' IS NOT NULL AND a.ext->>'google_books_id' = b.ext->>'google_books_id' LIMIT 20\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q5, null, 2));");
lines.push("");

// Q6
lines.push("  sep('QUERY 6 — Same TMDB ID');");
lines.push("  const q6: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.ext->>'tmdb_id' as tmdb_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.ext->>'tmdb_id' IS NOT NULL AND a.ext->>'tmdb_id' = b.ext->>'tmdb_id' LIMIT 20\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q6, null, 2));");
lines.push("");

// Q7
lines.push("  sep('QUERY 7 — Same IGDB ID');");
lines.push("  const q7: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.ext->>'igdb_id' as igdb_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.ext->>'igdb_id' IS NOT NULL AND a.ext->>'igdb_id' = b.ext->>'igdb_id' LIMIT 20\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q7, null, 2));");
lines.push("");

// Q8
lines.push("  sep('QUERY 8 — Same MAL ID');");
lines.push("  const q8: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.ext->>'mal_id' as mal_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.ext->>'mal_id' IS NOT NULL AND a.ext->>'mal_id' = b.ext->>'mal_id' LIMIT 20\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q8, null, 2));");
lines.push("");

// Q9
lines.push("  sep('QUERY 9 — Same Spotify ID');");
lines.push("  const q9: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.ext->>'spotify_id' as spotify_id FROM items a JOIN items b ON a.id < b.id AND a.type = b.type WHERE a.ext->>'spotify_id' IS NOT NULL AND a.ext->>'spotify_id' = b.ext->>'spotify_id' LIMIT 20\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q9, null, 2));");
lines.push("");

// Q10
lines.push("  sep('QUERY 10 — Same title + type + year');");
lines.push("  const q10: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT title, type, year, COUNT(*) as dupes FROM items GROUP BY title, type, year HAVING COUNT(*) > 1 ORDER BY dupes DESC LIMIT 30\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q10, null, 2));");
lines.push("");

// Q11
lines.push("  sep('QUERY 11 — Same external ID cross-check (books)');");
lines.push("  const q11: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.type FROM items a JOIN items b ON a.type = b.type AND a.id != b.id AND a.id < b.id WHERE ((a.ext->>'google_books_id' = b.ext->>'google_books_id' AND a.ext->>'google_books_id' IS NOT NULL) OR (a.ext->>'openlibrary_id' = b.ext->>'openlibrary_id' AND a.ext->>'openlibrary_id' IS NOT NULL)) LIMIT 20\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q11, null, 2));");
lines.push("");

// Q12
lines.push("  sep('QUERY 12 — Title contains other title');");
lines.push("  const q12: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.type FROM items a JOIN items b ON a.type = b.type AND a.id < b.id WHERE (a.title ILIKE '%' || b.title || '%' OR b.title ILIKE '%' || a.title || '%') AND length(a.title) > 5 AND length(b.title) > 5 AND a.title != b.title LIMIT 30\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q12, null, 2));");
lines.push("");

// Q13
lines.push("  sep('QUERY 13 — Count duplicate pairs by type');");
lines.push("  const q13: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"SELECT a.type, SUM(CASE WHEN a.ext->>'google_books_id' = b.ext->>'google_books_id' AND a.ext->>'google_books_id' IS NOT NULL THEN 1 ELSE 0 END) as gbooks_dups, SUM(CASE WHEN a.ext->>'tmdb_id' = b.ext->>'tmdb_id' AND a.ext->>'tmdb_id' IS NOT NULL THEN 1 ELSE 0 END) as tmdb_dups, SUM(CASE WHEN a.ext->>'igdb_id' = b.ext->>'igdb_id' AND a.ext->>'igdb_id' IS NOT NULL THEN 1 ELSE 0 END) as igdb_dups, SUM(CASE WHEN a.ext->>'mal_id' = b.ext->>'mal_id' AND a.ext->>'mal_id' IS NOT NULL THEN 1 ELSE 0 END) as mal_dups, SUM(CASE WHEN a.ext->>'spotify_id' = b.ext->>'spotify_id' AND a.ext->>'spotify_id' IS NOT NULL THEN 1 ELSE 0 END) as spotify_dups, SUM(CASE WHEN a.ext->>'openlibrary_id' = b.ext->>'openlibrary_id' AND a.ext->>'openlibrary_id' IS NOT NULL THEN 1 ELSE 0 END) as openlibrary_dups FROM items a JOIN items b ON a.id < b.id AND a.type = b.type GROUP BY a.type ORDER BY a.type\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q13, null, 2));");
lines.push("");

// Q14
lines.push("  sep('QUERY 14 — High priority: duplicates with reviews/ratings');");
lines.push("  const q14: any[] = await prisma.$queryRawUnsafe(");
lines.push("    \"WITH dup_pairs AS (SELECT a.id as id_a, a.title as title_a, b.id as id_b, b.title as title_b, a.type FROM items a JOIN items b ON a.type = b.type AND a.id < b.id WHERE ((a.ext->>'google_books_id' = b.ext->>'google_books_id' AND a.ext->>'google_books_id' IS NOT NULL) OR (a.ext->>'tmdb_id' = b.ext->>'tmdb_id' AND a.ext->>'tmdb_id' IS NOT NULL) OR (a.ext->>'igdb_id' = b.ext->>'igdb_id' AND a.ext->>'igdb_id' IS NOT NULL) OR (a.ext->>'mal_id' = b.ext->>'mal_id' AND a.ext->>'mal_id' IS NOT NULL))) SELECT dp.*, (SELECT COUNT(*) FROM reviews WHERE \\\"itemId\\\" = dp.id_a) as reviews_a, (SELECT COUNT(*) FROM reviews WHERE \\\"itemId\\\" = dp.id_b) as reviews_b, (SELECT COUNT(*) FROM ratings WHERE \\\"itemId\\\" = dp.id_a) as ratings_a, (SELECT COUNT(*) FROM ratings WHERE \\\"itemId\\\" = dp.id_b) as ratings_b FROM dup_pairs dp ORDER BY ((SELECT COUNT(*) FROM reviews WHERE \\\"itemId\\\" = dp.id_a) + (SELECT COUNT(*) FROM reviews WHERE \\\"itemId\\\" = dp.id_b) + (SELECT COUNT(*) FROM ratings WHERE \\\"itemId\\\" = dp.id_a) + (SELECT COUNT(*) FROM ratings WHERE \\\"itemId\\\" = dp.id_b)) DESC LIMIT 20\"");
lines.push("  );");
lines.push("  console.log(JSON.stringify(q14, null, 2));");
lines.push("");
lines.push("  await prisma.$disconnect();");
lines.push("  console.log('\\nAll done.');");
lines.push("}");
lines.push("main().catch(e => { console.error(e); process.exit(1); });");
lines.push("");

const content = lines.join('\n');
fs.writeFileSync(path.join(__dirname, '_diag-comprehensive-dupes.ts'), content);
console.log('Written', content.length, 'bytes');
