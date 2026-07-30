/**
 * ingest-booker-winners.ts (awards workstream step 3 — Booker PILOT)
 *
 * Ingests the ~50 Booker Prize winners missing from the catalog
 * (the `booker` entries of scripts/awards-pending-review.json) via the
 * Google Books API, then (live mode) marks them with `booker` Award
 * rows + the awards JSON display cache.
 *
 * Curated bar: prize winners only — the list is embedded (title,
 * FULL author, award year) and cross-checked against the pending
 * file at startup so provenance stays anchored to step 1's delta.
 *
 * Book-specific safeguards (lessons from step 1 + music batches):
 *  - dedup by normalized title + AUTHOR (title-only would wrongly block
 *    "The Sea" (Banville) because an unrelated "The Sea" exists)
 *  - stored year = ORIGINAL publication year (= Booker award year),
 *    never the edition's publishedDate → kills edition-year drift
 *  - edition choice: title+author-verified candidates only, ranked
 *    cover > ratingsCount > description; tie-in/study-guide/summary
 *    editions excluded; editions dated >1y before publication rejected
 *  - fallback query by author when intitle search misses ("G.")
 *  - dimension-thin flag: winners landing on fallback-only vibes are
 *    counted and listed (literary fiction is the thin-metadata risk)
 *
 * Run: npx tsx scripts/ingest-booker-winners.ts --dry-run   # report only
 *      npx tsx scripts/ingest-booker-winners.ts             # write
 * Dry-run also writes scripts/booker-pilot-plan.json (chosen editions)
 * for review. Live mode writes scripts/booker-created-ids.json and
 * leaves item_dimensions NULL — run calculate-dimensions.ts afterward.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync, readFileSync } from "fs";
import { makeSlugFromTitle } from "../src/lib/slugs";
import { deriveVibes } from "../src/lib/google-books";
import { cleanDescription } from "../src/lib/clean-description";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DRY = process.argv.includes("--dry-run");
const GB_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const DELAY_MS = 400;

// ── the 50 missing winners (title, full author, lastname token, award year) ──
type Entry = { t: string; a: string; tok: string; y: number; alt?: string[] };
const WINNERS: Entry[] = [
  { t: "Something to Answer For", a: "P. H. Newby", tok: "newby", y: 1969 },
  { t: "The Elected Member", a: "Bernice Rubens", tok: "rubens", y: 1970 },
  { t: "In a Free State", a: "V. S. Naipaul", tok: "naipaul", y: 1971 },
  { t: "G.", a: "John Berger", tok: "berger", y: 1972, alt: ["G"] },
  { t: "The Siege of Krishnapur", a: "J. G. Farrell", tok: "farrell", y: 1973 },
  { t: "The Conservationist", a: "Nadine Gordimer", tok: "gordimer", y: 1974 },
  { t: "Holiday", a: "Stanley Middleton", tok: "middleton", y: 1974 },
  { t: "Heat and Dust", a: "Ruth Prawer Jhabvala", tok: "jhabvala", y: 1975 },
  { t: "Saville", a: "David Storey", tok: "storey", y: 1976 },
  { t: "Staying On", a: "Paul Scott", tok: "scott", y: 1977 },
  { t: "The Sea, the Sea", a: "Iris Murdoch", tok: "murdoch", y: 1978 },
  { t: "Offshore", a: "Penelope Fitzgerald", tok: "fitzgerald", y: 1979 },
  { t: "Rites of Passage", a: "William Golding", tok: "golding", y: 1980 },
  { t: "Midnight's Children", a: "Salman Rushdie", tok: "rushdie", y: 1981 },
  { t: "Schindler's Ark", a: "Thomas Keneally", tok: "keneally", y: 1982, alt: ["Schindler's List"] },
  { t: "Life & Times of Michael K", a: "J. M. Coetzee", tok: "coetzee", y: 1983, alt: ["Life and Times of Michael K"] },
  { t: "Hotel du Lac", a: "Anita Brookner", tok: "brookner", y: 1984 },
  { t: "The Bone People", a: "Keri Hulme", tok: "hulme", y: 1985 },
  { t: "The Old Devils", a: "Kingsley Amis", tok: "amis", y: 1986 },
  { t: "Moon Tiger", a: "Penelope Lively", tok: "lively", y: 1987 },
  { t: "Oscar and Lucinda", a: "Peter Carey", tok: "carey", y: 1988 },
  { t: "Possession", a: "A. S. Byatt", tok: "byatt", y: 1990, alt: ["Possession: A Romance"] },
  { t: "The Famished Road", a: "Ben Okri", tok: "okri", y: 1991 },
  { t: "The English Patient", a: "Michael Ondaatje", tok: "ondaatje", y: 1992 },
  { t: "Sacred Hunger", a: "Barry Unsworth", tok: "unsworth", y: 1992 },
  { t: "Paddy Clarke Ha Ha Ha", a: "Roddy Doyle", tok: "doyle", y: 1993 },
  { t: "How Late It Was, How Late", a: "James Kelman", tok: "kelman", y: 1994 },
  { t: "The Ghost Road", a: "Pat Barker", tok: "barker", y: 1995 },
  { t: "Last Orders", a: "Graham Swift", tok: "swift", y: 1996 },
  { t: "The God of Small Things", a: "Arundhati Roy", tok: "roy", y: 1997 },
  { t: "Amsterdam", a: "Ian McEwan", tok: "mcewan", y: 1998 },
  { t: "Disgrace", a: "J. M. Coetzee", tok: "coetzee", y: 1999 },
  { t: "True History of the Kelly Gang", a: "Peter Carey", tok: "carey", y: 2001 },
  { t: "Vernon God Little", a: "DBC Pierre", tok: "pierre", y: 2003 },
  { t: "The Line of Beauty", a: "Alan Hollinghurst", tok: "hollinghurst", y: 2004 },
  { t: "The Sea", a: "John Banville", tok: "banville", y: 2005 },
  { t: "The Gathering", a: "Anne Enright", tok: "enright", y: 2007 },
  { t: "The White Tiger", a: "Aravind Adiga", tok: "adiga", y: 2008 },
  { t: "Wolf Hall", a: "Hilary Mantel", tok: "mantel", y: 2009 },
  { t: "The Finkler Question", a: "Howard Jacobson", tok: "jacobson", y: 2010 },
  { t: "The Sense of an Ending", a: "Julian Barnes", tok: "barnes", y: 2011 },
  { t: "Bring Up the Bodies", a: "Hilary Mantel", tok: "mantel", y: 2012 },
  { t: "The Luminaries", a: "Eleanor Catton", tok: "catton", y: 2013 },
  { t: "The Narrow Road to the Deep North", a: "Richard Flanagan", tok: "flanagan", y: 2014 },
  { t: "The Sellout", a: "Paul Beatty", tok: "beatty", y: 2016 },
  { t: "Girl, Woman, Other", a: "Bernardine Evaristo", tok: "evaristo", y: 2019 },
  { t: "The Promise", a: "Damon Galgut", tok: "galgut", y: 2021 },
  { t: "The Seven Moons of Maali Almeida", a: "Shehan Karunatilaka", tok: "karunatilaka", y: 2022 },
  { t: "Prophet Song", a: "Paul Lynch", tok: "lynch", y: 2023 },
  { t: "Flesh", a: "David Szalay", tok: "szalay", y: 2025 },
];

// ── matching helpers (step-1 normalization) ──
function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
const BAD_EDITION = /movie tie-in|study guide|sparknotes|spark notes|summary of|analysis of|conversation starters|by the book club|workbook|teacher/i;

/** Foreign-language school editions slip through langRestrict=en with a
 *  mislabeled language (found: Klett Sprachen's White Tiger, lang="en",
 *  German description). ≥2 distinct non-English stopwords → reject. */
