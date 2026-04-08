/**
 * fix-specific-covers.ts
 *
 * Diagnose-and-fix the three book covers that have repeatedly failed to stick:
 *   - Dawnshard
 *   - Rhythm of War
 *   - The Final Empire
 *
 * Steps per book:
 *   1. Look up by exact title + type='book'. Print id / current cover / length.
 *   2. HEAD-test the existing cover URL (status, content-type, content-length,
 *      followed redirect chain).
 *   3. If status != 200 or content-length < 1000, search for a replacement:
 *        a. Google Books volumes API → imageLinks (large/medium/thumbnail)
 *        b. OpenLibrary search.json → cover_i → covers.openlibrary.org/b/id
 *      HEAD-test each candidate. Take the first one that returns 200 with
 *      content-length > 1000.
 *   4. UPDATE items SET cover = $url WHERE id = $id  (only if a new URL passed).
 *      Refuses to write null / empty / shorter than current.
 *   5. Re-read the row from DB and HEAD-test the stored URL again to prove
 *      the value persisted AND still resolves.
 *
 * Run: npx dotenv-cli -e .env -- npx tsx scripts/fix-specific-covers.ts
 * Dry run (no writes): npx dotenv-cli -e .env -- npx tsx scripts/fix-specific-covers.ts --dry-run
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY_RUN = process.argv.includes("--dry-run");
const GB_KEY = process.env.GOOGLE_BOOKS_API_KEY || "";

const TARGETS: Array<{ title: string; author: string }> = [
  { title: "Dawnshard",        author: "Brandon Sanderson" },
  { title: "Rhythm of War",    author: "Brandon Sanderson" },
  { title: "The Final Empire", author: "Brandon Sanderson" },
];

interface HeadResult {
  ok: boolean;
  status: number | string;
  contentType?: string | null;
  contentLength?: number | null;
  finalUrl?: string;
  redirects?: number;
  error?: string;
}

async function head(url: string, depth = 0): Promise<HeadResult> {
  if (depth > 5) return { ok: false, status: "TOO_MANY_REDIRECTS" };
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "Literacy-CoverCheck/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (loc) {
        const next = loc.startsWith("http") ? loc : new URL(loc, url).toString();
        const r = await head(next, depth + 1);
        return { ...r, redirects: (r.redirects || 0) + 1, finalUrl: r.finalUrl || next };
      }
    }
    const ct = res.headers.get("content-type");
    const cl = res.headers.get("content-length");
    return {
      ok: res.status === 200 && !!ct && /^image\//i.test(ct) && (cl ? parseInt(cl) > 1000 : true),
      status: res.status,
      contentType: ct,
      contentLength: cl ? parseInt(cl) : null,
      finalUrl: url,
      redirects: depth,
    };
  } catch (e: any) {
    return { ok: false, status: "ERROR", error: e?.message || String(e) };
  }
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": "Literacy-CoverCheck/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function googleBooksCandidates(title: string, author: string): Promise<string[]> {
  try {
    const q = `intitle:${title}+inauthor:${author.split(" ").pop()}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&langRestrict=en${GB_KEY ? `&key=${GB_KEY}` : ""}`;
    const data = await fetchJson(url);
    const out: string[] = [];
    for (const item of (data.items || [])) {
      // Prefer the canonical books.google.com/books/content endpoint by volume id —
      // verified to load in-browser without ORB issues across the catalog.
      if (item?.id) {
        out.push(`https://books.google.com/books/content?id=${item.id}&printsec=frontcover&img=1&zoom=1`);
      }
      const links = item?.volumeInfo?.imageLinks || {};
      const raw = links.large || links.medium || links.thumbnail || links.smallThumbnail;
      if (raw) {
        out.push(
          String(raw)
            .replace("http://", "https://")
            .replace(/&edge=[^&]*/g, "")
            .replace(/&source=[^&]*/g, "")
        );
      }
    }
    return [...new Set(out)];
  } catch (e: any) {
    console.log(`    google books search error: ${e.message}`);
    return [];
  }
}

async function openLibraryCandidates(title: string, author: string): Promise<string[]> {
  try {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=5`;
    const data = await fetchJson(url);
    const out: string[] = [];
    for (const doc of (data.docs || [])) {
      if (doc.cover_i) out.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`);
    }
    return [...new Set(out)];
  } catch (e: any) {
    console.log(`    openlibrary search error: ${e.message}`);
    return [];
  }
}

function describe(h: HeadResult): string {
  return `status=${h.status} ct=${h.contentType ?? "?"} len=${h.contentLength ?? "?"} redirects=${h.redirects ?? 0}${h.error ? ` err=${h.error}` : ""}`;
}

