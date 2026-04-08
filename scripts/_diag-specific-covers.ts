import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import https from "https";
import http from "http";

async function testUrl(url: string): Promise<{ status: number | string; redirect?: string }> {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith("https") ? https : http;
      const req = mod.request(url, { method: "HEAD", timeout: 5000 }, (res) => {
        resolve({ status: res.statusCode || 0, redirect: res.headers.location });
      });
      req.on("error", (e) => resolve({ status: `ERROR: ${e.message}` }));
      req.on("timeout", () => { req.destroy(); resolve({ status: "TIMEOUT" }); });
      req.end();
    } catch (e: any) { resolve({ status: `EXCEPTION: ${e.message}` }); }
  });
}

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // 1. Look up specific items mentioned
  const targets = ["Animal Farm", "Hunger Games", "Berserk", "Chainsaw Man", "Witch Hat Atelier", "One Piece Fan Letter", "Frieren"];
  console.log("=== Specific items ===");
  for (const t of targets) {
    const items: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, title, type, cover, ext->>'mal' as mal_score, ext->>'google_books' as gb_score,
             ext->>'tmdb' as tmdb_score
      FROM items
      WHERE title ILIKE $1 AND parent_item_id IS NULL
      ORDER BY vote_count DESC NULLS LAST
      LIMIT 3
    `, `%${t}%`);
    for (const item of items) {
      const coverStatus = !item.cover || item.cover === "" ? "NULL/EMPTY" : item.cover;
      console.log(`[${item.id}] ${item.title} (${item.type})`);
      console.log(`  cover: ${coverStatus}`);
    }
  }

  // 2. Count missing covers total
  console.log("\n=== Missing cover counts by type ===");
  const counts: any[] = await prisma.$queryRawUnsafe(`
    SELECT type,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE cover IS NULL OR cover = '' OR cover NOT LIKE 'http%')::int as missing
    FROM items
    WHERE parent_item_id IS NULL AND is_upcoming = false
    GROUP BY type ORDER BY missing DESC
  `);
  let totalMissing = 0;
  for (const r of counts) {
    totalMissing += r.missing;
    if (r.missing > 0) console.log(`  ${r.type.padEnd(10)} total=${r.total}  missing=${r.missing}`);
  }
  console.log(`  TOTAL MISSING: ${totalMissing}`);

  // 3. Sample items with covers - test if URLs work
  console.log("\n=== Testing cover URLs of specific items ===");
  const sampleItems: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, type, cover
    FROM items
    WHERE title ILIKE ANY(ARRAY['%Berserk%','%Chainsaw Man%','%Animal Farm%','%Hunger Games%'])
      AND parent_item_id IS NULL
      AND (cover IS NOT NULL AND cover != '' AND cover LIKE 'http%')
    LIMIT 10
  `);
  for (const item of sampleItems) {
    const result = await testUrl(item.cover);
    console.log(`[${item.id}] ${item.title} (${item.type})`);
    console.log(`  URL: ${item.cover.substring(0, 80)}`);
    console.log(`  Status: ${result.status}${result.redirect ? ` → ${result.redirect}` : ''}`);
  }

  // 4. Show all 8 missing book covers
  console.log("\n=== Books with missing covers ===");
  const missingBooks: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, title, cover, ext->>'google_books' as gb_score,
           ext->>'google_books_id' as gb_id
    FROM items
    WHERE type = 'book' AND parent_item_id IS NULL
      AND (cover IS NULL OR cover = '' OR cover NOT LIKE 'http%')
    ORDER BY vote_count DESC NULLS LAST
    LIMIT 20
  `);
  console.log(`Found ${missingBooks.length} books missing covers:`);
  for (const b of missingBooks) {
    console.log(`  [${b.id}] "${b.title}" | cover="${b.cover || 'NULL'}" | gb_score=${b.gb_score} | gb_id=${b.gb_id}`);
  }

  // 5. Check cover URL format distribution to spot broken patterns
  console.log("\n=== Cover URL domain breakdown (all items) ===");
  const domains: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      REGEXP_REPLACE(cover, '^https?://([^/]+).*$', '\\1') as domain,
      COUNT(*)::int as cnt
    FROM items
    WHERE parent_item_id IS NULL AND cover IS NOT NULL AND cover LIKE 'http%'
    GROUP BY 1 ORDER BY cnt DESC
    LIMIT 15
  `);
  for (const d of domains) console.log(`  ${d.domain.padEnd(40)} ${d.cnt}`);

  await prisma.$disconnect();
}

main().catch(console.error);
