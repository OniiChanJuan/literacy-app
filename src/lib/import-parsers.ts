// Import parsers for Letterboxd, Goodreads, MyAnimeList, Steam, Spotify

export interface ParsedImportItem {
  title: string;
  year?: number;
  rating?: number;        // 1-5 scale (normalized)
  status?: "completed" | "in_progress" | "want_to" | "dropped";
  review?: string;
  externalId?: string;    // platform-specific ID
  originalDate?: string;  // ISO date string — used as created_at on rating and completedAt on library entry
  mediaType: "movie" | "tv" | "book" | "manga" | "anime" | "game" | "music" | "podcast";
  source: string;         // letterboxd, goodreads, myanimelist, steam, spotify
  rawData?: Record<string, string>; // original CSV row for debugging
}

// ─── Date parsing helper ──────────────────────────────────────────────

/** Parse a date string into a valid ISO string, or return undefined if invalid. */
function parseDate(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0" || trimmed === "N/A") return undefined;

  // Common formats: YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY
  let d: Date | null = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    d = new Date(trimmed + "T00:00:00Z");
  } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    d = new Date(trimmed.replace(/\//g, "-") + "T00:00:00Z");
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    d = new Date(trimmed);
  } else {
    d = new Date(trimmed);
  }

  if (!d || isNaN(d.getTime())) return undefined;
  // Sanity check: reject dates before 1888 (first film) or in the far future
  const year = d.getUTCFullYear();
  if (year < 1888 || year > new Date().getUTCFullYear() + 2) return undefined;

  return d.toISOString();
}

// ─── Letterboxd (CSV from ZIP or direct CSV) ─────────────────────────

export function parseLetterboxdCSV(csvText: string): ParsedImportItem[] {
  const rows = parseCSVRows(csvText);
  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const nameIdx = headers.indexOf("name");
  const yearIdx = headers.indexOf("year");
  const ratingIdx = headers.indexOf("rating");
  const dateIdx = headers.indexOf("date");
  const letterboxdUriIdx = headers.indexOf("letterboxd uri");

  if (nameIdx === -1) return [];

  const items: ParsedImportItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = row[nameIdx]?.trim();
    if (!title) continue;

    const yearStr = yearIdx >= 0 ? row[yearIdx]?.trim() : "";
    const ratingStr = ratingIdx >= 0 ? row[ratingIdx]?.trim() : "";
    const dateStr = dateIdx >= 0 ? row[dateIdx]?.trim() : "";

    // Letterboxd uses 0.5-5.0 scale (half stars), we use 1-5
    let rating: number | undefined;
    if (ratingStr) {
      const raw = parseFloat(ratingStr);
      if (!isNaN(raw) && raw > 0) {
        rating = Math.round(raw); // round 0.5 increments to nearest int
        if (rating < 1) rating = 1;
        if (rating > 5) rating = 5;
      }
    }

    const rawData: Record<string, string> = {};
    headers.forEach((h, idx) => { rawData[h] = row[idx] || ""; });

    items.push({
      title,
      year: yearStr ? parseInt(yearStr) : undefined,
      rating,
      status: "completed", // Letterboxd ratings.csv = watched films
      originalDate: parseDate(dateStr),
      mediaType: "movie",
      source: "letterboxd",
      externalId: letterboxdUriIdx >= 0 ? row[letterboxdUriIdx]?.trim() : undefined,
      rawData,
    });
  }

  return items;
}

// Also parse watchlist.csv from Letterboxd ZIP
export function parseLetterboxdWatchlist(csvText: string): ParsedImportItem[] {
  const rows = parseCSVRows(csvText);
  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const nameIdx = headers.indexOf("name");
  const yearIdx = headers.indexOf("year");

  if (nameIdx === -1) return [];

  const items: ParsedImportItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = row[nameIdx]?.trim();
    if (!title) continue;

    items.push({
      title,
      year: yearIdx >= 0 ? parseInt(row[yearIdx]) || undefined : undefined,
      status: "want_to",
      mediaType: "movie",
      source: "letterboxd",
    });
  }

  return items;
}