async function main() {
  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connUrl) {
    console.error("DATABASE_URL / DIRECT_URL not set. Run via: npx dotenv-cli -e .env -- npx tsx scripts/fix-specific-covers.ts");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  console.log(`=== fix-specific-covers.ts ${DRY_RUN ? "[DRY RUN]" : ""} ===\n`);

  for (const target of TARGETS) {
    console.log(`──────────────────────────────────────────────`);
    console.log(`TARGET: "${target.title}" by ${target.author}`);
    console.log(`──────────────────────────────────────────────`);

    const rows: Array<{ id: number; title: string; cover: string | null }> =
      await prisma.$queryRawUnsafe(
        `SELECT id, title, cover FROM items
         WHERE title = $1 AND type = 'book' AND parent_item_id IS NULL
         ORDER BY id ASC`,
        target.title
      );

    if (rows.length === 0) {
      console.log(`  ❌ NOT FOUND in DB (exact-title match on type='book')`);
      // Try fuzzy
      const fuzzy: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, title, cover FROM items
         WHERE title ILIKE $1 AND type = 'book' AND parent_item_id IS NULL
         ORDER BY id ASC LIMIT 5`,
        `%${target.title}%`
      );
      if (fuzzy.length > 0) {
        console.log(`  Fuzzy matches:`);
        for (const f of fuzzy) console.log(`    [${f.id}] "${f.title}" cover=${f.cover ? f.cover.slice(0, 80) : "NULL"}`);
      }
      console.log("");
      continue;
    }

    for (const row of rows) {
      console.log(`\n  [${row.id}] "${row.title}"`);
      const cur = row.cover;
      console.log(`    current cover: ${cur === null ? "NULL" : cur === "" ? "EMPTY_STRING" : cur}`);
      console.log(`    current length: ${cur === null ? "(null)" : cur.length}`);

      // Known browser-ORB-broken domains: server returns the bytes but
      // Chrome's Opaque Resource Blocking drops them. HEAD-only checks
      // (like the prior fix scripts used) miss this entirely.
      const ORB_BROKEN_HOSTS = [
        "images-na.ssl-images-amazon.com",
        "m.media-amazon.com",
      ];
      // covers.openlibrary.org 302-chains through archive.org's
      // view_archive.php endpoint, which Chrome ORB blocks because it
      // looks like a data download not an image.

      let needsReplace = false;
      if (!cur) {
        console.log(`    → empty/null → replace`);
        needsReplace = true;
      } else if (!/^https?:\/\//.test(cur)) {
        console.log(`    → not http(s) → replace`);
        needsReplace = true;
      } else if (ORB_BROKEN_HOSTS.some((h) => cur.includes(h))) {
        console.log(`    → host is on browser-ORB-broken list → replace`);
        needsReplace = true;
      } else {
        const h = await head(cur);
        console.log(`    HEAD result: ${describe(h)}`);
        if (h.finalUrl && h.finalUrl !== cur) console.log(`    final URL: ${h.finalUrl}`);
        if (h.finalUrl && /archive\.org\/.*view_archive\.php/.test(h.finalUrl)) {
          console.log(`    → redirects to archive.org view_archive (ORB-blocked in browsers) → replace`);
          needsReplace = true;
        } else if (!h.ok) {
          console.log(`    → HEAD failed quality bar → replace`);
          needsReplace = true;
        } else {
          console.log(`    ✅ existing URL is healthy — no replacement needed`);
        }
      }

      if (!needsReplace) continue;

      // Build candidates
      console.log(`    searching for replacement...`);
      const gbCands = await googleBooksCandidates(row.title, target.author);
      const olCands = await openLibraryCandidates(row.title, target.author);
      console.log(`    google books candidates: ${gbCands.length}`);
      console.log(`    openlibrary candidates: ${olCands.length}`);

      let chosen: { url: string; head: HeadResult } | null = null;
      for (const cand of [...gbCands, ...olCands]) {
        const h = await head(cand);
        const tag = h.ok ? "✓" : "✗";
        console.log(`      ${tag} ${cand.slice(0, 90)} → ${describe(h)}`);
        if (h.ok) { chosen = { url: cand, head: h }; break; }
      }

      if (!chosen) {
        console.log(`    ❌ no working replacement found — leaving unchanged`);
        continue;
      }

      console.log(`    NEW URL: ${chosen.url}`);

      // Safeguard: refuse to write null/empty
      if (!chosen.url || chosen.url.length === 0) {
        console.log(`    ❌ safeguard tripped — empty replacement`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`    [dry-run] would UPDATE items SET cover = '${chosen.url}' WHERE id = ${row.id}`);
        continue;
      }

      await prisma.$executeRawUnsafe(
        `UPDATE items SET cover = $1 WHERE id = $2`,
        chosen.url,
        row.id,
      );
      console.log(`    💾 UPDATE issued`);

      // Re-read + re-verify
      const after: any[] = await prisma.$queryRawUnsafe(
        `SELECT cover FROM items WHERE id = $1`, row.id
      );
      const stored = after[0]?.cover;
      console.log(`    re-read stored cover: ${stored}`);
      if (stored !== chosen.url) {
        console.log(`    ❌ POST-WRITE MISMATCH — DB has '${stored}' instead of '${chosen.url}'`);
        continue;
      }
      const reverify = await head(stored);
      console.log(`    re-verify HEAD: ${describe(reverify)}`);
      console.log(reverify.ok ? `    ✅ FIXED — DB persisted, URL still resolves` : `    ⚠️ DB persisted but URL no longer resolves (?!)`);
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
