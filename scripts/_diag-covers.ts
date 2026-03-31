import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Count missing covers by type
  const byType: any[] = await prisma.$queryRawUnsafe(`
    SELECT type,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE cover IS NULL OR cover = '' OR cover NOT LIKE 'http%')::int as missing
    FROM items
    WHERE parent_item_id IS NULL AND is_upcoming = false
    GROUP BY type ORDER BY missing DESC
  `);
  console.log("Missing covers by type:");
  for (const r of byType) {
    const pct = r.total > 0 ? Math.round(r.missing * 100 / r.total) : 0;
    console.log(`  ${r.type.padEnd(10)} total=${r.total}  missing=${r.missing} (${pct}%)`);
  }

  const totalMissing = byType.reduce((s: number, r: any) => s + r.missing, 0);
  const totalItems = byType.reduce((s: number, r: any) => s + r.total, 0);
  console.log(`\nTotal: ${totalMissing} missing out of ${totalItems} items`);

  // Sample missing covers per type
  for (const r of byType) {
    if (r.missing === 0) continue;
    const samples: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, title, LEFT(COALESCE(cover,''), 80) as cover_start,
        ext->>'mal' as mal_id,
        ext->>'tmdb' as tmdb_score,
        external_api_id,
        vote_count
      FROM items
      WHERE type = '${r.type}' AND parent_item_id IS NULL AND is_upcoming = false
        AND (cover IS NULL OR cover = '' OR cover NOT LIKE 'http%')
      ORDER BY vote_count DESC NULLS LAST
      LIMIT 5
    `);
    console.log(`\n  Sample missing ${r.type} (top by votes):`);
    for (const s of samples) {
      console.log(`    [${s.id}] "${s.title}" | cover="${s.cover_start||'null'}" | ext_id="${s.external_api_id||''}" | votes=${s.vote_count||0}`);
    }
  }

  // Check for URL pattern issues on items that DO have covers
  const urlSamples: any[] = await prisma.$queryRawUnsafe(`
    SELECT type, LEFT(cover, 60) as url_prefix, COUNT(*)::int as cnt
    FROM items
    WHERE cover IS NOT NULL AND cover != '' AND cover LIKE 'http%'
      AND parent_item_id IS NULL
    GROUP BY type, LEFT(cover, 60)
    ORDER BY cnt DESC
    LIMIT 20
  `);
  console.log("\nTop cover URL patterns (existing covers):");
  for (const r of urlSamples) {
    console.log(`  [${r.type}] ${r.url_prefix}... (${r.cnt} items)`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