const FOREIGN_STOPWORDS = ["und", "eine", "das", "für", "der", "les", "une", "dans", "avec", "una", "los", "para"];
function looksNonEnglish(desc: string): boolean {
  if (!desc) return false;
  const words = new Set(desc.toLowerCase().replace(/[^a-zà-ÿ ]+/g, " ").split(/\s+/));
  return FOREIGN_STOPWORDS.filter((w) => words.has(w)).length >= 2;
}

function titleMatches(e: Entry, gbTitle: string): boolean {
  const keys = [e.t, ...(e.alt ?? [])].map(norm);
  const gt = norm(gbTitle);
  return keys.some((k) => gt === k || gt.startsWith(k + " "));
}
function titleExact(e: Entry, gbTitle: string): boolean {
  const keys = [e.t, ...(e.alt ?? [])].map(norm);
  return keys.includes(norm(gbTitle));
}

/** GB author must be the same person: same surname AND same first initial.
 *  (Token containment let "K. W. Middleton" pass for Stanley Middleton.) */
function authorMatches(e: Entry, gbAuthors: string[]): boolean {
  const wantFirst = norm(e.a).split(" ")[0]?.[0] ?? "";
  return (gbAuthors || []).some((a) => {
    const na = norm(a);
    const parts = na.split(" ");
    if (na === norm(e.a)) return true;
    return parts[parts.length - 1] === norm(e.tok) && (parts[0]?.[0] ?? "") === wantFirst;
  });
}