// Parse reviews.csv from Letterboxd ZIP
export function parseLetterboxdReviews(csvText: string): ParsedImportItem[] {
  const rows = parseCSVRows(csvText);
  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const nameIdx = headers.indexOf("name");
  const yearIdx = headers.indexOf("year");
  const ratingIdx = headers.indexOf("rating");
  const reviewIdx = headers.indexOf("review");
  const dateIdx = headers.indexOf("date");

  if (nameIdx === -1) return [];

  const items: ParsedImportItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = row[nameIdx]?.trim();
    const reviewText = reviewIdx >= 0 ? row[reviewIdx]?.trim() : "";
    if (!title || !reviewText) continue;

    const ratingStr = ratingIdx >= 0 ? row[ratingIdx]?.trim() : "";
    const dateStr = dateIdx >= 0 ? row[dateIdx]?.trim() : "";
    let rating: number | undefined;
    if (ratingStr) {
      const raw = parseFloat(ratingStr);
      if (!isNaN(raw) && raw > 0) {
        rating = Math.round(raw);
        if (rating < 1) rating = 1;
        if (rating > 5) rating = 5;
      }
    }

    items.push({
      title,
      year: yearIdx >= 0 ? parseInt(row[yearIdx]) || undefined : undefined,
      rating,
      review: reviewText,
      status: "completed",
      originalDate: parseDate(dateStr),
      mediaType: "movie",
      source: "letterboxd",
    });
  }

  return items;
}

// ─── Goodreads (CSV export) ──────────────────────────────────────────

export function parseGoodreadsCSV(csvText: string): ParsedImportItem[] {
  const rows = parseCSVRows(csvText);
  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const titleIdx = headers.indexOf("title");
  const authorIdx = headers.indexOf("author");
  const ratingIdx = headers.indexOf("my rating");
  const shelfIdx = headers.indexOf("exclusive shelf");
  const isbn13Idx = headers.indexOf("isbn13");
  const yearIdx = headers.indexOf("year published");
  const origYearIdx = headers.indexOf("original publication year");
  const reviewIdx = headers.indexOf("my review");
  const dateReadIdx = headers.indexOf("date read");
  const dateAddedIdx = headers.indexOf("date added");

  if (titleIdx === -1) return [];

  const items: ParsedImportItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = row[titleIdx]?.trim();
    if (!title) continue;

    const ratingStr = ratingIdx >= 0 ? row[ratingIdx]?.trim() : "";
    const rating = ratingStr ? parseInt(ratingStr) : undefined;
    const shelf = shelfIdx >= 0 ? row[shelfIdx]?.trim().toLowerCase() : "";
    const review = reviewIdx >= 0 ? row[reviewIdx]?.trim() : "";
    const isbn13 = isbn13Idx >= 0 ? row[isbn13Idx]?.trim().replace(/[="]/g, "") : "";
    const yearStr = origYearIdx >= 0 ? row[origYearIdx]?.trim() : (yearIdx >= 0 ? row[yearIdx]?.trim() : "");
    const dateReadStr = dateReadIdx >= 0 ? row[dateReadIdx]?.trim() : "";
    const dateAddedStr = dateAddedIdx >= 0 ? row[dateAddedIdx]?.trim() : "";

    let status: ParsedImportItem["status"];
    if (shelf === "read") status = "completed";
    else if (shelf === "currently-reading") status = "in_progress";
    else if (shelf === "to-read") status = "want_to";
    else status = "completed"; // default for rated items

    // Use date read for completed items, date added for others
    const originalDate = status === "completed"
      ? parseDate(dateReadStr) || parseDate(dateAddedStr)
      : parseDate(dateAddedStr);

    const rawData: Record<string, string> = {};
    headers.forEach((h, idx) => { rawData[h] = row[idx] || ""; });

    items.push({
      title,
      year: yearStr ? parseInt(yearStr) || undefined : undefined,
      rating: rating && rating > 0 ? rating : undefined, // Goodreads 0 = not rated
      status,
      review: review || undefined,
      externalId: isbn13 || undefined,
      originalDate,
      mediaType: "book",
      source: "goodreads",
      rawData,
    });
  }

  return items;
}

// ─── MyAnimeList (Jikan API response) ────────────────────────────────

export interface MALListItem {
  node: {
    id: number;
    title: string;
    main_picture?: { medium: string };
    start_date?: string;
    media_type?: string;
  };
  list_status: {
    status: string; // watching, completed, on_hold, dropped, plan_to_watch
    score: number;  // 0-10
    num_episodes_watched?: number;
    num_chapters_read?: number;
    finish_date?: string | null;
    updated_at?: string | null;
  };
}

export function parseMALItems(items: MALListItem[], mediaType: "anime" | "manga"): ParsedImportItem[] {
  return items.map(item => {
    const malStatus = item.list_status.status;
    let status: ParsedImportItem["status"];
    if (malStatus === "completed") status = "completed";
    else if (malStatus === "watching" || malStatus === "reading") status = "in_progress";
    else if (malStatus === "plan_to_watch" || malStatus === "plan_to_read") status = "want_to";
    else if (malStatus === "dropped") status = "dropped";
    else if (malStatus === "on_hold") status = "in_progress";
    else status = "completed";

    // MAL uses 0-10, we use 1-5
    let rating: number | undefined;
    if (item.list_status.score > 0) {
      rating = Math.round(item.list_status.score / 2);
      if (rating < 1) rating = 1;
      if (rating > 5) rating = 5;
    }

    const year = item.node.start_date ? parseInt(item.node.start_date.substring(0, 4)) : undefined;

    // Use finish_date for completed items, updated_at as fallback
    const originalDate = status === "completed"
      ? parseDate(item.list_status.finish_date) || parseDate(item.list_status.updated_at)
      : parseDate(item.list_status.updated_at);

    return {
      title: item.node.title,
      year,
      rating,
      status,
      originalDate,
      externalId: String(item.node.id),
      mediaType: mediaType === "anime" ? "anime" as const : "manga" as const,
      source: "myanimelist",
    };
  });
}

// ─── Steam (Steam Web API response) ──────────────────────────────────

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number; // minutes
  img_icon_url?: string;
  rtime_last_played?: number;
}

