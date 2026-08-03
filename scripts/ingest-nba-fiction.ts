/**
 * ingest-nba-fiction.ts (books arc — expanded Tier-1, list 3/8)
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
 * Plan → scripts/nba-plan.json; live → scripts/nba-created-ids.json
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
const AWARD_KEY = "nba";
const CATEGORY = "Fiction";
const LEAD_GENRE = "Literary Fiction"; // per-entry override via `g`

// t=title, a=full author, tok=surname, y=Nebula year (= pub year), g=lead genre override
type Entry = { t: string; a: string; tok: string; y: number; py?: number; g?: string; alt?: string[] };
const WINNERS: Entry[] = [
  { t: "The Man with the Golden Arm", a: "Nelson Algren", tok: "algren", y: 1950, py: 1949 },
  { t: "The Collected Stories of William Faulkner", a: "William Faulkner", tok: "faulkner", y: 1951, py: 1950, alt: ["Collected Stories of William Faulkner"] },
  { t: "From Here to Eternity", a: "James Jones", tok: "jones", y: 1952, py: 1951 },
  { t: "Invisible Man", a: "Ralph Ellison", tok: "ellison", y: 1953, py: 1952 },
  { t: "The Adventures of Augie March", a: "Saul Bellow", tok: "bellow", y: 1954, py: 1953 },
  { t: "A Fable", a: "William Faulkner", tok: "faulkner", y: 1955, py: 1954 },
  { t: "Ten North Frederick", a: "John O'Hara", tok: "hara", y: 1956, py: 1955 },
  { t: "The Field of Vision", a: "Wright Morris", tok: "morris", y: 1957, py: 1956 },
  { t: "The Wapshot Chronicle", a: "John Cheever", tok: "cheever", y: 1958, py: 1957 },
  { t: "The Magic Barrel", a: "Bernard Malamud", tok: "malamud", y: 1959, py: 1958 },
  { t: "Goodbye, Columbus", a: "Philip Roth", tok: "roth", y: 1960, py: 1959 },
  { t: "The Waters of Kronos", a: "Conrad Richter", tok: "richter", y: 1961, py: 1960 },
  { t: "The Moviegoer", a: "Walker Percy", tok: "percy", y: 1962, py: 1961 },
  { t: "Morte d'Urban", a: "J. F. Powers", tok: "powers", y: 1963, py: 1962 },
  { t: "The Centaur", a: "John Updike", tok: "updike", y: 1964, py: 1963 },
  { t: "Herzog", a: "Saul Bellow", tok: "bellow", y: 1965, py: 1964 },
  { t: "The Collected Stories of Katherine Anne Porter", a: "Katherine Anne Porter", tok: "porter", y: 1966, py: 1965 },
  { t: "The Fixer", a: "Bernard Malamud", tok: "malamud", y: 1967, py: 1966 },
  { t: "The Eighth Day", a: "Thornton Wilder", tok: "wilder", y: 1968, py: 1967 },
  { t: "Steps", a: "Jerzy Kosiński", tok: "kosinski", y: 1969, py: 1968 },
  { t: "them", a: "Joyce Carol Oates", tok: "oates", y: 1970, py: 1969 },
  { t: "Mr. Sammler's Planet", a: "Saul Bellow", tok: "bellow", y: 1971, py: 1970 },
  { t: "The Complete Stories", a: "Flannery O'Connor", tok: "connor", y: 1972, py: 1971, alt: ["The Complete Stories of Flannery O'Connor"] },
  { t: "Chimera", a: "John Barth", tok: "barth", y: 1973, py: 1972 },
  { t: "Augustus", a: "John Williams", tok: "williams", y: 1973, py: 1972 },
  { t: "Gravity's Rainbow", a: "Thomas Pynchon", tok: "pynchon", y: 1974, py: 1973 },
  { t: "A Crown of Feathers", a: "Isaac Bashevis Singer", tok: "singer", y: 1974, py: 1973, alt: ["A Crown of Feathers and Other Stories"] },
  { t: "Dog Soldiers", a: "Robert Stone", tok: "stone", y: 1975, py: 1974 },
  { t: "The Hair of Harold Roux", a: "Thomas Williams", tok: "williams", y: 1975, py: 1974 },
  { t: "JR", a: "William Gaddis", tok: "gaddis", y: 1976, py: 1975, alt: ["J R"] },
  { t: "The Spectator Bird", a: "Wallace Stegner", tok: "stegner", y: 1977, py: 1976 },
  { t: "Blood Ties", a: "Mary Lee Settle", tok: "settle", y: 1978, py: 1977 },
  { t: "Going After Cacciato", a: "Tim O'Brien", tok: "brien", y: 1979, py: 1978 },
  { t: "Sophie's Choice", a: "William Styron", tok: "styron", y: 1980, py: 1979 },
  { t: "Plains Song", a: "Wright Morris", tok: "morris", y: 1981, py: 1980, alt: ["Plains Song: For Female Voices"] },
  { t: "Rabbit Is Rich", a: "John Updike", tok: "updike", y: 1982, py: 1981 },
  { t: "The Color Purple", a: "Alice Walker", tok: "walker", y: 1983, py: 1982 },
  { t: "Victory Over Japan", a: "Ellen Gilchrist", tok: "gilchrist", y: 1984, alt: ["Victory Over Japan: A Book of Stories"] },
  { t: "White Noise", a: "Don DeLillo", tok: "delillo", y: 1985 },
  { t: "World's Fair", a: "E. L. Doctorow", tok: "doctorow", y: 1986, py: 1985 },
  { t: "Paco's Story", a: "Larry Heinemann", tok: "heinemann", y: 1987, py: 1986 },
  { t: "Paris Trout", a: "Pete Dexter", tok: "dexter", y: 1988 },
  { t: "Spartina", a: "John Casey", tok: "casey", y: 1989 },
  { t: "Middle Passage", a: "Charles Johnson", tok: "johnson", y: 1990 },
  { t: "Mating", a: "Norman Rush", tok: "rush", y: 1991 },
  { t: "All the Pretty Horses", a: "Cormac McCarthy", tok: "mccarthy", y: 1992 },
  { t: "The Shipping News", a: "Annie Proulx", tok: "proulx", y: 1993 },
  { t: "A Frolic of His Own", a: "William Gaddis", tok: "gaddis", y: 1994 },
  { t: "Sabbath's Theater", a: "Philip Roth", tok: "roth", y: 1995 },
  { t: "Ship Fever", a: "Andrea Barrett", tok: "barrett", y: 1996, alt: ["Ship Fever and Other Stories"] },
  { t: "Cold Mountain", a: "Charles Frazier", tok: "frazier", y: 1997 },
  { t: "Charming Billy", a: "Alice McDermott", tok: "mcdermott", y: 1998 },
  { t: "Waiting", a: "Ha Jin", tok: "jin", y: 1999 },
  { t: "In America", a: "Susan Sontag", tok: "sontag", y: 2000 },
  { t: "The Corrections", a: "Jonathan Franzen", tok: "franzen", y: 2001 },
  { t: "Three Junes", a: "Julia Glass", tok: "glass", y: 2002 },
  { t: "The Great Fire", a: "Shirley Hazzard", tok: "hazzard", y: 2003 },
  { t: "The News from Paraguay", a: "Lily Tuck", tok: "tuck", y: 2004 },
  { t: "Europe Central", a: "William T. Vollmann", tok: "vollmann", y: 2005 },
  { t: "The Echo Maker", a: "Richard Powers", tok: "powers", y: 2006 },
  { t: "Tree of Smoke", a: "Denis Johnson", tok: "johnson", y: 2007 },
  { t: "Shadow Country", a: "Peter Matthiessen", tok: "matthiessen", y: 2008 },
  { t: "Let the Great World Spin", a: "Colum McCann", tok: "mccann", y: 2009 },
  { t: "Lord of Misrule", a: "Jaimy Gordon", tok: "gordon", y: 2010 },
  { t: "Salvage the Bones", a: "Jesmyn Ward", tok: "ward", y: 2011 },
  { t: "The Round House", a: "Louise Erdrich", tok: "erdrich", y: 2012 },
  { t: "The Good Lord Bird", a: "James McBride", tok: "mcbride", y: 2013 },
  { t: "Redeployment", a: "Phil Klay", tok: "klay", y: 2014 },
  { t: "Fortune Smiles", a: "Adam Johnson", tok: "johnson", y: 2015, alt: ["Fortune Smiles: Stories"] },
  { t: "The Underground Railroad", a: "Colson Whitehead", tok: "whitehead", y: 2016 },
  { t: "Sing, Unburied, Sing", a: "Jesmyn Ward", tok: "ward", y: 2017 },
  { t: "The Friend", a: "Sigrid Nunez", tok: "nunez", y: 2018 },
  { t: "Trust Exercise", a: "Susan Choi", tok: "choi", y: 2019 },
  { t: "Interior Chinatown", a: "Charles Yu", tok: "yu", y: 2020 },
  { t: "Hell of a Book", a: "Jason Mott", tok: "mott", y: 2021 },
  { t: "The Rabbit Hutch", a: "Tess Gunty", tok: "gunty", y: 2022 },
  { t: "Blackouts", a: "Justin Torres", tok: "torres", y: 2023 },
  { t: "James", a: "Percival Everett", tok: "everett", y: 2024 },
  { t: "The True True Story of Raja the Gullible", a: "Rabih Alameddine", tok: "alameddine", y: 2025, alt: ["The True True Story of Raja the Gullible (and His Mother)"] },
];
const pyOf = (e: Entry) => e.py ?? e.y;

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
  console.log(`NBA Fiction mark+ingest — ${DRY ? "DRY RUN (no writes)" : "LIVE"}\n`);
  console.log(`winners embedded: ${WINNERS.length} (1950–2025, incl. split years; ABA era = hardcover line)\n`);

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
  console.log("\n=== NBA DRY-RUN REPORT ===");
  console.log(`  winners:         ${WINNERS.length}`);
  console.log(`  mark existing:   ${toMark.length}`);
  console.log(`  ingest planned:  ${plan.length}`);
  console.log(`  misses:          ${misses.length}${misses.length ? " — " + misses.join("; ") : ""}`);
  console.log(`  ingest covers:   ${withCover}/${plan.length}`);
  console.log(`  dimension-thin:  ${thin.length}${thin.length ? " — " + thin.map((p) => p.entry.t).join("; ") : ""}`);

  writeFileSync("scripts/nba-plan.json", JSON.stringify({ mark: toMark.map((m) => ({ y: m.e.y, t: m.e.t, itemId: m.itemId })), ingest: plan }, null, 1));
  console.log(`\nPlan → scripts/nba-plan.json`);

  if (DRY) {
    console.log(`\n[DRY RUN] No writes. Live: ${toMark.length} marks + ${plan.length} ingests + ${toMark.length + plan.length} nba Award rows.`);
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
    console.log(`  ✓ #${item.id} "${p.entry.t}" (pub ${pyOf(p.entry)}, NBA ${p.entry.y})`);
    await sleep(DELAY_MS);
  }

  writeFileSync("scripts/nba-created-ids.json", JSON.stringify({ marked: toMark.map((m) => m.itemId), created }, null, 1));
  console.log(`\n✅ ${mr.count} marked + ${created.length} created (→ scripts/nba-created-ids.json).`);
  console.log("  NEXT: npx tsx scripts/calculate-dimensions.ts");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
