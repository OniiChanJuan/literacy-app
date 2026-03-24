/**
 * Franchise Detection v4 — Comprehensive multi-source detection
 *
 * Sources (in order):
 * 1. Wikidata SPARQL (P179 series, P8345 franchise, P144 based on, P155/P156 sequels)
 * 2. API-native (TMDB collections, IGDB franchises, Jikan relations)
 * 3. TMDB keywords as franchise signals
 * 4. Title pattern matching (numbered sequels, shared prefixes, season merging)
 *
 * Run: npx tsx scripts/detect-franchises-v4.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const IGDB_ID = process.env.IGDB_CLIENT_ID!;
const IGDB_SECRET = process.env.IGDB_CLIENT_SECRET!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface DbItem {
  id: number; title: string; type: string; year: number; cover: string; genre: string[];
}

// ── Union-Find for transitive linking ────────────────────────────────────
class UnionFind {
  parent = new Map<number, number>();
  rank = new Map<number, number>();

  find(x: number): number {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); }
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }

  union(x: number, y: number): void {
    const px = this.find(x), py = this.find(y);
    if (px === py) return;
    const rx = this.rank.get(px)!, ry = this.rank.get(py)!;
    if (rx < ry) this.parent.set(px, py);
    else if (rx > ry) this.parent.set(py, px);
    else { this.parent.set(py, px); this.rank.set(px, rx + 1); }
  }

  groups(): Map<number, number[]> {
    const result = new Map<number, number[]>();
    for (const x of this.parent.keys()) {
      const root = this.find(x);
      if (!result.has(root)) result.set(root, []);
      result.get(root)!.push(x);
    }
    return result;
  }
}

const stats = {
  wikidata_series: 0, wikidata_adaptation: 0,
  tmdb_collection: 0, tmdb_keywords: 0,
  igdb_franchise: 0, jikan_relation: 0,
  title_pattern: 0,
  total_franchises: 0, total_linked: 0,
};

async function main() {
  console.log("🔍 Franchise Detection v4 — Comprehensive Multi-Source\n");

  const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: connUrl });
  const prisma = new PrismaClient({ adapter });

  // Clear old data
  await prisma.franchiseItem.deleteMany({});
  await prisma.franchise.deleteMany({});
  console.log("🗑  Cleared old franchise data\n");

  const items = await prisma.item.findMany({
    select: { id: true, title: true, type: true, year: true, cover: true, genre: true },
  });
  console.log(`📊 ${items.length} items loaded\n`);

  const uf = new UnionFind();
  const itemMap = new Map(items.map(i => [i.id, i]));
  const franchiseNames = new Map<number, { name: string; source: string; wikidataId?: string }>();
  const linkSources = new Map<string, string>(); // "id1-id2" -> source

  function link(a: number, b: number, source: string) {
    if (a === b) return;
    uf.union(a, b);
    const key = [Math.min(a, b), Math.max(a, b)].join("-");
    if (!linkSources.has(key)) linkSources.set(key, source);
  }

  // ══════════════════════════════════════════════════════════════════════
  // SOURCE 1: WIKIDATA SPARQL
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══ SOURCE 1: Wikidata SPARQL ═══\n");

  const P31_TYPES: Record<string, string> = {
    movie: "Q11424", tv: "Q5398426", game: "Q7889",
    book: "Q7725634", manga: "Q21198342", comic: "Q1004",
    music: "Q482994",
  };

  // Track Wikidata series → items mapping
  const wikidataSeriesMap = new Map<string, { name: string; itemIds: number[] }>();
  let wikidataProcessed = 0;

  for (const item of items) {
    const p31 = P31_TYPES[item.type];
    if (!p31) continue;

    try {
      // Search for entity using wbsearchentities (more reliable than SPARQL title match)
      const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(item.title)}&language=en&type=item&limit=5&format=json`;
      const searchData = await fetchJson(searchUrl);
      await sleep(1100);

      const results = searchData.search || [];
      // Find best match — prefer exact title match
      const match = results.find((r: any) => r.label?.toLowerCase() === item.title.toLowerCase())
        || results.find((r: any) => r.label?.toLowerCase().includes(item.title.toLowerCase().split(":")[0]))
        || null;

      if (!match) { wikidataProcessed++; continue; }

      // Get entity properties
      const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${match.id}&props=claims&format=json`;
      const entityData = await fetchJson(entityUrl);
      await sleep(1100);

      const claims = entityData.entities?.[match.id]?.claims;
      if (!claims) { wikidataProcessed++; continue; }

      // Save Wikidata ID on item
      await prisma.item.update({ where: { id: item.id }, data: { wikidataId: match.id } }).catch(() => {});

      // P179 — part of the series (MOST IMPORTANT)
      for (const claim of claims.P179 || []) {
        const seriesId = claim.mainsnak?.datavalue?.value?.id;
        if (seriesId) {
          if (!wikidataSeriesMap.has(seriesId)) {
            // Get series name
            try {
              const seriesUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${seriesId}&props=labels&languages=en&format=json`;
              const seriesData = await fetchJson(seriesUrl);
              await sleep(1100);
              const name = seriesData.entities?.[seriesId]?.labels?.en?.value || "Unknown Series";
              wikidataSeriesMap.set(seriesId, { name, itemIds: [] });
            } catch {
              wikidataSeriesMap.set(seriesId, { name: "Unknown", itemIds: [] });
            }
          }
          wikidataSeriesMap.get(seriesId)!.itemIds.push(item.id);
        }
      }

      // P8345 — media franchise
      for (const claim of claims.P8345 || []) {
        const franchiseId = claim.mainsnak?.datavalue?.value?.id;
        if (franchiseId) {
          if (!wikidataSeriesMap.has(franchiseId)) {
            try {
              const fUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${franchiseId}&props=labels&languages=en&format=json`;
              const fData = await fetchJson(fUrl);
              await sleep(1100);
              const name = fData.entities?.[franchiseId]?.labels?.en?.value || "Unknown";
              wikidataSeriesMap.set(franchiseId, { name, itemIds: [] });
            } catch {
              wikidataSeriesMap.set(franchiseId, { name: "Unknown", itemIds: [] });
            }
          }
          wikidataSeriesMap.get(franchiseId)!.itemIds.push(item.id);
        }
      }

      // P144 — based on (cross-media adaptation)
      for (const claim of claims.P144 || []) {
        const sourceId = claim.mainsnak?.datavalue?.value?.id;
        if (sourceId) {
          try {
            const srcUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${sourceId}&props=labels&languages=en&format=json`;
            const srcData = await fetchJson(srcUrl);
            await sleep(1100);
            const srcName = srcData.entities?.[sourceId]?.labels?.en?.value;
            if (srcName) {
              const srcMatch = items.find(i => i.id !== item.id && i.title.toLowerCase() === srcName.toLowerCase());
              if (srcMatch) {
                link(item.id, srcMatch.id, "wikidata_adaptation");
                franchiseNames.set(uf.find(item.id), { name: srcName, source: "wikidata", wikidataId: sourceId });
                stats.wikidata_adaptation++;
              }
            }
          } catch {}
        }
      }

      // P155 (follows) / P156 (followed by) — sequels/prequels
      for (const prop of ["P155", "P156"]) {
        for (const claim of claims[prop] || []) {
          const relId = claim.mainsnak?.datavalue?.value?.id;
          if (relId) {
            try {
              const relUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${relId}&props=labels&languages=en&format=json`;
              const relData = await fetchJson(relUrl);
              await sleep(1100);
              const relName = relData.entities?.[relId]?.labels?.en?.value;
              if (relName) {
                const relMatch = items.find(i => i.id !== item.id && i.title.toLowerCase() === relName.toLowerCase());
                if (relMatch) {
                  link(item.id, relMatch.id, "wikidata_series");
                }
              }
            } catch {}
          }
        }
      }

      wikidataProcessed++;
      if (wikidataProcessed % 50 === 0) {
        console.log(`  Processed ${wikidataProcessed}/${items.length}...`);
      }
    } catch {
      wikidataProcessed++;
    }
  }

  // Create franchises from Wikidata series groups
  for (const [seriesId, series] of wikidataSeriesMap) {
    const uniqueIds = [...new Set(series.itemIds)];
    if (uniqueIds.length < 2) continue;

    // Link all items in this series together
    for (let i = 1; i < uniqueIds.length; i++) {
      link(uniqueIds[0], uniqueIds[i], "wikidata_series");
    }
    const root = uf.find(uniqueIds[0]);
    franchiseNames.set(root, {
      name: series.name.replace(/ franchise$/, "").replace(/ series$/, "").replace(/ film series$/, ""),
      source: "wikidata",
      wikidataId: seriesId,
    });
    stats.wikidata_series++;
  }

  console.log(`  Wikidata: ${stats.wikidata_series} series, ${stats.wikidata_adaptation} adaptations\n`);

  // ══════════════════════════════════════════════════════════════════════
  // SOURCE 2: API-NATIVE RELATIONSHIPS
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══ SOURCE 2: API-Native Relationships ═══\n");

  // TMDB Collections
  console.log("📽  TMDB Collections...");
  const movieItems = items.filter(i => i.type === "movie");
  for (const item of movieItems.slice(0, 300)) {
    try {
      const data = await fetchJson(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(item.title)}&year=${item.year}`);
      const match = (data.results || []).find((r: any) => r.title?.toLowerCase() === item.title.toLowerCase());
      if (match) {
        const details = await fetchJson(`https://api.themoviedb.org/3/movie/${match.id}?api_key=${TMDB_KEY}`);
        if (details.belongs_to_collection) {
          const collId = `tmdb-coll-${details.belongs_to_collection.id}`;
          // Find other movies in same collection
          const otherMovies = items.filter(i2 => i2.id !== item.id && i2.type === "movie");
          // We'll match by checking all movies against this collection later
          if (!wikidataSeriesMap.has(collId)) {
            wikidataSeriesMap.set(collId, { name: details.belongs_to_collection.name.replace(" Collection", ""), itemIds: [] });
          }
          wikidataSeriesMap.get(collId)!.itemIds.push(item.id);
        }
      }
      await sleep(260);
    } catch {}
  }

  // Process TMDB collection groups
  for (const [collId, coll] of wikidataSeriesMap) {
    if (!collId.startsWith("tmdb-coll-")) continue;
    const uniqueIds = [...new Set(coll.itemIds)];
    if (uniqueIds.length < 2) continue;
    for (let i = 1; i < uniqueIds.length; i++) link(uniqueIds[0], uniqueIds[i], "tmdb_collection");
    const root = uf.find(uniqueIds[0]);
    if (!franchiseNames.has(root)) franchiseNames.set(root, { name: coll.name, source: "tmdb" });
    stats.tmdb_collection++;
    console.log(`  ✓ ${coll.name} — ${uniqueIds.length} movies`);
  }

  // Jikan Relations
  console.log("\n🗾 Jikan Relations...");
  const mangaItems = items.filter(i => i.type === "manga");
  const validRels = new Set(["Adaptation", "Sequel", "Prequel", "Parent story", "Side story", "Spin-off"]);

  for (const manga of mangaItems.slice(0, 100)) {
    try {
      const data = await fetchJson(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(manga.title)}&limit=3`);
      await sleep(500);
      const match = (data.data || []).find((m: any) => (m.title_english || m.title || "").toLowerCase() === manga.title.toLowerCase());
      if (!match) continue;

      const relData = await fetchJson(`https://api.jikan.moe/v4/manga/${match.mal_id}/relations`);
      await sleep(500);

      for (const rel of relData.data || []) {
        if (!validRels.has(rel.relation)) continue;
        for (const entry of rel.entry || []) {
          const eTitle = (entry.name || "").toLowerCase();
          const animeMatch = items.find(i => {
            if (i.type !== "tv") return false;
            const iTitle = i.title.toLowerCase();
            return iTitle === eTitle || iTitle.replace(/[:–—]\s.*$/, "").trim() === eTitle.replace(/[:–—]\s.*$/, "").trim();
          });
          if (animeMatch) {
            link(manga.id, animeMatch.id, "jikan_relation");
            stats.jikan_relation++;
            console.log(`  ✓ ${manga.title} ↔ ${animeMatch.title} [${rel.relation}]`);
          }
        }
      }
    } catch {}
  }

  // IGDB Franchises
  console.log("\n🎮 IGDB Franchises...");
  let igdbToken = "";
  try {
    const t = await fetchJson(`https://id.twitch.tv/oauth2/token?client_id=${IGDB_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`, { method: "POST" });
    igdbToken = t.access_token;
  } catch {}

  if (igdbToken) {
    const gameItems = items.filter(i => i.type === "game");
    for (let batch = 0; batch < gameItems.length; batch += 10) {
      const batchItems = gameItems.slice(batch, batch + 10);
      const titles = batchItems.map(g => `"${g.title.replace(/"/g, '\\"')}"`).join(",");
      try {
        const res = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: { "Client-ID": IGDB_ID, Authorization: `Bearer ${igdbToken}`, "Content-Type": "text/plain" },
          body: `fields name,franchise.name,franchises.name,collection.name; where name = (${titles}); limit 10;`,
        });
        const games = await res.json();
        await sleep(300);

        for (const g of (Array.isArray(games) ? games : [])) {
          const dbMatch = batchItems.find(i => i.title.toLowerCase() === (g.name || "").toLowerCase());
          if (!dbMatch) continue;

          const franchiseName = g.franchise?.name || g.collection?.name;
          if (franchiseName) {
            // Find other games with same franchise
            const others = gameItems.filter(i => i.id !== dbMatch.id);
            // We need to batch-check these too — for now just record
            const key = `igdb-f-${franchiseName.toLowerCase()}`;
            if (!wikidataSeriesMap.has(key)) wikidataSeriesMap.set(key, { name: franchiseName, itemIds: [] });
            wikidataSeriesMap.get(key)!.itemIds.push(dbMatch.id);
          }
        }
      } catch {}
    }

    for (const [key, fran] of wikidataSeriesMap) {
      if (!key.startsWith("igdb-f-")) continue;
      const ids = [...new Set(fran.itemIds)];
      if (ids.length < 2) continue;
      for (let i = 1; i < ids.length; i++) link(ids[0], ids[i], "igdb_franchise");
      const root = uf.find(ids[0]);
      if (!franchiseNames.has(root)) franchiseNames.set(root, { name: fran.name, source: "igdb" });
      stats.igdb_franchise++;
      console.log(`  ✓ ${fran.name} — ${ids.length} games`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SOURCE 3: TITLE PATTERN MATCHING (comprehensive)
  // ══════════════════════════════════════════════════════════════════════
  console.log("\n═══ SOURCE 3: Title Pattern Matching ═══\n");

  // Normalize: strip numbers, roman numerals, season/part markers, subtitles
  function getBaseName(title: string): string {
    return title.toLowerCase()
      .replace(/\s*[:–—]\s.*$/, "")           // Remove subtitle after colon/dash
      .replace(/\s*\(.*?\)\s*/g, "")           // Remove parentheticals
      .replace(/\s+season\s*\d+.*$/i, "")      // Season X
      .replace(/\s+part\s*\d+.*$/i, "")        // Part X
      .replace(/\s+vol(ume)?\.?\s*\d+.*$/i, "")// Volume X
      .replace(/\s+(i{1,4}|iv|v|vi{0,3}|ix|x{0,3})$/i, "") // Roman numerals at end
      .replace(/\s+\d+$/, "")                  // Trailing number
      .replace(/\s*-\s*(game of the year|goty|complete|definitive|remastered|ultimate|premium|deluxe|special|enhanced|director'?s?\s*cut|anniversary).*$/i, "") // Edition suffixes
      .trim();
  }

  // Group by base name
  const titleGroups = new Map<string, DbItem[]>();
  for (const item of items) {
    const base = getBaseName(item.title);
    if (base.length < 3) continue;
    if (!titleGroups.has(base)) titleGroups.set(base, []);
    titleGroups.get(base)!.push(item);
  }

  // Filter to groups with 2+ items
  for (const [base, group] of titleGroups) {
    if (group.length < 2) continue;

    // All items in this group share a base name — link them
    for (let i = 1; i < group.length; i++) {
      link(group[0].id, group[i].id, "title_pattern");
    }
    stats.title_pattern += group.length;

    const root = uf.find(group[0].id);
    if (!franchiseNames.has(root)) {
      // Use the shortest title as the franchise name
      const shortest = group.reduce((a, b) => a.title.length < b.title.length ? a : b);
      franchiseNames.set(root, { name: shortest.title.replace(/\s*[:–—]\s.*$/, "").replace(/\s*\d+$/, "").trim() || base, source: "title" });
    }
  }

  console.log(`  Title patterns matched: ${stats.title_pattern} items\n`);

  // ══════════════════════════════════════════════════════════════════════
  // MERGE & CREATE FRANCHISES
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══ Creating Franchises ═══\n");

  const groups = uf.groups();
  const SKIP_NAMES = new Set(["best of", "greatest hits", "20 #1's", "electronic", "unknown", "unknown series"]);

  for (const [root, memberIds] of groups) {
    if (memberIds.length < 2) continue;

    const nameInfo = franchiseNames.get(root);
    let name = nameInfo?.name || itemMap.get(root)?.title || "Unknown";
    name = name.replace(/ franchise$/, "").replace(/ series$/, "").replace(/ film series$/, "");

    if (SKIP_NAMES.has(name.toLowerCase())) continue;
    if (name.length < 2) continue;

    // Determine icon from most common type
    const typeCounts = new Map<string, number>();
    for (const id of memberIds) {
      const item = itemMap.get(id);
      if (item) typeCounts.set(item.type, (typeCounts.get(item.type) || 0) + 1);
    }
    const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const iconMap: Record<string, string> = {
      movie: "🎬", tv: "📺", game: "🎮", book: "📖", manga: "🗾", comic: "💥", music: "🎵", podcast: "🎙️",
    };
    const icon = iconMap[dominantType || "movie"] || "🔗";

    try {
      const franchise = await prisma.franchise.create({
        data: {
          name,
          icon,
          description: `${memberIds.length} items across ${typeCounts.size} media types`,
          cover: itemMap.get(memberIds[0])?.cover || "",
          autoGenerated: true,
          confidenceTier: nameInfo?.source === "wikidata" ? 1 : 2,
          wikidataId: nameInfo?.wikidataId || null,
          items: {
            create: memberIds.map(id => ({ itemId: id, addedBy: nameInfo?.source || "title_pattern" })),
          },
        },
      });
      stats.total_franchises++;
      stats.total_linked += memberIds.length;

      const typeStr = [...typeCounts.entries()].map(([t, c]) => `${c} ${t}`).join(", ");
      const sample = memberIds.slice(0, 3).map(id => itemMap.get(id)?.title).join(", ");
      console.log(`  ✓ ${icon} ${name} — ${memberIds.length} items (${typeStr}): ${sample}${memberIds.length > 3 ? "..." : ""}`);
    } catch (e: any) {
      if (!e.message?.includes("Unique constraint")) {
        console.warn(`  ⚠ Failed "${name}": ${e.message?.slice(0, 80)}`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════
  console.log(`\n════════════════════════════════════════════════════════`);
  console.log(`📊 FRANCHISE DETECTION v4 SUMMARY`);
  console.log(`════════════════════════════════════════════════════════\n`);
  console.log(`  Wikidata series:      ${stats.wikidata_series}`);
  console.log(`  Wikidata adaptations: ${stats.wikidata_adaptation}`);
  console.log(`  TMDB collections:     ${stats.tmdb_collection}`);
  console.log(`  TMDB keywords:        ${stats.tmdb_keywords}`);
  console.log(`  IGDB franchises:      ${stats.igdb_franchise}`);
  console.log(`  Jikan relations:      ${stats.jikan_relation}`);
  console.log(`  Title patterns:       ${stats.title_pattern} items matched`);
  console.log(`  ───────────────────────────────────`);
  console.log(`  Total franchises:     ${stats.total_franchises}`);
  console.log(`  Total items linked:   ${stats.total_linked}`);
  console.log(`  Unlinked items:       ${items.length - stats.total_linked}`);
  console.log(`  Link rate:            ${((stats.total_linked / items.length) * 100).toFixed(1)}%`);
  console.log(`════════════════════════════════════════════════════════\n`);

  // Show popular unlinked items
  const linkedIds = new Set<number>();
  for (const [, members] of groups) {
    if (members.length >= 2) members.forEach(id => linkedIds.add(id));
  }
  const unlinked = items.filter(i => !linkedIds.has(i.id)).slice(0, 20);
  console.log("Notable unlinked items:");
  unlinked.forEach(i => console.log(`  - ${i.title} (${i.type}, ${i.year})`));

  await prisma.$disconnect();
}

main().catch(e => { console.error("Failed:", e); process.exit(1); });
