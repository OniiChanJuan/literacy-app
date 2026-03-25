// Import parsers for Letterboxd, Goodreads, MyAnimeList, Steam, Spotify

export interface ParsedImportItem {
  title: string;
  year?: number;
  rating?: number; // 1-5 scale (normalized)
  status?: "completed" | "in_progress" | "want_to" | "dropped";
  review?: string;
  externalId?: string; // platform-specific ID
  mediaType: "movie" | "tv" | "book" | "manga" | "anime" | "game" | "music" | "podcast";
  source: string; // letterboxd, goodreads, myanimelist, steam, spotify
  rawData?: Record<string, string>; // original CSV row for debugging
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

  if (nameIdx === -1) return [];

  const items: ParsedImportItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = row[nameIdx]?.trim();
    const reviewText = reviewIdx >= 0 ? row[reviewIdx]?.trim() : "";
    if (!title || !reviewText) continue;

    const ratingStr = ratingIdx >= 0 ? row[ratingIdx]?.trim() : "";
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

    let status: ParsedImportItem["status"];
    if (shelf === "read") status = "completed";
    else if (shelf === "currently-reading") status = "in_progress";
    else if (shelf === "to-read") status = "want_to";
    else status = "completed"; // default for rated items

    const rawData: Record<string, string> = {};
    headers.forEach((h, idx) => { rawData[h] = row[idx] || ""; });

    items.push({
      title,
      year: yearStr ? parseInt(yearStr) || undefined : undefined,
      rating: rating && rating > 0 ? rating : undefined, // Goodreads 0 = not rated
      status,
      review: review || undefined,
      externalId: isbn13 || undefined,
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
    score: number; // 0-10
    num_episodes_watched?: number;
    num_chapters_read?: number;
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

    return {
      title: item.node.title,
      year,
      rating,
      status,
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
