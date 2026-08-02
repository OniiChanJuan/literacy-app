/**
 * ingest-pulitzer-fiction.ts (books arc — expanded Tier-1, list 1/8)
 *
 * Pulitzer Prize for Fiction (1948–2026) + its predecessor the Pulitzer
 * Prize for the Novel (1918–1947), winners only. FIRST list to use the
 * generalized MARK + INGEST dual path:
 *   - already in catalog (title+author verified) → Award row + JSON key only
 *   - absent → Google Books ingest (all Booker/Hugo guards) → Award row
 * No pending-file anchor exists for Pulitzer (not part of the step-1 seed),
 * so the embedded list is the source of truth. 2026 winner (Angel Down,
 * Daniel Kraus) web-verified 2026-08-02.
 *
 * Year semantics: award row year = Pulitzer year (y); item year = original
 * publication year (py, typically y−1). No-award years (1920, 1941, 1946,
 * 1954, 1957, 1964, 1971, 1974, 1977, 2012) simply have no entry.
 * awardKey 'pulitzer', category 'Fiction' (registry key exists).
 *
 * Run: npx tsx scripts/ingest-pulitzer-fiction.ts --dry-run   # report only
 *      npx tsx scripts/ingest-pulitzer-fiction.ts             # write
 * Plan → scripts/pulitzer-plan.json; live → scripts/pulitzer-created-ids.json
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
const AWARD_KEY = "pulitzer";
const CATEGORY = "Fiction";
const LEAD_GENRE = "Literary Fiction";

// t=title, a=full author, tok=surname, y=Pulitzer year, py=pub year (default y-1)
type Entry = { t: string; a: string; tok: string; y: number; py?: number; alt?: string[] };
const WINNERS: Entry[] = [
  { t: "His Family", a: "Ernest Poole", tok: "poole", y: 1918 },
  { t: "The Magnificent Ambersons", a: "Booth Tarkington", tok: "tarkington", y: 1919 },
  { t: "The Age of Innocence", a: "Edith Wharton", tok: "wharton", y: 1921 },
  { t: "Alice Adams", a: "Booth Tarkington", tok: "tarkington", y: 1922 },
  { t: "One of Ours", a: "Willa Cather", tok: "cather", y: 1923 },
  { t: "The Able McLaughlins", a: "Margaret Wilson", tok: "wilson", y: 1924 },
  { t: "So Big", a: "Edna Ferber", tok: "ferber", y: 1925 },
  { t: "Arrowsmith", a: "Sinclair Lewis", tok: "lewis", y: 1926 },
  { t: "Early Autumn", a: "Louis Bromfield", tok: "bromfield", y: 1927 },
  { t: "The Bridge of San Luis Rey", a: "Thornton Wilder", tok: "wilder", y: 1928 },
  { t: "Scarlet Sister Mary", a: "Julia Peterkin", tok: "peterkin", y: 1929 },
  { t: "Laughing Boy", a: "Oliver La Farge", tok: "farge", y: 1930 },
  { t: "Years of Grace", a: "Margaret Ayer Barnes", tok: "barnes", y: 1931 },
  { t: "The Good Earth", a: "Pearl S. Buck", tok: "buck", y: 1932 },
  { t: "The Store", a: "T. S. Stribling", tok: "stribling", y: 1933 },
  { t: "Lamb in His Bosom", a: "Caroline Miller", tok: "miller", y: 1934 },
  { t: "Now in November", a: "Josephine Winslow Johnson", tok: "johnson", y: 1935 },
  { t: "Honey in the Horn", a: "Harold L. Davis", tok: "davis", y: 1936 },
  { t: "Gone with the Wind", a: "Margaret Mitchell", tok: "mitchell", y: 1937 },
  { t: "The Late George Apley", a: "John P. Marquand", tok: "marquand", y: 1938 },
  { t: "The Yearling", a: "Marjorie Kinnan Rawlings", tok: "rawlings", y: 1939 },
  { t: "The Grapes of Wrath", a: "John Steinbeck", tok: "steinbeck", y: 1940 },
  { t: "In This Our Life", a: "Ellen Glasgow", tok: "glasgow", y: 1942 },
  { t: "Dragon's Teeth", a: "Upton Sinclair", tok: "sinclair", y: 1943 },
  { t: "Journey in the Dark", a: "Martin Flavin", tok: "flavin", y: 1944 },
  { t: "A Bell for Adano", a: "John Hersey", tok: "hersey", y: 1945 },
  { t: "All the King's Men", a: "Robert Penn Warren", tok: "warren", y: 1947 },
  { t: "Tales of the South Pacific", a: "James A. Michener", tok: "michener", y: 1948 },
  { t: "Guard of Honor", a: "James Gould Cozzens", tok: "cozzens", y: 1949 },
  { t: "The Way West", a: "A. B. Guthrie Jr.", tok: "guthrie", y: 1950 },
  { t: "The Town", a: "Conrad Richter", tok: "richter", y: 1951 },
  { t: "The Caine Mutiny", a: "Herman Wouk", tok: "wouk", y: 1952 },
  { t: "The Old Man and the Sea", a: "Ernest Hemingway", tok: "hemingway", y: 1953, py: 1952 },
  { t: "A Fable", a: "William Faulkner", tok: "faulkner", y: 1955 },
  { t: "Andersonville", a: "MacKinlay Kantor", tok: "kantor", y: 1956 },
  { t: "A Death in the Family", a: "James Agee", tok: "agee", y: 1958 },
  { t: "The Travels of Jaimie McPheeters", a: "Robert Lewis Taylor", tok: "taylor", y: 1959 },
  { t: "Advise and Consent", a: "Allen Drury", tok: "drury", y: 1960 },
  { t: "To Kill a Mockingbird", a: "Harper Lee", tok: "lee", y: 1961, py: 1960 },
  { t: "The Edge of Sadness", a: "Edwin O'Connor", tok: "connor", y: 1962 },
  { t: "The Reivers", a: "William Faulkner", tok: "faulkner", y: 1963 },
  { t: "The Keepers of the House", a: "Shirley Ann Grau", tok: "grau", y: 1965 },
  { t: "The Collected Stories of Katherine Anne Porter", a: "Katherine Anne Porter", tok: "porter", y: 1966 },
  { t: "The Fixer", a: "Bernard Malamud", tok: "malamud", y: 1967 },
  { t: "The Confessions of Nat Turner", a: "William Styron", tok: "styron", y: 1968 },
  { t: "House Made of Dawn", a: "N. Scott Momaday", tok: "momaday", y: 1969 },
  { t: "Collected Stories", a: "Jean Stafford", tok: "stafford", y: 1970, alt: ["The Collected Stories of Jean Stafford"] },
  { t: "Angle of Repose", a: "Wallace Stegner", tok: "stegner", y: 1972 },
  { t: "The Optimist's Daughter", a: "Eudora Welty", tok: "welty", y: 1973 },
  { t: "The Killer Angels", a: "Michael Shaara", tok: "shaara", y: 1975 },
  { t: "Humboldt's Gift", a: "Saul Bellow", tok: "bellow", y: 1976 },
  { t: "Elbow Room", a: "James Alan McPherson", tok: "mcpherson", y: 1978 },
  { t: "The Stories of John Cheever", a: "John Cheever", tok: "cheever", y: 1979 },
  { t: "The Executioner's Song", a: "Norman Mailer", tok: "mailer", y: 1980 },
  { t: "A Confederacy of Dunces", a: "John Kennedy Toole", tok: "toole", y: 1981, py: 1980 },
  { t: "Rabbit Is Rich", a: "John Updike", tok: "updike", y: 1982 },
  { t: "The Color Purple", a: "Alice Walker", tok: "walker", y: 1983 },
  { t: "Ironweed", a: "William Kennedy", tok: "kennedy", y: 1984 },
  { t: "Foreign Affairs", a: "Alison Lurie", tok: "lurie", y: 1985 },
  { t: "Lonesome Dove", a: "Larry McMurtry", tok: "mcmurtry", y: 1986, py: 1985 },
  { t: "A Summons to Memphis", a: "Peter Taylor", tok: "taylor", y: 1987 },
  { t: "Beloved", a: "Toni Morrison", tok: "morrison", y: 1988, py: 1987 },
  { t: "Breathing Lessons", a: "Anne Tyler", tok: "tyler", y: 1989 },
  { t: "The Mambo Kings Play Songs of Love", a: "Oscar Hijuelos", tok: "hijuelos", y: 1990 },
  { t: "Rabbit at Rest", a: "John Updike", tok: "updike", y: 1991 },
  { t: "A Thousand Acres", a: "Jane Smiley", tok: "smiley", y: 1992 },
  { t: "A Good Scent from a Strange Mountain", a: "Robert Olen Butler", tok: "butler", y: 1993 },
  { t: "The Shipping News", a: "Annie Proulx", tok: "proulx", y: 1994, py: 1993 },
  { t: "The Stone Diaries", a: "Carol Shields", tok: "shields", y: 1995, py: 1993 },
  { t: "Independence Day", a: "Richard Ford", tok: "ford", y: 1996 },
  { t: "Martin Dressler: The Tale of an American Dreamer", a: "Steven Millhauser", tok: "millhauser", y: 1997, alt: ["Martin Dressler"] },
  { t: "American Pastoral", a: "Philip Roth", tok: "roth", y: 1998, py: 1997 },
  { t: "The Hours", a: "Michael Cunningham", tok: "cunningham", y: 1999, py: 1998 },
  { t: "Interpreter of Maladies", a: "Jhumpa Lahiri", tok: "lahiri", y: 2000, py: 1999 },
  { t: "The Amazing Adventures of Kavalier & Clay", a: "Michael Chabon", tok: "chabon", y: 2001, py: 2000 },
  { t: "Empire Falls", a: "Richard Russo", tok: "russo", y: 2002, py: 2001 },
  { t: "Middlesex", a: "Jeffrey Eugenides", tok: "eugenides", y: 2003, py: 2002 },
  { t: "The Known World", a: "Edward P. Jones", tok: "jones", y: 2004, py: 2003 },
  { t: "Gilead", a: "Marilynne Robinson", tok: "robinson", y: 2005, py: 2004 },
  { t: "March", a: "Geraldine Brooks", tok: "brooks", y: 2006, py: 2005 },
  { t: "The Road", a: "Cormac McCarthy", tok: "mccarthy", y: 2007, py: 2006 },
  { t: "The Brief Wondrous Life of Oscar Wao", a: "Junot Díaz", tok: "diaz", y: 2008, py: 2007 },
  { t: "Olive Kitteridge", a: "Elizabeth Strout", tok: "strout", y: 2009, py: 2008 },
  { t: "Tinkers", a: "Paul Harding", tok: "harding", y: 2010, py: 2009 },
  { t: "A Visit from the Goon Squad", a: "Jennifer Egan", tok: "egan", y: 2011, py: 2010 },
  { t: "The Orphan Master's Son", a: "Adam Johnson", tok: "johnson", y: 2013, py: 2012 },
  { t: "The Goldfinch", a: "Donna Tartt", tok: "tartt", y: 2014, py: 2013 },
  { t: "All the Light We Cannot See", a: "Anthony Doerr", tok: "doerr", y: 2015, py: 2014 },
  { t: "The Sympathizer", a: "Viet Thanh Nguyen", tok: "nguyen", y: 2016, py: 2015 },
  { t: "The Underground Railroad", a: "Colson Whitehead", tok: "whitehead", y: 2017, py: 2016 },
  { t: "Less", a: "Andrew Sean Greer", tok: "greer", y: 2018, py: 2017 },
  { t: "The Overstory", a: "Richard Powers", tok: "powers", y: 2019, py: 2018 },
  { t: "The Nickel Boys", a: "Colson Whitehead", tok: "whitehead", y: 2020, py: 2019 },
  { t: "The Night Watchman", a: "Louise Erdrich", tok: "erdrich", y: 2021, py: 2020 },
  { t: "The Netanyahus", a: "Joshua Cohen", tok: "cohen", y: 2022, py: 2021 },
  { t: "Demon Copperhead", a: "Barbara Kingsolver", tok: "kingsolver", y: 2023, py: 2022 },
  { t: "Trust", a: "Hernan Diaz", tok: "diaz", y: 2023, py: 2022 },
  { t: "Night Watch", a: "Jayne Anne Phillips", tok: "phillips", y: 2024, py: 2023 },
  { t: "James", a: "Percival Everett", tok: "everett", y: 2025, py: 2024 },
  { t: "Angel Down", a: "Daniel Kraus", tok: "kraus", y: 2026, py: 2025 },
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
  console.log(`Pulitzer Fiction mark+ingest — ${DRY ? "DRY RUN (no writes)" : "LIVE"}\n`);
  console.log(`winners embedded: ${WINNERS.length} (1918–2026, no-award years absent)\n`);

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
    const categories = [...new Set([LEAD_GENRE, ...mapCategories(info.categories)])].slice(0, 4);
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
  console.log("\n=== PULITZER DRY-RUN REPORT ===");
  console.log(`  winners:         ${WINNERS.length}`);
  console.log(`  mark existing:   ${toMark.length}`);
  console.log(`  ingest planned:  ${plan.length}`);
  console.log(`  misses:          ${misses.length}${misses.length ? " — " + misses.join("; ") : ""}`);
  console.log(`  ingest covers:   ${withCover}/${plan.length}`);
  console.log(`  dimension-thin:  ${thin.length}${thin.length ? " — " + thin.map((p) => p.entry.t).join("; ") : ""}`);

  writeFileSync("scripts/pulitzer-plan.json", JSON.stringify({ mark: toMark.map((m) => ({ y: m.e.y, t: m.e.t, itemId: m.itemId })), ingest: plan }, null, 1));
  console.log(`\nPlan → scripts/pulitzer-plan.json`);

  if (DRY) {
    console.log(`\n[DRY RUN] No writes. Live: ${toMark.length} marks + ${plan.length} ingests + ${toMark.length + plan.length} pulitzer Award rows.`);
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
    console.log(`  ✓ #${item.id} "${p.entry.t}" (pub ${pyOf(p.entry)}, Pulitzer ${p.entry.y})`);
    await sleep(DELAY_MS);
  }

  writeFileSync("scripts/pulitzer-created-ids.json", JSON.stringify({ marked: toMark.map((m) => m.itemId), created }, null, 1));
  console.log(`\n✅ ${mr.count} marked + ${created.length} created (→ scripts/pulitzer-created-ids.json).`);
  console.log("  NEXT: npx tsx scripts/calculate-dimensions.ts");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