/** Omnibus guard: an edition whose title swallows ANOTHER winner's title
 *  (e.g. "Oscar and Lucinda, True History of the Kelly Gang") is not a
 *  standalone edition of this book. */
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
  const base = vols.filter((v) => {
    const info = v.volumeInfo;
    if (!info?.title || BAD_EDITION.test(info.title + " " + (info.subtitle || ""))) return false;
    if (isOmnibus(e, info.title)) return false;
    if (looksNonEnglish(info.description || "")) return false;
    const full = info.title + (info.subtitle ? `: ${info.subtitle}` : "");
    if (!titleMatches(e, info.title) && !titleMatches(e, full)) return false;
    if (!authorMatches(e, info.authors)) return false;
    // an edition can't predate original publication by >1 year (wrong-book guard)
    const gy = parseInt((info.publishedDate || "0").slice(0, 4)) || 0;
    if (gy && gy < e.y - 1) return false;
    return true;
  });
  // exact-title editions ALWAYS beat prefix/subtitle ones (step-1 lesson)
  const exact = base.filter((v) => titleExact(e, v.volumeInfo.title));
  const cands = exact.length ? exact : base;
  cands.sort((a, b) => {
    const ca = a.volumeInfo.imageLinks?.thumbnail ? 1 : 0;
    const cb = b.volumeInfo.imageLinks?.thumbnail ? 1 : 0;
    if (ca !== cb) return cb - ca;
    // plausible novel-length metadata beats excerpt-grade editions (16-page trap)
    const pa = (a.volumeInfo.pageCount ?? 0) >= 100 ? 1 : 0;
    const pb = (b.volumeInfo.pageCount ?? 0) >= 100 ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const da = (a.volumeInfo.description?.length ?? 0) > 50 ? 1 : 0;
    const db = (b.volumeInfo.description?.length ?? 0) > 50 ? 1 : 0;
    if (da !== db) return db - da;
    const ra = a.volumeInfo.ratingsCount ?? 0, rb = b.volumeInfo.ratingsCount ?? 0;
    if (ra !== rb) return rb - ra;
    return (b.volumeInfo.description?.length ?? 0) - (a.volumeInfo.description?.length ?? 0);
  });
  return cands[0] ?? null;
}

function mapCategories(categories?: string[]): string[] {
  const genres: string[] = [];
  for (const cat of categories ?? []) {
    for (const p of cat.split(/\s*\/\s*/)) {
      const trimmed = p.trim();
      if (trimmed && !genres.includes(trimmed)) genres.push(trimmed);
    }
  }
  return genres.slice(0, 4);
}

