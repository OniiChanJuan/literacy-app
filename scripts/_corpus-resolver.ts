/**
 * Shared title→catalog-item resolver for the connection-corpus import.
 * Mirrors the matching validated in the catalog-expansion reconciliation:
 * diacritics, articles, &, roman↔arabic numerals, subtitle prefixes, and a
 * small override map for the algorithmically-hard aliases the recon resolved.
 *
 * Not a standalone script — imported by the coverage report + the importer.
 */

export type CatItem = { id: number; title: string; type: string; year: number };

const ROMAN: Record<string, string> = {
  ii: "2", iii: "3", iv: "4", vi: "6", vii: "7", viii: "8", ix: "9",
  x: "10", xi: "11", xii: "12", xiii: "13", xiv: "14",
};

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}
export function norm(s: string): string {
  return stripDiacritics(String(s).toLowerCase())
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
/** normalized, roman multi-char numerals → arabic, spaces removed */
function key(s: string): string {
  const toks = norm(s).split(" ").map((t) => ROMAN[t] ?? t);
  return toks.join("");
}
function keyNoArticle(s: string): string {
  return key(norm(s).replace(/^(the|a|an) /, ""));
}
/** strip trailing "(year)", "S1"/"season N", "(US)"/"(UK)" disambiguators */
function stripTrailers(s: string): string {
  return s
    .replace(/\(\d{4}\)/g, " ")
    .replace(/\b(s\d+|season\s*\d+|us|uk)\b/gi, " ")
    .replace(/\([^)]*\)/g, " ")
    .trim();
}

// sheet media → tolerant catalog types (catalog has NO 'anime' type)
const TYPE_OK: Record<string, Set<string>> = {
  game: new Set(["game"]),
  movie: new Set(["movie"]),
  tv: new Set(["tv"]),
  book: new Set(["book"]),
  anime: new Set(["tv", "movie"]),
  manga: new Set(["manga", "comic"]),
  comic: new Set(["comic", "manga"]),
};

// Algorithmically-hard aliases resolved during reconciliation. Keyed by
// `${norm(title)}|${mediaLower}` → catalog item id. Kept tiny + explicit.
const OVERRIDES: Record<string, number> = {
  "the legend of zelda botw|game": 456,        // → Breath of the Wild
  "ghost in the shell sac|anime": 1729,        // → Ghost in the Shell: S.A.C. 2nd GIG
  "star wars a new hope|movie": 115,           // → Star Wars (1977)
  "the lord of the rings fellowship|movie": 1352, // → Fellowship of the Ring
  "oyasumi punpun|manga": 795,                 // → Goodnight Punpun
  "haikyuu|anime": 334,                        // → Haikyu!!
  "civilization vi|game": 11335,               // → Sid Meier's Civilization VI
  "skyrim|game": 1644,                          // → The Elder Scrolls V: Skyrim
  "beloved is canon|book": 16115,              // → Beloved (corpus title carries an "is canon" artifact)
  "watchmen|book": 15,                         // → Watchmen (graphic novel, stored as comic)
  "a song of ice and fire|book": 15982,        // → A Game of Thrones (series book 1, HBO tie-in)
};

export type Resolution = {
  itemId: number;
  matchedTitle: string;
  matchedType: string;
  via: "override" | "exact" | "no-article" | "subtitle" | "trailer-stripped";
} | null;

export function buildResolver(items: CatItem[], extraOverrides?: Record<string, number>) {
  const overrides = { ...OVERRIDES, ...(extraOverrides ?? {}) };
  const okFor = (media: string) => TYPE_OK[media?.toLowerCase()] ?? new Set<string>();
  // indices
  const byKey = new Map<string, CatItem[]>();
  const byNoArt = new Map<string, CatItem[]>();
  const byType: Record<string, CatItem[]> = {};
  for (const it of items) {
    const k = key(it.title);
    const ka = keyNoArticle(it.title);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(it);
    (byNoArt.get(ka) ?? byNoArt.set(ka, []).get(ka)!).push(it);
    (byType[it.type] ??= []).push(it);
  }
  const pick = (cands: CatItem[], ok: Set<string>): CatItem | null => {
    const m = cands.filter((c) => ok.has(c.type));
    if (m.length === 0) return null;
    // prefer the oldest (canonical original) on ties — recon showed remakes
    // share titles; the corpus references the canonical work.
    return m.sort((a, b) => (a.year || 9999) - (b.year || 9999))[0];
  };

  function resolve(title: string, media: string): Resolution {
    const ok = okFor(media);
    if (ok.size === 0) return null;

    const ov = overrides[`${norm(title)}|${(media || "").toLowerCase()}`];
    if (ov != null) {
      const it = items.find((i) => i.id === ov);
      if (it) return { itemId: it.id, matchedTitle: it.title, matchedType: it.type, via: "override" };
    }

    const k = key(title);
    let hit = pick(byKey.get(k) ?? [], ok);
    if (hit) return { itemId: hit.id, matchedTitle: hit.title, matchedType: hit.type, via: "exact" };

    const ka = keyNoArticle(title);
    hit = pick(byNoArt.get(ka) ?? [], ok);
    if (hit) return { itemId: hit.id, matchedTitle: hit.title, matchedType: hit.type, via: "no-article" };

    // subtitle: catalog title starts with query key (query is the short form);
    // pick the shortest such catalog title within an allowed type.
    if (k.length >= 5) {
      let best: CatItem | null = null;
      let bestLen = Infinity;
      for (const t of ok) {
        for (const it of byType[t] ?? []) {
          const tk = key(it.title);
          if (tk.startsWith(k) && tk.length < bestLen) { best = it; bestLen = tk.length; }
        }
      }
      if (best) return { itemId: best.id, matchedTitle: best.title, matchedType: best.type, via: "subtitle" };
    }

    // publisher/studio prefix: catalog title ends with the query key
    // ("Sid Meier's Civilization VI" endsWith "civilization6"). Guarded by
    // length so short titles can't false-match; shortest catalog title wins.
    if (k.length >= 8) {
      let best: CatItem | null = null;
      let bestLen = Infinity;
      for (const t of ok) {
        for (const it of byType[t] ?? []) {
          const tk = key(it.title);
          if (tk.endsWith(k) && tk.length < bestLen) { best = it; bestLen = tk.length; }
        }
      }
      if (best) return { itemId: best.id, matchedTitle: best.title, matchedType: best.type, via: "subtitle" };
    }

    // retry with trailers stripped ("True Detective S1", "It (2017)", "God of War (2018)")
    const stripped = stripTrailers(title);
    if (stripped && norm(stripped) !== norm(title)) {
      const r = resolve(stripped, media);
      if (r) return { ...r, via: "trailer-stripped" };
    }
    return null;
  }

  return { resolve };
}
