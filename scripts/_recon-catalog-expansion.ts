/**
 * One-time READ-ONLY reconciliation of the catalog-expansion spreadsheet (460 titles)
 * against the real Item catalog. Produces confirmed-missing vs already-present and flags
 * every disagreement with the sheet's Status guess. Does NOT write or ingest anything.
 *
 * Run: npx tsx scripts/_recon-catalog-expansion.ts
 * Reads: catalog-expansion-titles.json (exported from the xlsx)
 * Writes: catalog-expansion-recon.json (report data only, local file)
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";

type Sheet = { title: string; media: string; activates: number; pending: number; status: string; anchors: string };

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}
function norm(s: string): string {
  return stripDiacritics(String(s).toLowerCase())
    .replace(/&/g, " and ")
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function keyMain(s: string): string {
  return norm(s).replace(/ /g, "");
}
function keyNoArticle(s: string): string {
  return norm(s).replace(/^(the|a|an) /, "").replace(/ /g, "");
}

// sheet media -> tolerant set of DB types it may legitimately match
const TYPE_OK: Record<string, Set<string>> = {
  Game: new Set(["game"]),
  Movie: new Set(["movie", "anime"]),
  TV: new Set(["tv", "anime"]),
  Book: new Set(["book"]),
  Manga: new Set(["manga", "comic"]),
  Anime: new Set(["anime", "tv", "movie"]),
};

async function main() {
  const sheet: Sheet[] = JSON.parse(fs.readFileSync("catalog-expansion-titles.json", "utf-8"));

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL! });
  const prisma = new PrismaClient({ adapter });

  // distinct type vocabulary
  const typeRows = await prisma.item.groupBy({ by: ["type"], _count: { _all: true } });
  console.log("TYPE VOCAB:", typeRows.map((t) => `${t.type}:${t._count._all}`).join("  "));

  // bulk read minimal fields once
  const items = await prisma.item.findMany({
    select: { id: true, title: true, type: true, year: true, isUpcoming: true },
  });
  console.log(`Catalog items loaded: ${items.length}`);

  // index by both keys
  const byMain = new Map<string, typeof items>();
  const byNoArt = new Map<string, typeof items>();
  for (const it of items) {
    const km = keyMain(it.title);
    const ka = keyNoArticle(it.title);
    (byMain.get(km) ?? byMain.set(km, []).get(km)!).push(it);
    (byNoArt.get(ka) ?? byNoArt.set(ka, []).get(ka)!).push(it);
  }

  const results = sheet.map((row) => {
    const okTypes = TYPE_OK[row.media] ?? new Set<string>();
    const km = keyMain(row.title);
    const ka = keyNoArticle(row.title);
    const cand = new Map<number, (typeof items)[number]>();
    for (const it of byMain.get(km) ?? []) cand.set(it.id, it);
    for (const it of byNoArt.get(ka) ?? []) cand.set(it.id, it);
    const all = [...cand.values()];
    const typeMatches = all.filter((it) => okTypes.has(it.type));
    const exactTypeMatches = typeMatches.filter(
      (it) => it.type === row.media.toLowerCase() || (row.media === "Anime" && it.type === "anime")
    );
    const present = typeMatches.length > 0;
    return {
      title: row.title,
      media: row.media,
      activates: row.activates,
      pending: row.pending,
      sheetStatus: row.status,
      present,
      matches: typeMatches.map((m) => ({ id: m.id, title: m.title, type: m.type, year: m.year, upcoming: m.isUpcoming })),
      // wrong-type-only hits (e.g. a book whose name only exists as a movie) — adaptation/name-collision signal
      otherTypeOnly: present ? [] : all.filter((it) => !okTypes.has(it.type)).map((m) => ({ id: m.id, title: m.title, type: m.type, year: m.year })),
      crossTypeNote: present && exactTypeMatches.length === 0 ? typeMatches.map((m) => m.type) : [],
    };
  });

  // ---- FUZZY SECOND PASS for the exact-missing set (catch subtitle/abbrev/suffix variants) ----
  const toks = (s: string) => norm(s).split(" ").filter(Boolean);
  const stripTrailers = (s: string) =>
    s.replace(/\(\d{4}\)/g, " ").replace(/\b(s\d+|season\s*\d+|us|uk)\b/gi, " ");
  const fuzzyFor = (row: Sheet) => {
    const okTypes = TYPE_OK[row.media] ?? new Set<string>();
    const qk = keyMain(stripTrailers(row.title));
    const qtoks = toks(stripTrailers(row.title));
    const out: { id: number; title: string; type: string; year: number; why: string }[] = [];
    for (const it of items) {
      if (!okTypes.has(it.type)) continue;
      const tk = keyMain(it.title);
      const ttoks = toks(it.title);
      if (qk.length < 4 || tk.length < 4) continue;
      let why = "";
      if (tk.startsWith(qk)) why = "title starts-with query (subtitle)";
      else if (qk.startsWith(tk)) why = "query starts-with title";
      else if (qtoks.length >= 2 && qtoks.every((t) => ttoks.includes(t))) why = "all query tokens in title";
      else if (ttoks.length >= 2 && ttoks.every((t) => qtoks.includes(t))) why = "all title tokens in query";
      else if (qk.length >= 6 && tk.includes(qk)) why = "query substring of title";
      if (why) out.push({ id: it.id, title: it.title, type: it.type, year: it.year, why });
    }
    return out.slice(0, 6);
  };

  for (const r of results) {
    if (!r.present) (r as any).fuzzy = fuzzyFor({ title: r.title, media: r.media } as Sheet);
  }

  fs.writeFileSync("catalog-expansion-recon.json", JSON.stringify(results, null, 1));

  console.log(`\n\n##### FUZZY SECOND PASS — exact-missing titles with candidate matches #####`);
  const missForFuzzy = results.filter((r) => !r.present);
  let withFuzzy = 0;
  for (const r of missForFuzzy.sort((a, b) => b.activates - a.activates)) {
    const f = (r as any).fuzzy as { id: number; title: string; type: string; year: number; why: string }[];
    if (f.length === 0) continue;
    withFuzzy++;
    console.log(`  [${r.media}] "${r.title}" (act ${r.activates}, sheet:${r.sheetStatus})`);
    for (const c of f) console.log(`        ~ #${c.id} "${c.title}" ${c.type} ${c.year}  [${c.why}]`);
  }
  console.log(`\n  ${withFuzzy} of ${missForFuzzy.length} exact-missing have fuzzy candidates (adjudicate).`);
  console.log(`\n  --- exact-missing with NO fuzzy candidate (likely TRULY missing) ---`);
  for (const r of missForFuzzy.filter((r) => ((r as any).fuzzy || []).length === 0).sort((a, b) => b.activates - a.activates)) {
    console.log(`        [${r.media}] "${r.title}" (act ${r.activates}, sheet:${r.sheetStatus})`);
  }

  // ---- summary ----
  const present = results.filter((r) => r.present);
  const missing = results.filter((r) => !r.present);
  console.log(`\nPRESENT: ${present.length}   MISSING: ${missing.length}   TOTAL: ${results.length}`);

  const guessAdd = (r: (typeof results)[number]) => String(r.sheetStatus).startsWith("ADD");
  const guessIn = (r: (typeof results)[number]) => String(r.sheetStatus).startsWith("in catalog");
  const guessCheck = (r: (typeof results)[number]) => String(r.sheetStatus).includes("CHECK");

  const disagreeAddButPresent = results.filter((r) => guessAdd(r) && r.present);
  const disagreeInButMissing = results.filter((r) => guessIn(r) && !r.present);
  console.log(`\nDISAGREEMENTS:`);
  console.log(`  flagged ADD IT but PRESENT: ${disagreeAddButPresent.length}`);
  console.log(`  marked in-catalog but MISSING: ${disagreeInButMissing.length}`);

  console.log(`\n=== DISAGREE: ADD IT but PRESENT (${disagreeAddButPresent.length}) ===`);
  for (const r of disagreeAddButPresent.sort((a, b) => b.activates - a.activates)) {
    console.log(`  [${r.media}] ${r.title}  (act ${r.activates}) -> ${r.matches.map((m) => `#${m.id} "${m.title}" ${m.type} ${m.year}${m.upcoming ? " UPCOMING" : ""}`).join(" | ")}`);
  }
  console.log(`\n=== DISAGREE: in-catalog but MISSING (${disagreeInButMissing.length}) ===`);
  for (const r of disagreeInButMissing.sort((a, b) => b.activates - a.activates)) {
    console.log(`  [${r.media}] ${r.title}  (act ${r.activates})${r.otherTypeOnly.length ? "  other-type-only: " + r.otherTypeOnly.map((m) => `${m.type} "${m.title}"`).join(", ") : ""}`);
  }

  console.log(`\n=== CHECK (mixed) RESOLUTIONS (${results.filter(guessCheck).length}) ===`);
  for (const r of results.filter(guessCheck).sort((a, b) => b.activates - a.activates)) {
    console.log(`  [${r.media}] ${r.title} (act ${r.activates}) -> ${r.present ? "PRESENT " + r.matches.map((m) => `#${m.id} ${m.type} ${m.year}`).join(",") : "MISSING"}${r.otherTypeOnly.length ? "  (other-type: " + r.otherTypeOnly.map((m) => m.type).join(",") + ")" : ""}`);
  }

  // cross-type matches worth eyeballing (matched but only via tolerant type)
  const crossType = results.filter((r) => r.crossTypeNote.length > 0);
  console.log(`\n=== CROSS-TYPE MATCHES (matched only via tolerant type, eyeball) (${crossType.length}) ===`);
  for (const r of crossType) {
    console.log(`  [${r.media}] ${r.title} -> ${r.matches.map((m) => `#${m.id} ${m.type} ${m.year}`).join(", ")}`);
  }

  // confirmed-missing grouped by media
  console.log(`\n=== CONFIRMED-MISSING by media ===`);
  const byMedia = new Map<string, (typeof results)[number][]>();
  for (const r of missing) (byMedia.get(r.media) ?? byMedia.set(r.media, []).get(r.media)!).push(r);
  for (const [m, arr] of [...byMedia.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${m}: ${arr.length}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
