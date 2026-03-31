/**
 * One-time migration: generate and persist URL slugs for all items.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/generate-slugs.ts
 *   npx dotenv-cli -e .env -- npx tsx scripts/generate-slugs.ts --dry-run
 *   npx dotenv-cli -e .env -- npx tsx scripts/generate-slugs.ts --limit=100
 *
 * Safe to re-run — already-slugged items are skipped unless --force is passed.
 *
 * Slug uniqueness is scoped per (type, slug) pair so two movies can both be
 * named "The Matrix" only if they have different years (or, as final fallback,
 * different IDs).
 */

import { Client } from "pg";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitArg = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "999999");

// ── Slug generation (duplicated from src/lib/slugs.ts for script portability) ──

function makeSlugFromTitle(title: string): string {
  let s = title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[&]/g, "and")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  if (s.length > 80) {
    s = s.slice(0, 80).replace(/-[^-]*$/, "");
  }

  return s || "item";
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Ensure slug column exists (idempotent)
  await client.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS slug VARCHAR(120);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS items_type_slug_idx ON items (type, slug);
  `);

  // Fetch items that need slugging
  const whereClause = force ? "WHERE parent_item_id IS NULL" : "WHERE parent_item_id IS NULL AND slug IS NULL";
  const { rows } = await client.query<{
    id: number;
    title: string;
    type: string;
    year: number;
  }>(`SELECT id, title, type, year FROM items ${whereClause} ORDER BY popularity_score DESC LIMIT $1`, [limitArg]);

  console.log(`Found ${rows.length} items to slug${dryRun ? " (dry run)" : ""}.`);

  // We need to track which (type, slug) pairs are used within THIS batch
  // AND what already exists in the DB, so we do a single pre-fetch of existing slugs.
  const existingRes = await client.query<{ type: string; slug: string }>(
    "SELECT type, slug FROM items WHERE slug IS NOT NULL"
  );
  // Map: type → Set of slugs already in DB
  const usedSlugs = new Map<string, Set<string>>();
  for (const row of existingRes.rows) {
    if (!usedSlugs.has(row.type)) usedSlugs.set(row.type, new Set());
    usedSlugs.get(row.type)!.add(row.slug);
  }

  let updated = 0;
  let skipped = 0;

  for (const item of rows) {
    const base = makeSlugFromTitle(item.title);
    const typeSet = usedSlugs.get(item.type) ?? new Set<string>();

    // Try bare slug, then bare-year, then bare-id
    let slug = base;
    if (typeSet.has(slug)) {
      slug = `${base}-${item.year}`;
    }
    if (typeSet.has(slug)) {
      slug = `${base}-${item.id}`;
    }

    if (!slug || slug === "item") {
      // Last resort: type-id
      slug = `${item.type}-${item.id}`;
    }

    typeSet.add(slug);
    usedSlugs.set(item.type, typeSet);

    if (dryRun) {
      console.log(`  [dry] ${item.type}/${slug}  ←  "${item.title}" (id=${item.id})`);
      continue;
    }

    await client.query("UPDATE items SET slug = $1 WHERE id = $2", [slug, item.id]);
    updated++;
    if (updated % 500 === 0) console.log(`  Updated ${updated}...`);
  }

  if (!dryRun) {
    console.log(`\nDone. Updated: ${updated}, already had slug: ${skipped}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
