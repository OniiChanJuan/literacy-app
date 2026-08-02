/**
 * ingest-hugo-winners.ts (awards workstream step 3 — Hugo batch)
 *
 * Ingests the ~59 Hugo Best Novel winners missing from the catalog
 * (the `hugo` entries of scripts/awards-pending-review.json) via the
 * Google Books pipeline proven by the Booker pilot, then (live mode)
 * marks them with `hugo` Award rows + the awards JSON display cache.
 *
 * Inherits every Booker-pilot guard (author = first-initial+surname,
 * omnibus rejection, non-English-edition guard, exact-title-first,
 * detail-fetch metadata, title+AUTHOR dedup, suffixed slugs) plus
 * Hugo/SF-specific hardening:
 *  - `py` (publication year) is SEPARATE from `y` (Hugo award year):
 *    item.year = py, Award row year = y — Hugo honors the prior year's
 *    book, unlike the Booker where they coincide
 *  - author guard strips Jr/Sr suffixes ("Walter M. Miller Jr.")
 *  - BAD_EDITION extended with omnibus/trilogy/boxed-set markers (SF
 *    loves omnibus editions); same-title-different-book risk (Spin,
 *    Gateway, Hyperion, Blackout) is covered by the author guard
 *  - lead genre seed = "Science Fiction" (prize-defined)
 *
 * Run: npx tsx scripts/ingest-hugo-winners.ts --dry-run   # report only
 *      npx tsx scripts/ingest-hugo-winners.ts             # write
 * Dry-run also writes scripts/hugo-batch-plan.json (chosen editions)
 * for review. Live mode writes scripts/hugo-created-ids.json and
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

// ── the 59 missing winners ──
// t=title, a=full author, tok=surname, y=HUGO award year, py=publication year
type Entry = { t: string; a: string; tok: string; y: number; py: number; alt?: string[] };
const WINNERS: Entry[] = [
  { t: "The Demolished Man", a: "Alfred Bester", tok: "bester", y: 1953, py: 1953 },
  { t: "They'd Rather Be Right", a: "Mark Clifton", tok: "clifton", y: 1955, py: 1954, alt: ["The Forever Machine"] },
  { t: "Double Star", a: "Robert A. Heinlein", tok: "heinlein", y: 1956, py: 1956 },
  { t: "The Big Time", a: "Fritz Leiber", tok: "leiber", y: 1958, py: 1958 },
  { t: "A Case of Conscience", a: "James Blish", tok: "blish", y: 1959, py: 1958 },
  { t: "Starship Troopers", a: "Robert A. Heinlein", tok: "heinlein", y: 1960, py: 1959 },
  { t: "A Canticle for Leibowitz", a: "Walter M. Miller Jr.", tok: "miller", y: 1961, py: 1960 },
  { t: "Stranger in a Strange Land", a: "Robert A. Heinlein", tok: "heinlein", y: 1962, py: 1961 },
  { t: "Way Station", a: "Clifford D. Simak", tok: "simak", y: 1964, py: 1963 },
  { t: "The Wanderer", a: "Fritz Leiber", tok: "leiber", y: 1965, py: 1964 },
  { t: "This Immortal", a: "Roger Zelazny", tok: "zelazny", y: 1966, py: 1966, alt: ["...And Call Me Conrad"] },
  { t: "The Moon Is a Harsh Mistress", a: "Robert A. Heinlein", tok: "heinlein", y: 1967, py: 1966 },
  { t: "Lord of Light", a: "Roger Zelazny", tok: "zelazny", y: 1968, py: 1967 },
  { t: "Stand on Zanzibar", a: "John Brunner", tok: "brunner", y: 1969, py: 1968 },
  { t: "Ringworld", a: "Larry Niven", tok: "niven", y: 1971, py: 1970 },
  { t: "To Your Scattered Bodies Go", a: "Philip José Farmer", tok: "farmer", y: 1972, py: 1971 },
  { t: "Rendezvous with Rama", a: "Arthur C. Clarke", tok: "clarke", y: 1974, py: 1973 },
  { t: "The Forever War", a: "Joe Haldeman", tok: "haldeman", y: 1976, py: 1974 },
  { t: "Where Late the Sweet Birds Sang", a: "Kate Wilhelm", tok: "wilhelm", y: 1977, py: 1976 },
  { t: "Gateway", a: "Frederik Pohl", tok: "pohl", y: 1978, py: 1977 },
  { t: "Dreamsnake", a: "Vonda N. McIntyre", tok: "mcintyre", y: 1979, py: 1978 },
  { t: "The Fountains of Paradise", a: "Arthur C. Clarke", tok: "clarke", y: 1980, py: 1979 },
  { t: "The Snow Queen", a: "Joan D. Vinge", tok: "vinge", y: 1981, py: 1980 },
  { t: "Downbelow Station", a: "C. J. Cherryh", tok: "cherryh", y: 1982, py: 1981 },
  { t: "Startide Rising", a: "David Brin", tok: "brin", y: 1984, py: 1983 },
  { t: "Speaker for the Dead", a: "Orson Scott Card", tok: "card", y: 1987, py: 1986 },
  { t: "The Uplift War", a: "David Brin", tok: "brin", y: 1988, py: 1987 },
  { t: "Cyteen", a: "C. J. Cherryh", tok: "cherryh", y: 1989, py: 1988 },
  { t: "Hyperion", a: "Dan Simmons", tok: "simmons", y: 1990, py: 1989 },
  { t: "The Vor Game", a: "Lois McMaster Bujold", tok: "bujold", y: 1991, py: 1990 },
  { t: "Barrayar", a: "Lois McMaster Bujold", tok: "bujold", y: 1992, py: 1991 },
  { t: "A Fire Upon the Deep", a: "Vernor Vinge", tok: "vinge", y: 1993, py: 1992 },
  { t: "Doomsday Book", a: "Connie Willis", tok: "willis", y: 1993, py: 1992 },
  { t: "Green Mars", a: "Kim Stanley Robinson", tok: "robinson", y: 1994, py: 1993 },
  { t: "Mirror Dance", a: "Lois McMaster Bujold", tok: "bujold", y: 1995, py: 1994 },
  { t: "The Diamond Age", a: "Neal Stephenson", tok: "stephenson", y: 1996, py: 1995 },
  { t: "Blue Mars", a: "Kim Stanley Robinson", tok: "robinson", y: 1997, py: 1996 },
  { t: "Forever Peace", a: "Joe Haldeman", tok: "haldeman", y: 1998, py: 1997 },
  { t: "To Say Nothing of the Dog", a: "Connie Willis", tok: "willis", y: 1999, py: 1998 },
  { t: "A Deepness in the Sky", a: "Vernor Vinge", tok: "vinge", y: 2000, py: 1999 },
  { t: "Hominids", a: "Robert J. Sawyer", tok: "sawyer", y: 2003, py: 2002 },
  { t: "Paladin of Souls", a: "Lois McMaster Bujold", tok: "bujold", y: 2004, py: 2003 },
  { t: "Jonathan Strange & Mr Norrell", a: "Susanna Clarke", tok: "clarke", y: 2005, py: 2004 },
  { t: "Spin", a: "Robert Charles Wilson", tok: "wilson", y: 2006, py: 2005 },
  { t: "Rainbows End", a: "Vernor Vinge", tok: "vinge", y: 2007, py: 2006 },
  { t: "The Yiddish Policemen's Union", a: "Michael Chabon", tok: "chabon", y: 2008, py: 2007 },
  { t: "The City & The City", a: "China Miéville", tok: "mieville", y: 2010, py: 2009 },
  { t: "Blackout", a: "Connie Willis", tok: "willis", y: 2011, py: 2010 },
  { t: "All Clear", a: "Connie Willis", tok: "willis", y: 2011, py: 2010 },
  { t: "Among Others", a: "Jo Walton", tok: "walton", y: 2012, py: 2011 },
  { t: "Redshirts", a: "John Scalzi", tok: "scalzi", y: 2013, py: 2012 },
  { t: "Ancillary Justice", a: "Ann Leckie", tok: "leckie", y: 2014, py: 2013 },
  { t: "The Obelisk Gate", a: "N. K. Jemisin", tok: "jemisin", y: 2017, py: 2016 },
  { t: "The Calculating Stars", a: "Mary Robinette Kowal", tok: "kowal", y: 2019, py: 2018 },
  { t: "A Memory Called Empire", a: "Arkady Martine", tok: "martine", y: 2020, py: 2019 },
  { t: "A Desolation Called Peace", a: "Arkady Martine", tok: "martine", y: 2022, py: 2021 },
  { t: "Nettle & Bone", a: "T. Kingfisher", tok: "kingfisher", y: 2023, py: 2022 },
  { t: "Some Desperate Glory", a: "Emily Tesh", tok: "tesh", y: 2024, py: 2023 },
  { t: "The Tainted Cup", a: "Robert Jackson Bennett", tok: "bennett", y: 2025, py: 2024 },
];

// ── matching helpers (step-1 normalization) ──
function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
// + omnibus/box-set markers — SF publishing loves multi-novel volumes
const BAD_EDITION = /movie tie-in|study guide|sparknotes|spark notes|summary of|analysis of|conversation starters|by the book club|workbook|teacher|omnibus|trilogy|boxed set|box set|2-in-1|complete series|collection/i;

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
 *  (Token containment let "K. W. Middleton" pass for Stanley Middleton.)
 *  Generational suffixes are stripped so "Walter M. Miller Jr." surname-
 *  matches "miller", not "jr". */
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
    if (gy && gy < e.py - 1) return false;
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
  console.log(`Hugo Best Novel winners ingestion — ${DRY ? "DRY RUN (no writes)" : "LIVE"}\n`);

  // provenance cross-check against step 1's pending delta
  const pending = JSON.parse(readFileSync("scripts/awards-pending-review.json", "utf8"))
    .filter((p: any) => p.awardKey === "hugo");
  const pendingKeys = new Set(pending.map((p: any) => norm(p.title)));
  const listKeys = new Set(WINNERS.map((w) => norm(w.t)));
  const notInPending = WINNERS.filter((w) => !pendingKeys.has(norm(w.t)));
  const notInList = pending.filter((p: any) => !listKeys.has(norm(p.title)));
  console.log(`pending-file hugo entries: ${pending.length}; embedded list: ${WINNERS.length}`);
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
    // "Science Fiction" seeded first (prize-defined, mirrors populate-catalog's
    // genreTag pattern) — also feeds deriveVibes (mind-bending) + the
    // fantastical/world-building fingerprint axes.
    const categories = [...new Set(["Science Fiction", ...mapCategories(info.categories)])].slice(0, 4);
    const desc = cleanDescription((info.description || "").replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim(), "book");
    const vibes = deriveVibes(categories, desc);
    const fallbackVibes = vibes.length === 1 && vibes[0] === "thought-provoking";
    // catalog title collision (same normalized title, different author — display-only note)
    const titleCollision = existingBooks.some((b) => norm(b.title) === norm(e.t));

    let slug = makeSlugFromTitle(e.t);
    if (existingSlugs.has(slug)) slug = `${slug}-${e.py}`;
    let n = 2; while (existingSlugs.has(slug)) slug = `${makeSlugFromTitle(e.t)}-${e.py}-${n++}`;
    existingSlugs.add(slug);

    plan.push({
      entry: e, volumeId: best.id, gbTitle: info.title + (info.subtitle ? `: ${info.subtitle}` : ""),
      gbAuthors: info.authors || [], gbPublished: info.publishedDate || "?",
      editionDrift: gy ? gy - e.py : 0, cover, descLen: desc.length, categories,
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
  console.log(`  edition-year drift >2y (stored year stays = publication year): ${drifted.length}`);

  console.log("\n=== SPOT CHECKS (5) ===");
  for (const p of [plan[0], plan[Math.floor(plan.length * 0.25)], plan[Math.floor(plan.length * 0.5)], plan[Math.floor(plan.length * 0.75)], plan[plan.length - 1]].filter(Boolean)) {
    console.log(`  "${p.entry.t}" — ${p.entry.a} (pub ${p.entry.py}, Hugo ${p.entry.y})`);
    console.log(`     GB [${p.volumeId}] "${p.gbTitle}" by ${p.gbAuthors.join(", ")}, edition ${p.gbPublished}, ${p.pageCount}p, rating ${p.averageRating || "-"} (${p.ratingsCount} votes)`);
    console.log(`     genres [${p.categories.join(", ")}], vibes [${p.vibes.join(", ")}], desc ${p.descLen} chars, cover ${p.cover ? "yes" : "NO"}, slug ${p.slug}`);
  }

  writeFileSync("scripts/hugo-batch-plan.json", JSON.stringify(plan, null, 1));
  console.log(`\nFull plan → scripts/hugo-batch-plan.json (${plan.length} editions)`);

  if (DRY) {
    console.log(`\n[DRY RUN] No writes. On live: ${plan.length} items created (year = publication year, item_dimensions NULL) + ${plan.length} hugo Award rows (year = Hugo year) + JSON cache.`);
    console.log("  NEXT after live: npx tsx scripts/calculate-dimensions.ts");
    await prisma.$disconnect();
    return;
  }

  // ── LIVE ──
  const created: { itemId: number; awardRowId: number; volumeId: string; title: string }[] = [];
  for (const p of plan) {
    if (existingGbIds.has(p.volumeId)) { console.log(`  skip (gbId exists): ${p.entry.t}`); continue; }
    // prefer the edition-credited author form unless it's shouting (LORD OF
    // LIGHT edition credits "ROGER ZELAZNY") — then fall back to the curated name
    const gbAuthorRaw = p.gbAuthors.find((a) => norm(a).includes(norm(p.entry.tok)));
    const gbAuthor = gbAuthorRaw && gbAuthorRaw !== gbAuthorRaw.toUpperCase() ? gbAuthorRaw : p.entry.a;
    const item = await prisma.item.create({
      data: {
        title: p.entry.t, type: "book",
        genre: p.categories, vibes: p.vibes,
        year: p.entry.py, cover: p.cover,
        description: "", // set below to avoid double-cleaning drift; placeholder replaced in same tx-less flow
        people: [{ role: "Author", name: gbAuthor || p.entry.a }] as any,
        awards: ["hugo"] as any, platforms: ["kindle", "library"] as any,
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
    // detail record can carry a cover the search payload lacked (Vor Game case)
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
      data: { itemId: item.id, awardKey: "hugo", category: "Best Novel", year: p.entry.y, result: "won" },
      select: { id: true },
    });
    created.push({ itemId: item.id, awardRowId: award.id, volumeId: p.volumeId, title: p.entry.t });
    console.log(`  ✓ #${item.id} "${p.entry.t}" (pub ${p.entry.py}, Hugo ${p.entry.y}) + hugo row`);
    await sleep(DELAY_MS);
  }

  writeFileSync("scripts/hugo-created-ids.json", JSON.stringify(created, null, 1));
  console.log(`\n✅ Created ${created.length} items + award rows (→ scripts/hugo-created-ids.json).`);
  console.log("  NEXT: npx tsx scripts/calculate-dimensions.ts   (vectors the new NULL-dim items)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
