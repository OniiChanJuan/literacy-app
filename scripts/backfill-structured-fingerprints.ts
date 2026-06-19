/**
 * backfill-structured-fingerprints.ts — Steps 1+2 of the triangulation plan.
 * DETERMINISTIC, STRUCTURED signals only (no description-text extraction, no
 * creator propagation).
 *
 *   - books: genre→vibe via deriveVibes(genre, "") [GENRE-ONLY] for thin books
 *            whose genre has a real tone subgenre; + the genre-map hygiene
 *            (Biography & Autobiography, etc.) takes effect on re-vector.
 *   - manga/anime: demographic priors (shonen/seinen/josei) via the new logic
 *            in taste-dimensions.ts.
 *   - games: IGDB native-genre maps (shooter/strategy/rpg/...) via the new logic.
 *
 * SCOPE GUARD: an item is only touched if its NEW fingerprint actually differs
 * from the STORED one. Writes new vibes (where derived) AND item_dimensions =
 * Prisma.DbNull in the same update (SQL NULL, mirroring reenrich-orphans.ts), so
 * calculate-dimensions.ts then re-vectors ONLY the re-nulled items. Well-tagged
 * films/TV/games whose fingerprint doesn't change are never re-nulled.
 *
 * Run: npx tsx scripts/backfill-structured-fingerprints.ts --dry-run   # report only
 *      npx tsx scripts/backfill-structured-fingerprints.ts             # write
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import { calculateItemDimensions, DIMENSION_KEYS, type TasteDimensions } from "../src/lib/taste-dimensions";
import { deriveVibes } from "../src/lib/google-books";

const DRY = process.argv.includes("--dry-run");
const FALLBACK = ["thought-provoking"];
const isFallback = (vibes: string[]) => vibes.length === 0 || (vibes.length === 1 && vibes[0] === "thought-provoking");
const dimsDiffer = (a: TasteDimensions | null, b: TasteDimensions) =>
  !a || DIMENSION_KEYS.some((k) => Math.abs((a[k] ?? 0.5) - b[k]) > 0.005);

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL! }) });

  // Load only the 4 target populations (films/TV/movies/podcasts/music untouched).
  const items = await prisma.item.findMany({
    where: { OR: [{ type: { in: ["book", "manga", "game"] } }, { type: "tv", itemSubtype: "anime" }] },
    select: { id: true, type: true, genre: true, vibes: true, description: true, totalEp: true, voteCount: true, itemDimensions: true },
  });
  console.log(`Loaded ${items.length} candidate items (book/manga/game/anime). Computing new fingerprints...\n`);

  const stat: Record<string, { vibeChanged: number; dimsChanged: number; total: number }> = {};
  const bump = (t: string) => (stat[t] ??= { vibeChanged: 0, dimsChanged: 0, total: 0 });
  const toWrite: { id: number; vibes?: string[] }[] = [];
  const samples: any[] = [];

  for (const it of items) {
    bump(it.type).total++;
    const curVibes = (it.vibes as string[]) ?? [];
    // books only: derive genre-only vibes for thin books with a real tone subgenre
    let newVibes: string[] | undefined;
    if (it.type === "book" && isFallback(curVibes)) {
      const derived = deriveVibes(it.genre as string[], ""); // "" = genre-only, NO desc extraction
      if (!isFallback(derived)) newVibes = derived;
    }
    const vibesForCalc = newVibes ?? curVibes;
    const newDims = calculateItemDimensions(it.genre as string[], vibesForCalc, it.description ?? "", it.totalEp ?? 0, it.voteCount ?? 0);
    const stored = it.itemDimensions as TasteDimensions | null;
    const changed = dimsDiffer(stored, newDims) || !!newVibes;
    if (!changed) continue;

    if (newVibes) bump(it.type).vibeChanged++;
    bump(it.type).dimsChanged++;
    toWrite.push({ id: it.id, vibes: newVibes });
    if (samples.length < 12 && (newVibes || it.type !== "book")) {
      const off = (d: TasteDimensions | null) => d ? DIMENSION_KEYS.filter((k) => Math.abs((d[k] ?? 0.5) - 0.5) > 0.05).map((k) => `${k.split("_")[0]}=${d[k].toFixed(2)}`).join(",") : "(null)";
      samples.push({ id: it.id, type: it.type, genre: it.genre, vibes: `${JSON.stringify(curVibes)}${newVibes ? " → " + JSON.stringify(newVibes) : ""}`, before: off(stored), after: off(newDims) });
    }
  }

  console.log("=== SCOPE (items whose fingerprint actually changes) ===");
  for (const [t, s] of Object.entries(stat)) {
    console.log(`  ${t.padEnd(6)} candidates=${s.total}  → re-null/re-vector=${s.dimsChanged}  (of which new vibes=${s.vibeChanged})`);
  }
  console.log(`  TOTAL to re-null: ${toWrite.length}`);
  console.log("\n=== sample before → after (off-0.5 axes) ===");
  for (const s of samples) {
    console.log(`  #${s.id} [${s.type}] genre=${JSON.stringify(s.genre).slice(0, 60)}`);
    console.log(`     vibes: ${s.vibes}`);
    console.log(`     dims:  ${s.before || "(neutral)"}   →   ${s.after || "(neutral)"}`);
  }

  if (DRY) {
    console.log(`\n[DRY RUN] No writes. ${toWrite.length} items would be updated (new vibes where derived) + item_dimensions=NULL, then calculate-dimensions.ts re-vectors them.`);
    await prisma.$disconnect();
    return;
  }

  // ── write: new vibes (where derived) + null dims, scoped to changed items ──
  console.log(`\nWriting ${toWrite.length} items (vibes where changed + item_dimensions=NULL)...`);
  let done = 0;
  for (let i = 0; i < toWrite.length; i += 100) {
    const batch = toWrite.slice(i, i + 100);
    await Promise.all(batch.map((w) =>
      prisma.item.update({
        where: { id: w.id },
        data: { ...(w.vibes ? { vibes: w.vibes } : {}), itemDimensions: Prisma.DbNull },
      })
    ));
    done += batch.length;
    if (done % 500 === 0 || done === toWrite.length) console.log(`  ${done}/${toWrite.length}`);
  }
  fs.writeFileSync("backfill-structured-ids.json", JSON.stringify(toWrite.map((w) => w.id), null, 1));
  console.log(`\n✅ Re-nulled ${toWrite.length} items (ids → backfill-structured-ids.json).`);
  console.log("  NEXT: npx tsx scripts/calculate-dimensions.ts   (re-vectors only the now-NULL items)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
