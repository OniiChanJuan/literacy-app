/**
 * ingest-womens-prize.ts (books arc - list 4/8): Womens Prize for Fiction 1996-2026, winners only; py defaults y-1; 2026 winner web-verified
 *
 * National Book Award for Fiction (1950–2025), winners only, via the
 * proven MARK + INGEST dual path. Scope decisions:
 *  - the 1980–1983 "American Book Awards" era is folded in via its
 *    HARDCOVER Fiction winners only (the primary line; paperback-era
 *    re-awards excluded as noise)
 *  - split years (1973/74/75) include both winners
 *  - award year = publication year (NBA honors same-year books): py = y
 *  - 2025 winner (The True True Story of Raja the Gullible, Rabih
 *    Alameddine) web-verified 2026-08-02
 * awardKey 'nba', category 'Fiction' (registry key added this batch).
 *
 * Run: npx tsx scripts/ingest-nba-fiction.ts --dry-run   # report only
 *      npx tsx scripts/ingest-nba-fiction.ts             # write
 * Plan → scripts/womens-prize-plan.json; live → scripts/womens-prize-created-ids.json
 * (marked + created), item_dimensions NULL → calculate-dimensions.ts after.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync } from "fs";
import { makeSlugFromTitle } from "../src/lib/slugs";
import { deriveVibes } from "../src/lib/google-books";
import { cleanDescription } from "../src/lib/clean-description";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DRY = process.argv.includes("--dry-run");
const GB_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const DELAY_MS = 400;
const AWARD_KEY = "womens_prize";
const CATEGORY = "";
const LEAD_GENRE = "Literary Fiction"; // per-entry override via `g`

// t=title, a=full author, tok=surname, y=Nebula year (= pub year), g=lead genre override
type Entry = { t: string; a: string; tok: string; y: number; py?: number; g?: string; alt?: string[] };
const WINNERS: Entry[] = [
  { t: "A Spell of Winter", a: "Helen Dunmore", tok: "dunmore", y: 1996 },
  { t: "Fugitive Pieces", a: "Anne Michaels", tok: "michaels", y: 1997 },
  { t: "Larry's Party", a: "Carol Shields", tok: "shields", y: 1998 },
  { t: "A Crime in the Neighborhood", a: "Suzanne Berne", tok: "berne", y: 1999, py: 1997 },
  { t: "When I Lived in Modern Times", a: "Linda Grant", tok: "grant", y: 2000, py: 2000 },
  { t: "The Idea of Perfection", a: "Kate Grenville", tok: "grenville", y: 2001, py: 1999 },
  { t: "Bel Canto", a: "Ann Patchett", tok: "patchett", y: 2002, py: 2001 },
  { t: "Property", a: "Valerie Martin", tok: "martin", y: 2003, py: 2003 },
  { t: "Small Island", a: "Andrea Levy", tok: "levy", y: 2004, py: 2004 },
  { t: "We Need to Talk About Kevin", a: "Lionel Shriver", tok: "shriver", y: 2005, py: 2003 },
  { t: "On Beauty", a: "Zadie Smith", tok: "smith", y: 2006, py: 2005 },
  { t: "Half of a Yellow Sun", a: "Chimamanda Ngozi Adichie", tok: "adichie", y: 2007, py: 2006 },
  { t: "The Road Home", a: "Rose Tremain", tok: "tremain", y: 2008, py: 2007 },
  { t: "Home", a: "Marilynne Robinson", tok: "robinson", y: 2009, py: 2008 },
  { t: "The Lacuna", a: "Barbara Kingsolver", tok: "kingsolver", y: 2010, py: 2009 },
  { t: "The Tiger's Wife", a: "Téa Obreht", tok: "obreht", y: 2011, py: 2011 },
  { t: "The Song of Achilles", a: "Madeline Miller", tok: "miller", y: 2012, py: 2011 },
  { t: "May We Be Forgiven", a: "A. M. Homes", tok: "homes", y: 2013, py: 2012 },
  { t: "A Girl Is a Half-formed Thing", a: "Eimear McBride", tok: "mcbride", y: 2014, py: 2013 },
  { t: "How to Be Both", a: "Ali Smith", tok: "smith", y: 2015, py: 2014 },
  { t: "The Glorious Heresies", a: "Lisa McInerney", tok: "mcinerney", y: 2016, py: 2015 },
  { t: "The Power", a: "Naomi Alderman", tok: "alderman", y: 2017, py: 2016 },
  { t: "Home Fire", a: "Kamila Shamsie", tok: "shamsie", y: 2018, py: 2017 },
  { t: "An American Marriage", a: "Tayari Jones", tok: "jones", y: 2019, py: 2018 },
  { t: "Hamnet", a: "Maggie O'Farrell", tok: "farrell", y: 2020, py: 2020 },
  { t: "Piranesi", a: "Susanna Clarke", tok: "clarke", y: 2021, py: 2020 },
  { t: "The Book of Form and Emptiness", a: "Ruth Ozeki", tok: "ozeki", y: 2022, py: 2021 },
  { t: "Demon Copperhead", a: "Barbara Kingsolver", tok: "kingsolver", y: 2023, py: 2022 },
  { t: "Brotherless Night", a: "V. V. Ganeshananthan", tok: "ganeshananthan", y: 2024, py: 2023 },
  { t: "The Safekeep", a: "Yael van der Wouden", tok: "wouden", y: 2025, py: 2024 },
  { t: "The Correspondent", a: "Virginia Evans", tok: "evans", y: 2026, py: 2025 },
];
const pyOf = (e: Entry) => e.py ?? e.y - 1;

// ── shared matcher/guard helpers (proven in Booker + Hugo batches) ──
function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
const BAD_EDITION = /movie tie-in|study guide|sparknotes|spark notes|summary of|analysis of|conversation starters|by the book club|workbook|teacher|omnibus|trilogy|boxed set|box set|2-in-1|complete series|collection/i;
const FOREIGN_STOPWORDS = ["und", "eine", "das", "für", "der", "les", "une", "dans", "avec", "una", "los", "para"];
function looksNonEnglish(desc: string): boolean {
  if (!desc) return false;
  const words = new Set(desc.toLowerCase().replace(/[^a-zà-ÿ ]+/g, " ").split(/\s+/));
  return FOREIGN_STOPWORDS.filter((w) => words.has(w)).length >= 2;
}
function titleKeys(e: Entry): string[] { return [e.t, ...(e.alt ?? [])].map(norm); }
function titleMatches(e: Entry, gbTitle: string): boolean {
  const gt = norm(gbTitle);
  return titleKeys(e).some((k) => gt === k || gt.startsWith(k + " "));
}
function titleExact(e: Entry, gbTitle: string): boolean { return titleKeys(e).includes(norm(gbTitle)); }
function authorMatches(e: Entry, gbAuthors: string[]): boolean {
  const wantFirst = norm(e.a).split(" ")[0]?.[0] ?? "";
  const stripSuffix = (parts: string[]) => {
    while (parts.length > 1 && ["jr", "sr", "ii", "iii", "iv"].includes(parts[parts.length - 1])) parts.pop();
    return parts;
  };
  const wantNorm = stripSuffix(norm(e.a).split(" ")).join(" ");
  return (gbAuthors || []).some((a) => {
    const parts = stripSuffix(norm(a).split(" "));
    if (parts.join(" ") === wantNorm) return true;
    return parts[parts.length - 1] === norm(e.tok) && (parts[0]?.[0] ?? "") === wantFirst;
  });
}
function isOmnibus(e: Entry, gbTitle: string): boolean {
  const gt = norm(gbTitle);
  return WINNERS.some((w) => w !== e && gt.includes(norm(w.t)) && norm(w.t).length > 8);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function gbSearch(q: string): Promise<any[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&printType=books&langRestrict=en${GB_KEY ? `&key=${GB_KEY}` : ""}`;
  const res = await fetch(url);
  if (res.status === 429) { console.log("  ⚠ 429 — backing off 15s"); await sleep(15_000); return gbSearch(q); }
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return data?.items ?? [];
}
function pickEdition(e: Entry, vols: any[]): any | null {
  const py = pyOf(e);
  const base = vols.filter((v) => {
    const info = v.volumeInfo;
    if (!info?.title || BAD_EDITION.test(info.title + " " + (info.subtitle || ""))) return false;
    if (isOmnibus(e, info.title)) return false;
    if (looksNonEnglish(info.description || "")) return false;
    const full = info.title + (info.subtitle ? `: ${info.subtitle}` : "");
    if (!titleMatches(e, info.title) && !titleMatches(e, full)) return false;
    if (!authorMatches(e, info.authors)) return false;
    const gy = parseInt((info.publishedDate || "0").slice(0, 4)) || 0;
    if (gy && gy < py - 1) return false;
    return true;
  });
  const exact = base.filter((v) => titleExact(e, v.volumeInfo.title));
  const cands = exact.length ? exact : base;
  cands.sort((a, b) => {
    const ca = a.volumeInfo.imageLinks?.thumbnail ? 1 : 0, cb = b.volumeInfo.imageLinks?.thumbnail ? 1 : 0;
    if (ca !== cb) return cb - ca;
    // solo-author editions beat co-credited ones (play adaptations, reprint-
    // mill "editor" credits — The Late George Apley 1946 stage-version trap)
    const sa = (a.volumeInfo.authors?.length ?? 9) === 1 ? 1 : 0, sb = (b.volumeInfo.authors?.length ?? 9) === 1 ? 1 : 0;
    if (sa !== sb) return sb - sa;
    const pa = (a.volumeInfo.pageCount ?? 0) >= 100 ? 1 : 0, pb = (b.volumeInfo.pageCount ?? 0) >= 100 ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const da = (a.volumeInfo.description?.length ?? 0) > 50 ? 1 : 0, db = (b.volumeInfo.description?.length ?? 0) > 50 ? 1 : 0;
    if (da !== db) return db - da;
    return (b.volumeInfo.ratingsCount ?? 0) - (a.volumeInfo.ratingsCount ?? 0);
  });
  return cands[0] ?? null;
}
function mapCategories(categories?: string[]): string[] {
  const genres: string[] = [];
  for (const cat of categories ?? []) for (const p of cat.split(/\s*\/\s*/)) {
    const t = p.trim(); if (t && !genres.includes(t)) genres.push(t);
  }
  return genres.slice(0, 4);
}

