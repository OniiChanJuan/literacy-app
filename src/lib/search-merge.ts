/**
 * Client-side merge of the two search phases.
 *
 * Search is now local-first: the client fetches `scope=local` (instant, indexed
 * DB) and renders it, then fetches `scope=external` (the non-blocking live-API
 * follow-up) and merges it in here. Merging dedups external dupes of local
 * items (preferring the local row, which has the real route id), re-ranks by
 * searchRank, and re-groups ordered by relevance.
 */

export interface SearchItem {
  id: number;
  title: string;
  type: string;
  year?: number;
  cover?: string;
  routeId?: string;
  slug?: string | null;
  source?: string;
  searchRank?: number;
  people?: unknown;
  [k: string]: unknown;
}

export interface GroupedSearch {
  bestMatch?: SearchItem | null;
  groups: Record<string, { label: string; items: SearchItem[]; totalResults?: number }>;
  franchise?: { id: number; name: string; icon: string; itemCount: number; typeCount: number } | null;
  creatorMatch?: { name: string; role: string; itemCount: number } | null;
  suggestions?: { type: string; value: string; label: string }[];
  totalResults?: number;
}

const TYPE_LABELS: Record<string, string> = {
  movie: "Movies", tv: "TV Shows", book: "Books", manga: "Manga",
  comic: "Comics", game: "Games", music: "Music", podcast: "Podcasts",
};
const CAP = 20;

export function mergeSearch(
  local: GroupedSearch | null | undefined,
  external: GroupedSearch | null | undefined,
): GroupedSearch {
  const flat: SearchItem[] = [];
  const collect = (g?: GroupedSearch | null) => {
    if (!g?.groups) return;
    for (const grp of Object.values(g.groups)) for (const it of grp.items) flat.push(it);
  };
  collect(local);
  collect(external);

  // Dedup by type+title+year (the same item from both phases), preferring the
  // local row (real catalog id/slug); otherwise the higher-ranked one.
  const seen = new Map<string, SearchItem>();
  for (const it of flat) {
    const key = `${it.type}-${(it.title || "").toLowerCase()}-${it.year ?? ""}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, it); continue; }
    const preferNew =
      (it.source === "local" && prev.source !== "local") ||
      (prev.source !== "local" && it.source !== "local" && (it.searchRank ?? 0) > (prev.searchRank ?? 0));
    if (preferNew) seen.set(key, it);
  }

  const merged = [...seen.values()].sort((a, b) => (b.searchRank ?? 0) - (a.searchRank ?? 0));

  const groups: Record<string, { label: string; items: SearchItem[]; totalResults: number }> = {};
  for (const it of merged) {
    const type = it.type || "other";
    if (!groups[type]) {
      groups[type] = {
        label: external?.groups?.[type]?.label || local?.groups?.[type]?.label || TYPE_LABELS[type] || type,
        items: [],
        totalResults: 0,
      };
    }
    groups[type].totalResults++;
    if (groups[type].items.length < CAP) groups[type].items.push(it);
  }

  // Order groups by relevance (each type's best item's rank), not raw count.
  const ordered: Record<string, { label: string; items: SearchItem[]; totalResults: number }> = {};
  Object.entries(groups)
    .sort(([, a], [, b]) => (b.items[0]?.searchRank ?? 0) - (a.items[0]?.searchRank ?? 0))
    .forEach(([t, g]) => { ordered[t] = g; });

  return {
    bestMatch: merged[0] || null,
    groups: ordered,
    franchise: local?.franchise ?? external?.franchise ?? null,
    creatorMatch: local?.creatorMatch ?? external?.creatorMatch ?? null,
    suggestions: (local?.suggestions?.length ? local.suggestions : external?.suggestions) || [],
    totalResults: merged.length,
  };
}