async function main() {
  console.log(`Booker winners ingestion PILOT — ${DRY ? "DRY RUN (no writes)" : "LIVE"}\n`);

  // provenance cross-check against step 1's pending delta
  const pending = JSON.parse(readFileSync("scripts/awards-pending-review.json", "utf8"))
    .filter((p: any) => p.awardKey === "booker");
  const pendingKeys = new Set(pending.map((p: any) => norm(p.title)));
  const listKeys = new Set(WINNERS.map((w) => norm(w.t)));
  const notInPending = WINNERS.filter((w) => !pendingKeys.has(norm(w.t)));
  const notInList = pending.filter((p: any) => !listKeys.has(norm(p.title)));
  console.log(`pending-file booker entries: ${pending.length}; embedded list: ${WINNERS.length}`);
  if (notInPending.length) console.log(`  ⚠ in list but NOT in pending file: ${notInPending.map((w) => w.t).join("; ")}`);
  if (notInList.length) console.log(`  ⚠ in pending file but NOT in list: ${notInList.map((p: any) => p.title).join("; ")}`);
  console.log();

  // existing books for dedup (title+AUTHOR) + slug pool (site-wide, slugs are per-type-routed but keep globally unique among books)
  const existingBooks = await prisma.item.findMany({
    where: { type: "book" },
    select: { id: true, title: true, people: true, googleBooksId: true, slug: true },
  });
  const existingTA = new Set<string>();
  for (const b of existingBooks) {
    const ppl = Array.isArray(b.people) ? (b.people as any[]) : [];
    for (const p of ppl) {
      if (p?.name) existingTA.add(`${norm(b.title)}|${norm(String(p.name))}`);
    }
  }
  const existingGbIds = new Set(existingBooks.map((b) => b.googleBooksId).filter(Boolean) as string[]);
  const existingSlugs = new Set(existingBooks.map((b) => b.slug).filter(Boolean) as string[]);
  console.log(`existing books: ${existingBooks.length}\n`);

  type Plan = {
    entry: Entry; volumeId: string; gbTitle: string; gbAuthors: string[];
    gbPublished: string; editionDrift: number; cover: string; descLen: number;
    categories: string[]; ratingsCount: number; averageRating: number; pageCount: number;
    vibes: string[]; fallbackVibes: boolean; titleCollision: boolean; slug: string;
  };
  const plan: Plan[] = [];
  const misses: string[] = [];
  const alreadyPresent: string[] = [];

  for (const e of WINNERS) {
    // title+author dedup — is it already in the catalog?
    const dupHit = existingTA.has(`${norm(e.t)}|${norm(e.a)}`) ||
      [...existingTA].some((k) => k.startsWith(norm(e.t) + "|") && k.split("|")[1].includes(norm(e.tok)));
    if (dupHit) { alreadyPresent.push(`${e.t} (${e.a})`); continue; }

    // search: intitle+inauthor, then author-only fallback
    let vols = await gbSearch(`intitle:"${e.t}" inauthor:${e.tok}`);
    let best = pickEdition(e, vols);
    if (!best) {
      await sleep(DELAY_MS);
      vols = await gbSearch(`inauthor:"${e.a}"`);
      best = pickEdition(e, vols);
    }
    await sleep(DELAY_MS);

    if (!best) { misses.push(`${e.t} (${e.a}, ${e.y})`); console.log(`  ✗ MISS "${e.t}" — ${e.a}`); continue; }

    const info = best.volumeInfo;
    const gy = parseInt((info.publishedDate || "0").slice(0, 4)) || 0;
    const cover = (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "")
      .replace("&edge=curl", "").replace("zoom=1", "zoom=2").replace("http://", "https://");
    // "Literary Fiction" seeded first (prize-defined, mirrors populate-catalog's
    // genreTag pattern) — softens the GB "Fiction"-only thin-genre problem.
    const categories = [...new Set(["Literary Fiction", ...mapCategories(info.categories)])].slice(0, 4);
    const desc = cleanDescription((info.description || "").replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim(), "book");
    const vibes = deriveVibes(categories, desc);
    const fallbackVibes = vibes.length === 1 && vibes[0] === "thought-provoking";
    // catalog title collision (same normalized title, different author — display-only note)
    const titleCollision = existingBooks.some((b) => norm(b.title) === norm(e.t));

    let slug = makeSlugFromTitle(e.t);
    if (existingSlugs.has(slug)) slug = `${slug}-${e.y}`;
    let n = 2; while (existingSlugs.has(slug)) slug = `${makeSlugFromTitle(e.t)}-${e.y}-${n++}`;
    existingSlugs.add(slug);

    plan.push({
      entry: e, volumeId: best.id, gbTitle: info.title + (info.subtitle ? `: ${info.subtitle}` : ""),
      gbAuthors: info.authors || [], gbPublished: info.publishedDate || "?",
      editionDrift: gy ? gy - e.y : 0, cover, descLen: desc.length, categories,
      ratingsCount: info.ratingsCount ?? 0, averageRating: info.averageRating ?? 0,
      pageCount: info.pageCount ?? 0, vibes, fallbackVibes, titleCollision, slug,
    });
    console.log(`  ${cover ? "🖼" : "··"} "${e.t}" (${e.y}) → [${best.id}] "${info.title}" by ${(info.authors || []).join(", ")} (${info.publishedDate || "?"})${fallbackVibes ? "  ⚠thin" : ""}${e.alt && !titleMatches(e, info.title) ? "  (alt-title)" : ""}`);
  }

  // ── report ──
  const withCover = plan.filter((p) => p.cover).length;
  const withDesc = plan.filter((p) => p.descLen > 50).length;
  const withCats = plan.filter((p) => p.categories.length > 0).length;
  const thin = plan.filter((p) => p.fallbackVibes);
  const collisions = plan.filter((p) => p.titleCollision);
  const drifted = plan.filter((p) => Math.abs(p.editionDrift) > 2);

  console.log("\n=== PILOT DRY-RUN REPORT ===");
  console.log(`  attempted:        ${WINNERS.length}`);
  console.log(`  already present:  ${alreadyPresent.length}${alreadyPresent.length ? " — " + alreadyPresent.join("; ") : ""}`);
  console.log(`  matched:          ${plan.length}/${WINNERS.length - alreadyPresent.length}`);
  console.log(`  misses:           ${misses.length}${misses.length ? " — " + misses.join("; ") : ""}`);
  console.log(`  cover coverage:   ${withCover}/${plan.length}`);
  console.log(`  description:      ${withDesc}/${plan.length} (>50 chars)`);
  console.log(`  categories:       ${withCats}/${plan.length}`);
  console.log(`  dimension-thin:   ${thin.length} (fallback-only vibes)${thin.length ? " — " + thin.map((p) => p.entry.t).join("; ") : ""}`);
  console.log(`  title collisions with catalog (diff author, insert still OK): ${collisions.length}${collisions.length ? " — " + collisions.map((p) => p.entry.t).join("; ") : ""}`);
  console.log(`  edition-year drift >2y (stored year stays = award year): ${drifted.length}`);

  console.log("\n=== SPOT CHECKS (5) ===");
  for (const p of [plan[0], plan[Math.floor(plan.length * 0.25)], plan[Math.floor(plan.length * 0.5)], plan[Math.floor(plan.length * 0.75)], plan[plan.length - 1]].filter(Boolean)) {
    console.log(`  "${p.entry.t}" — ${p.entry.a} (${p.entry.y})`);
    console.log(`     GB [${p.volumeId}] "${p.gbTitle}" by ${p.gbAuthors.join(", ")}, edition ${p.gbPublished}, ${p.pageCount}p, rating ${p.averageRating || "-"} (${p.ratingsCount} votes)`);
    console.log(`     genres [${p.categories.join(", ")}], vibes [${p.vibes.join(", ")}], desc ${p.descLen} chars, cover ${p.cover ? "yes" : "NO"}, slug ${p.slug}`);
  }

  writeFileSync("scripts/booker-pilot-plan.json", JSON.stringify(plan, null, 1));
  console.log(`\nFull plan → scripts/booker-pilot-plan.json (${plan.length} editions)`);

  if (DRY) {
    console.log(`\n[DRY RUN] No writes. On live: ${plan.length} items created (year = award year, item_dimensions NULL) + ${plan.length} booker Award rows + JSON cache.`);
    console.log("  NEXT after live: npx tsx scripts/calculate-dimensions.ts");
    await prisma.$disconnect();
    return;
  }

  // ── LIVE ──
  const created: { itemId: number; awardRowId: number; volumeId: string; title: string }[] = [];
  for (const p of plan) {
    if (existingGbIds.has(p.volumeId)) { console.log(`  skip (gbId exists): ${p.entry.t}`); continue; }
    const gbAuthor = p.gbAuthors.find((a) => norm(a).includes(norm(p.entry.tok)));
    const item = await prisma.item.create({
      data: {
        title: p.entry.t, type: "book",
        genre: p.categories, vibes: p.vibes,
        year: p.entry.y, cover: p.cover,
        description: "", // set below to avoid double-cleaning drift; placeholder replaced in same tx-less flow
        people: [{ role: "Author", name: gbAuthor || p.entry.a }] as any,
        awards: ["booker"] as any, platforms: ["kindle", "library"] as any,
        ext: (p.averageRating ? { google_books: Math.min(p.averageRating * 2, 10) } : {}) as any,
        totalEp: p.pageCount, voteCount: p.ratingsCount,
        googleBooksId: p.volumeId, slug: p.slug,
        lastSyncedAt: new Date(),
      },
      select: { id: true },
    });
    // detail record is more reliable than the search payload (search reported
    // 16p for a 288p edition) — take description AND pageCount from it
    const vol = await fetch(`https://www.googleapis.com/books/v1/volumes/${p.volumeId}${GB_KEY ? `?key=${GB_KEY}` : ""}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const rawDesc = vol?.volumeInfo?.description || "";
    const detailPages = vol?.volumeInfo?.pageCount || 0;
    await prisma.item.update({
      where: { id: item.id },
      data: {
        description: cleanDescription(rawDesc.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim(), "book"),
        ...(detailPages > p.pageCount ? { totalEp: detailPages } : {}),
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
      data: { itemId: item.id, awardKey: "booker", category: "", year: p.entry.y, result: "won" },
      select: { id: true },
    });
    created.push({ itemId: item.id, awardRowId: award.id, volumeId: p.volumeId, title: p.entry.t });
    console.log(`  ✓ #${item.id} "${p.entry.t}" (${p.entry.y}) + booker row`);
    await sleep(DELAY_MS);
  }

  writeFileSync("scripts/booker-created-ids.json", JSON.stringify(created, null, 1));
  console.log(`\n✅ Created ${created.length} items + award rows (→ scripts/booker-created-ids.json).`);
  console.log("  NEXT: npx tsx scripts/calculate-dimensions.ts   (vectors the new NULL-dim items)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