async function main() {
  console.log(`Womens Prize mark+ingest — ${DRY ? "DRY RUN (no writes)" : "LIVE"}\n`);
  console.log(`winners embedded: ${WINNERS.length} (1996-2026)\n`);

  const existingBooks = await prisma.item.findMany({
    where: { type: "book" },
    select: { id: true, title: true, year: true, people: true, awards: true, googleBooksId: true, slug: true },
  });
  const existingSlugs = new Set(existingBooks.map((b) => b.slug).filter(Boolean) as string[]);
  const existingGbIds = new Set(existingBooks.map((b) => b.googleBooksId).filter(Boolean) as string[]);
  console.log(`existing books: ${existingBooks.length}\n`);

  // ── pass 1: MARK — find existing catalog items (title+author) ──
  // Same discipline as the GB picker: companion/study titles excluded and
  // exact-title candidates beat prefix ones (dry-run trap: "Beloved" prefix-
  // matched "Beloved - Multiple Critical Perspectives", an essay companion).
  const BAD_MARK = /critical perspectives|critical companion|critical essays|casebook|cliffs notes|study guide|sparknotes|summary of|analysis of|workbook/i;
  const findExisting = (e: Entry) => {
    const keys = titleKeys(e);
    const cands = existingBooks.filter((b) => {
      if (BAD_MARK.test(b.title)) return false;
      const bk = norm(b.title);
      const tOk = keys.some((k) => bk === k || bk.startsWith(k + " "));
      if (!tOk) return false;
      const ppl = Array.isArray(b.people) ? (b.people as any[]) : [];
      return ppl.some((p) => p?.name && authorMatches(e, [String(p.name)]));
    });
    const byCloseness = (a: any, b: any) => Math.abs(a.year - pyOf(e)) - Math.abs(b.year - pyOf(e));
    const exact = cands.filter((b) => keys.includes(norm(b.title))).sort(byCloseness);
    const prefix = cands.filter((b) => !keys.includes(norm(b.title))).sort(byCloseness);
    return exact[0] ?? prefix[0] ?? null;
  };

  const toMark: { e: Entry; itemId: number; title: string; year: number }[] = [];
  const toIngest: Entry[] = [];
  for (const e of WINNERS) {
    const hit = findExisting(e);
    if (hit) toMark.push({ e, itemId: hit.id, title: hit.title, year: hit.year });
    else toIngest.push(e);
  }
  console.log(`MARK (already in catalog): ${toMark.length}`);
  for (const m of toMark.slice(0, 60)) console.log(`  ✓ ${m.e.y}: "${m.e.t}" → #${m.itemId} "${m.title}" (${m.year})`);
  console.log(`\nINGEST candidates: ${toIngest.length}\n`);

  // ── pass 2: INGEST — GB pipeline for the absent ──
  type Plan = {
    entry: Entry; volumeId: string; gbTitle: string; gbAuthors: string[]; gbPublished: string;
    cover: string; descLen: number; categories: string[]; ratingsCount: number;
    averageRating: number; pageCount: number; vibes: string[]; fallbackVibes: boolean; slug: string;
  };
  const plan: Plan[] = [];
  const misses: string[] = [];
  for (const e of toIngest) {
    let vols = await gbSearch(`intitle:"${e.t}" inauthor:${e.tok}`);
    let best = pickEdition(e, vols);
    if (!best) { await sleep(DELAY_MS); vols = await gbSearch(`inauthor:"${e.a}"`); best = pickEdition(e, vols); }
    await sleep(DELAY_MS);
    if (!best) { misses.push(`${e.t} (${e.a}, ${e.y})`); console.log(`  ✗ MISS "${e.t}" — ${e.a}`); continue; }

    const info = best.volumeInfo;
    const cover = (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "")
      .replace("&edge=curl", "").replace("zoom=1", "zoom=2").replace("http://", "https://");
    const categories = [...new Set([e.g ?? LEAD_GENRE, ...mapCategories(info.categories)])].slice(0, 4);
    const desc = cleanDescription((info.description || "").replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim(), "book");
    const vibes = deriveVibes(categories, desc);
    let slug = makeSlugFromTitle(e.t);
    if (existingSlugs.has(slug)) slug = `${slug}-${pyOf(e)}`;
    let n = 2; while (existingSlugs.has(slug)) slug = `${makeSlugFromTitle(e.t)}-${pyOf(e)}-${n++}`;
    existingSlugs.add(slug);
    plan.push({
      entry: e, volumeId: best.id, gbTitle: info.title + (info.subtitle ? `: ${info.subtitle}` : ""),
      gbAuthors: info.authors || [], gbPublished: info.publishedDate || "?", cover,
      descLen: desc.length, categories, ratingsCount: info.ratingsCount ?? 0,
      averageRating: info.averageRating ?? 0, pageCount: info.pageCount ?? 0, vibes,
      fallbackVibes: vibes.length === 1 && vibes[0] === "thought-provoking", slug,
    });
    console.log(`  ${cover ? "🖼" : "··"} "${e.t}" (${e.y}) → [${best.id}] "${info.title}" by ${(info.authors || []).join(", ")} (${info.publishedDate || "?"})`);
  }

  const withCover = plan.filter((p) => p.cover).length;
  const thin = plan.filter((p) => p.fallbackVibes);
  console.log("\n=== WOMENS PRIZE DRY-RUN REPORT ===");
  console.log(`  winners:         ${WINNERS.length}`);
  console.log(`  mark existing:   ${toMark.length}`);
  console.log(`  ingest planned:  ${plan.length}`);
  console.log(`  misses:          ${misses.length}${misses.length ? " — " + misses.join("; ") : ""}`);
  console.log(`  ingest covers:   ${withCover}/${plan.length}`);
  console.log(`  dimension-thin:  ${thin.length}${thin.length ? " — " + thin.map((p) => p.entry.t).join("; ") : ""}`);

  writeFileSync("scripts/womens-prize-plan.json", JSON.stringify({ mark: toMark.map((m) => ({ y: m.e.y, t: m.e.t, itemId: m.itemId })), ingest: plan }, null, 1));
  console.log(`\nPlan → scripts/womens-prize-plan.json`);

  if (DRY) {
    console.log(`\n[DRY RUN] No writes. Live: ${toMark.length} marks + ${plan.length} ingests + ${toMark.length + plan.length} womens_prize Award rows.`);
    await prisma.$disconnect();
    return;
  }

  // ── LIVE ──
  const created: any[] = [];
  // marks: award rows + JSON cache
  const markRows = toMark.map((m) => ({ itemId: m.itemId, awardKey: AWARD_KEY, category: CATEGORY, year: m.e.y, result: "won" }));
  const mr = await prisma.award.createMany({ data: markRows, skipDuplicates: true });
  for (const m of toMark) {
    const row = existingBooks.find((b) => b.id === m.itemId)!;
    const cur: string[] = Array.isArray(row.awards) ? (row.awards as string[]) : [];
    if (!cur.includes(AWARD_KEY)) await prisma.item.update({ where: { id: m.itemId }, data: { awards: [...cur, AWARD_KEY] } });
  }
  console.log(`✓ marked ${mr.count} existing items with ${AWARD_KEY} rows`);

  for (const p of plan) {
    if (existingGbIds.has(p.volumeId)) { console.log(`  skip (gbId exists): ${p.entry.t}`); continue; }
    const gbAuthorRaw = p.gbAuthors.find((a) => norm(a).includes(norm(p.entry.tok)));
    const gbAuthor = gbAuthorRaw && gbAuthorRaw !== gbAuthorRaw.toUpperCase() ? gbAuthorRaw : p.entry.a;
    const item = await prisma.item.create({
      data: {
        title: p.entry.t, type: "book", genre: p.categories, vibes: p.vibes,
        year: pyOf(p.entry), cover: p.cover, description: "",
        people: [{ role: "Author", name: gbAuthor }] as any,
        awards: [AWARD_KEY] as any, platforms: ["kindle", "library"] as any,
        ext: (p.averageRating ? { google_books: Math.min(p.averageRating * 2, 10) } : {}) as any,
        totalEp: p.pageCount, voteCount: p.ratingsCount,
        googleBooksId: p.volumeId, slug: p.slug, lastSyncedAt: new Date(),
      },
      select: { id: true },
    });
    const vol = await fetch(`https://www.googleapis.com/books/v1/volumes/${p.volumeId}${GB_KEY ? `?key=${GB_KEY}` : ""}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const rawDesc = vol?.volumeInfo?.description || "";
    const detailPages = vol?.volumeInfo?.pageCount || 0;
    const detailCover = !p.cover
      ? (vol?.volumeInfo?.imageLinks?.thumbnail || vol?.volumeInfo?.imageLinks?.smallThumbnail || "")
          .replace("&edge=curl", "").replace("zoom=1", "zoom=2").replace("http://", "https://")
      : "";
    await prisma.item.update({
      where: { id: item.id },
      data: {
        description: cleanDescription(rawDesc.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim(), "book"),
        ...(detailPages > p.pageCount ? { totalEp: detailPages } : {}),
        ...(detailCover ? { cover: detailCover } : {}),
      },
    });
    if (p.averageRating) {
      await prisma.externalScore.upsert({
        where: { itemId_source: { itemId: item.id, source: "google_books" } },
        update: { score: p.averageRating, maxScore: 5, updatedAt: new Date() },
        create: { itemId: item.id, source: "google_books", score: p.averageRating, maxScore: 5, scoreType: "community", label: "" },
      });
    }
    const award = await prisma.award.create({
      data: { itemId: item.id, awardKey: AWARD_KEY, category: CATEGORY, year: p.entry.y, result: "won" },
      select: { id: true },
    });
    created.push({ itemId: item.id, awardRowId: award.id, volumeId: p.volumeId, title: p.entry.t });
    console.log(`  ✓ #${item.id} "${p.entry.t}" (pub ${pyOf(p.entry)}, WP ${p.entry.y})`);
    await sleep(DELAY_MS);
  }

  writeFileSync("scripts/womens-prize-created-ids.json", JSON.stringify({ marked: toMark.map((m) => m.itemId), created }, null, 1));
  console.log(`\n✅ ${mr.count} marked + ${created.length} created (→ scripts/womens-prize-created-ids.json).`);
  console.log("  NEXT: npx tsx scripts/calculate-dimensions.ts");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
