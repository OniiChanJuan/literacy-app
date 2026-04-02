/**
 * backfill-genres.ts
 *
 * Normalises genre arrays for all items in the database using two strategies:
 *
 * 1. INFER MISSING GENRES — derive standard UI genres from TMDB compound genres
 *    already stored in the DB. No API calls required.
 *    Examples:
 *      "Sci-Fi & Fantasy" → add "Sci-Fi" + "Fantasy"
 *      "Action & Adventure" → add "Action" + "Adventure"
 *      "War & Politics" → add "War"
 *      Crime + Drama (TV) → add "Thriller"
 *      Mystery + Drama (TV) → add "Thriller"
 *
 * 2. ADD REVERSE ALIASES — make sure the compound TMDB names are also present
 *    when only the simple name is stored. Less common but handles edge cases.
 *
 * Run: npx tsx scripts/backfill-genres.ts
 * Add --dry-run to preview changes without writing to DB.
 * Add --type=tv to only process a specific media type.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const DRY_RUN = process.argv.includes("--dry-run");
const TYPE_FILTER = process.argv.find(a => a.startsWith("--type="))?.split("=")[1] || null;

// ── Inference rules ───────────────────────────────────────────────────────────
// Each rule: if item has ALL of `has[]`, add ALL of `add[]` if not already present.

interface Rule {
  has: string[];   // must have all of these
  add: string[];   // add these if missing
  types?: string[]; // optional: only apply to these item types
}

const RULES: Rule[] = [
  // Compound TMDB TV/Movie genre → simple equivalents
  { has: ["Sci-Fi & Fantasy"],   add: ["Sci-Fi", "Fantasy"] },
  { has: ["Action & Adventure"], add: ["Action", "Adventure"] },
  { has: ["War & Politics"],     add: ["War"] },

  // Reverse: simple → compound (so filtering by "Sci-Fi" finds items stored with "Sci-Fi & Fantasy")
  // These are already handled by synonym expansion in the catalog API, but adding them to
  // the DB too improves full-text search and other non-API queries.
  { has: ["Sci-Fi"],    add: ["Sci-Fi & Fantasy"], types: ["tv"] },
  { has: ["Fantasy"],   add: ["Sci-Fi & Fantasy"], types: ["tv"] },

  // TV thriller inference — TMDB doesn't have a "Thriller" genre for TV;
  // shows like Ozark, Mindhunter, The Americans are filed as Crime+Drama or Mystery+Drama.
  { has: ["Crime",   "Drama"],   add: ["Thriller"], types: ["tv"] },
  { has: ["Mystery", "Drama"],   add: ["Thriller"], types: ["tv"] },
  { has: ["Crime",   "Mystery"], add: ["Thriller"], types: ["tv"] },
  // Crime-only TV (e.g. procedurals) — lighter inference, just add Thriller
  { has: ["Crime"],              add: ["Thriller"], types: ["tv"] },
  // Mystery-only TV
  { has: ["Mystery"],            add: ["Thriller"], types: ["tv"] },

  // Movie thrillers: TMDB does have Thriller (id 53) for movies, but Crime/Mystery
  // drama films are also considered thrillers by most users.
  { has: ["Crime", "Drama"],     add: ["Thriller"], types: ["movie"] },
  { has: ["Mystery", "Drama"],   add: ["Thriller"], types: ["movie"] },
];

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  console.log(`\nGenre Backfill ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log("═".repeat(50));

  const where: any = { isUpcoming: false };
  if (TYPE_FILTER) where.type = TYPE_FILTER;

  const items = await prisma.item.findMany({
    where,
    select: { id: true, title: true, type: true, genre: true },
  });

  console.log(`\nLoaded ${items.length} items${TYPE_FILTER ? ` (type=${TYPE_FILTER})` : ""}\n`);

  const updates: Array<{ id: number; before: string[]; after: string[] }> = [];

  for (const item of items) {
    const current = new Set<string>(item.genre);
    const toAdd = new Set<string>();

    for (const rule of RULES) {
      // Check type restriction
      if (rule.types && !rule.types.includes(item.type)) continue;
      // Check all required genres are present
      if (!rule.has.every(g => current.has(g))) continue;
      // Collect missing genres to add
      for (const g of rule.add) {
        if (!current.has(g)) toAdd.add(g);
      }
    }

    if (toAdd.size > 0) {
      const after = [...item.genre, ...toAdd];
      updates.push({ id: item.id, before: item.genre, after });
    }
  }

  if (updates.length === 0) {
    console.log("No changes needed — all genres already up to date.");
    return;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  // Count how many items will get each new genre added
  const genreAddCounts: Record<string, number> = {};
  for (const u of updates) {
    const added = u.after.filter(g => !u.before.includes(g));
    for (const g of added) {
      genreAddCounts[g] = (genreAddCounts[g] || 0) + 1;
    }
  }

  console.log(`Genre additions that will be made:`);
  for (const [genre, count] of Object.entries(genreAddCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  +${genre}: ${count} items`);
  }
  console.log(`\nTotal items to update: ${updates.length}`);

  if (DRY_RUN) {
    console.log("\n-- DRY RUN: no changes written --");
    // Show a sample
    console.log("\nSample updates (first 10):");
    for (const u of updates.slice(0, 10)) {
      const added = u.after.filter(g => !u.before.includes(g));
      const item = items.find(i => i.id === u.id)!;
      console.log(`  [${item.type}] "${item.title}" → +${added.join(", ")}`);
    }
    return;
  }

  // ── Apply updates in batches ───────────────────────────────────────────────
  console.log("\nApplying updates...");
  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(
      batch.map(u =>
        prisma.item.update({
          where: { id: u.id },
          data: { genre: u.after },
        })
      )
    );
    done += batch.length;
    process.stdout.write(`\r  Progress: ${done}/${updates.length}   `);
  }

  console.log(`\n\nDone. ${updates.length} items updated.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); });