export function parseSteamGames(games: SteamGame[]): ParsedImportItem[] {
  return games
    .filter(g => g.name) // skip unnamed entries
    .map(game => {
      const playtimeHours = game.playtime_forever / 60;

      // Determine status based on playtime
      let status: ParsedImportItem["status"];
      if (playtimeHours >= 10) status = "completed";
      else if (playtimeHours >= 1) status = "in_progress";
      else if (playtimeHours > 0) status = "in_progress";
      else status = "want_to"; // owned but never played

      return {
        title: game.name,
        status,
        externalId: String(game.appid),
        mediaType: "game" as const,
        source: "steam",
        // No dates available from Steam API
      };
    });
}

// ─── Spotify (saved albums) ──────────────────────────────────────────

export interface SpotifySavedAlbum {
  album: {
    id: string;
    name: string;
    artists: { name: string }[];
    release_date: string;
    total_tracks: number;
    images: { url: string }[];
  };
  added_at: string;
}

export function parseSpotifyAlbums(albums: SpotifySavedAlbum[]): ParsedImportItem[] {
  return albums.map(item => {
    const year = item.album.release_date
      ? parseInt(item.album.release_date.substring(0, 4))
      : undefined;

    const artistName = item.album.artists?.[0]?.name || "";
    const title = artistName ? `${item.album.name} — ${artistName}` : item.album.name;

    return {
      title,
      year,
      status: "completed" as const, // saved = listened
      externalId: item.album.id,
      mediaType: "music" as const,
      source: "spotify",
      // No per-listen dates available from Spotify saved albums API
    };
  });
}

// ─── CSV Parser (handles quoted fields, commas in values) ────────────

function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current);
        current = "";
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current);
        current = "";
        if (row.some(cell => cell.trim())) rows.push(row);
        row = [];
        if (ch === '\r') i++; // skip \n in \r\n
      } else {
        current += ch;
      }
    }
  }

  // Last row
  if (current || row.length > 0) {
    row.push(current);
    if (row.some(cell => cell.trim())) rows.push(row);
  }

  return rows;
}
