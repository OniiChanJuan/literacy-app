/**
 * Description cleaning utility — strips external reviews, marketing text,
 * author backlists, and promotional content from item descriptions.
 *
 * CrossShelf is a review-first platform. Only OUR community reviews should
 * appear on the site — external review quotes muddy the identity.
 */

// ── Cutoff patterns — everything at and after these is promotional ──
// These work WITHOUT newlines since Google Books strips them

const CUTOFF_PATTERNS: RegExp[] = [
  // Review sections (with or without newline before)
  /\s*Praise for (?:the )?\w/i,
  /\s*Readers love\b/i,
  /\s*What (?:readers|critics|people) are saying/i,
  /\s*Reviews:/i,
  /\s*Critical acclaim/i,

  // Author backlists — "Other Tor books by", "Other books by", "Witcher collections"
  /\s*Other (?:Tor )?books by\b/i,
  /\s*Other (?:works|novels|titles) by\b/i,
  /\s*Also by\b/i,
  /\s*More from\b/i,
  /\s*Don't miss (?:the |any |these |his |her |their |[\w\s]+(?:'s |by ))/i,
  /\s*Coming soon from\b/i,
  /\s*Books by\b/i,
  /\s*From the author of\b/i,

  // Backlist headers that appear without "by" — specific series/publisher lists
  /\s*(?:The Stormlight Archive|The Mistborn (?:Saga|trilogy))\s*(?:The |●)/i,
  /\s*More Cosmere\b/i,
  /\s*Witcher (?:collections|novels|story)\s/i,
  /\s*Hussite Trilogy\b/i,

  // Publisher boilerplate
  /\s*At the Publisher's request/i,

  // "From #1 New York Times bestselling..." at START only
  // (handled separately below)
];

// ── Leading marketing text — removed from the start of descriptions ──

const LEADING_PATTERNS: RegExp[] = [
  // "From #1 New York Times bestselling author X, Title..."
  /^From (?:#1\s+)?(?:New York Times\s+)?(?:bestselling\s+)?(?:author|writer)\s+[\w\s.]+?,\s*/i,
  // "#1 BESTSELLER • NOW A..." badges at the start
  /^(?:#1\s+)?(?:INSTANT\s+)?(?:BESTSELLER|NEW YORK TIMES BESTSELLER)\s*[•·—–]\s*/i,
  // "NOW A [platform] [type] •" at start (handles NOW A NEW FILM STREAMING ON MAX •)
  /^NOW A\s+[\w\s+]+?(?:LIMITED |ORIGINAL )?(?:SERIES|FILM|MOVIE|SHOW|STREAMING)\s+[\w\s+]*?[•·—–]\s*/i,
  // "NEW YORK TIMES BESTSELLER • ONE OF TIME'S..." — remove badge prefix
  /^(?:#1\s+)?NEW YORK TIMES BESTSELL(?:ER|ING)\s*[•·—–]\s*(?:ONE OF\s+)?/i,
  // "The international bestselling author of..."
  /^The (?:international\s+)?bestselling author of [\w\s]+?—[\w\s]+?—\s*/i,
  // "Discover the gloriously inventive..."
  /^Discover the [\w\s]+? (?:fantasy |fiction )?novel from (?:bestselling )?author [\w\s]+?,\s*(?:the [\w\s]+?,\s*)?(?:part of [\w\s]+?\.\s*)?/i,
  // "Andrzej Sapkowski's NYT bestselling series has inspired..." — marketing intro
  /^[\w\s.']+?(?:bestselling|award-winning)\s+[\w\s]+?(?:series|saga)\s+has\s+inspired\s+[\w\s]+?(?:and\s+)?[\w\s]+?\.\s*/i,
];

// ── Inline patterns — remove these from within the text ──

const INLINE_REMOVE_PATTERNS: [RegExp, string][] = [
  // Star symbols
  [/[★☆⭐]+\s*/g, ""],
  // "NEW YORK TIMES BESTSELLER" in caps (inline)
  [/(?:#1\s+)?NEW YORK TIMES BESTSELL(?:ER|ING)\s*[•·\-—]?\s*/g, ""],
  [/(?:#1\s+)?WALL STREET JOURNAL BESTSELL(?:ER|ING)\s*[•·\-—]?\s*/g, ""],
  [/(?:#1\s+)?(?:INSTANT\s+)?BESTSELL(?:ER|ING)\s*[•·\-—]?\s*/g, ""],
  // Marketing bullet badges: "• NOW A PARAMOUNT+ LIMITED SERIES"
  [/\s*[•·]\s*(?:#1\s+)?(?:BESTSELL(?:ER|ING)|NOW\s+A\s+)[^•·]*/g, ""],
  // "ONE OF TIME'S 100 BEST MYSTERY AND THRILLER BOOKS OF ALL TIME •"
  [/ONE OF [\w\s']+(?:BEST|TOP|GREATEST)\s+[\w\s]+(?:OF ALL TIME|EVER)\s*[•·—–]?\s*/gi, ""],
  // Embedded review quotes: "A master storyteller."—Los Angeles Times
  [/\s*[""\u201C][^"""\u201D]{5,}[""\u201D]\s*[-—–]\s*(?:The\s+)?[\w\s.,]+$/g, ""],
  // "One of The Atlantic's Great American Novels..." badge
  [/One of (?:The\s+)?[\w\s']+(?:Great|Best|Top|Most Important)\s+[\w\s]+(?:of the Past|of All Time|Ever Written)[^.]*\.\s*/gi, ""],
  // "This edition includes..." boilerplate
  [/This edition includes [\w\s]+?first published in [^.]+\.\s*/gi, ""],
  // ★-prefixed badge lines (even without newlines)
  [/\s*★\s*[^★]+/g, ""],
  // Quoted review with attribution at end of text
  [/\s*"[^"]{10,}"\s*[-—–]\s*[\w\s]+$/g, ""],
  // Star-stripped badge text: "The New York Times bestselling series Over Fifteen Million..."
  [/The New York Times bestselling series\s*/gi, ""],
  [/Over \w+ Million Copies Sold Worldwide\s*/gi, ""],
  [/World Fantasy Award Winning Author\s*/gi, ""],
  [/David Gemmell Legend Award Winning Author\s*/gi, ""],
  [/Named (?:One of )?(?:the )?(?:Greatest|Best) Book Series[\w\s]*?(?:by\s+\w+)?\s*/gi, ""],
  [/Named by Forbes\s*/gi, ""],
  // Review quotes in single quotes — ONLY match if the opening ' follows a space/start
  // and the closing ' is followed by a space + source name (not an apostrophe like Pratchett's)
  [/(?:^|\.\s+)'[^']{15,}'\s+(?:The\s+)?(?:Times|Guardian|Telegraph|Observer|Mail on Sunday|Express|Standard|Tribune|SFX|Independent|George R\.R\. Martin|Ben Aaronovitch|Fantasy & Science Fiction|Chicago Tribune|Evening Standard|Sunday Telegraph|Cory Doctorow)[^.]*\s*/g, ""],
  [/(?:^|\.\s+)'[^']{15,}'\s+\d+-star\s+reader\s+review\s*/g, ""],
  // "Exceptionally amusing" style quotes with em-dash attribution
  [/\s*"[^"]{5,}"\s*[-—–]\s*[\w\s.]+?\s+(?=[A-Z])/g, ""],
  // "An undisputed master of suspense..." — review sentence (not in quotes)
  [/"An undisputed[^"]*"\s*[-—–]\s*[\w\s]+$/g, ""],
  // "NOW A PARAMOUNT+ LIMITED SERIES •" inline (not just at start)
  [/NOW A\s+[\w\s+]+?(?:LIMITED |ORIGINAL )?(?:SERIES|FILM|MOVIE|SHOW|STREAMING)\s+[\w\s+]*?[•·—–]\s*/gi, ""],
];

// ── Sentence-level patterns — remove sentences matching these ──

const SENTENCE_REMOVE_PATTERNS: RegExp[] = [
  // "'[review quote]' Source"
  /^'[^']{10,}'\s+(?:\d+-star\s+)?(?:reader\s+)?review\b/i,
  // "'[review quote]' [Source Name]"
  /^'[^']{10,}'\s+(?:Novel Notions|Goodreads|Amazon|Fantasy Book|Book Riot)/i,
  // "[It's] elevated..." Goodreads pattern
  /^\[?(?:It's|The|A|This)\]?\s+[\w\s]+(?:Goodreads|Amazon)\s+(?:reviewer|review)/i,
];

/**
 * Clean an item description by removing external reviews, marketing text,
 * author backlists, and promotional content.
 */
export function cleanDescription(text: string, _mediaType?: string): string {
  if (!text || text.length < 10) return text;

  let cleaned = text;

  // 1. Remove leading marketing text
  for (const pat of LEADING_PATTERNS) {
    const match = cleaned.match(pat);
    if (match) {
      cleaned = cleaned.substring(match[0].length);
      break; // Only apply one leading pattern
    }
  }

  // 2. Apply inline removals
  for (const [pat, replacement] of INLINE_REMOVE_PATTERNS) {
    cleaned = cleaned.replace(pat, replacement);
  }

  // 3. Find cutoff point — truncate at the first promotional section
  let cutoffIndex = cleaned.length;
  for (const pat of CUTOFF_PATTERNS) {
    const match = cleaned.match(pat);
    if (match && match.index !== undefined && match.index < cutoffIndex) {
      // Only cut if there's substantial content before the cutoff
      if (match.index > 50) {
        cutoffIndex = match.index;
      }
    }
  }
  cleaned = cleaned.substring(0, cutoffIndex);

  // 4. Remove matching sentences (split by period or newline)
  const sentences = cleaned.split(/(?<=\.)\s+/);
  const filteredSentences: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    let remove = false;
    for (const pat of SENTENCE_REMOVE_PATTERNS) {
      if (pat.test(trimmed)) { remove = true; break; }
    }
    if (!remove) filteredSentences.push(sentence);
  }
  cleaned = filteredSentences.join(" ");

  // 5. Clean up
  cleaned = cleaned
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+|\s+$/g, "")
    .trim();

  // Remove trailing incomplete sentence if we cut mid-text
  if (cutoffIndex < text.length && !cleaned.endsWith(".") && !cleaned.endsWith("!") && !cleaned.endsWith("?") && !cleaned.endsWith('"')) {
    const lastPeriod = cleaned.lastIndexOf(".");
    const lastExcl = cleaned.lastIndexOf("!");
    const lastQ = cleaned.lastIndexOf("?");
    const lastEnd = Math.max(lastPeriod, lastExcl, lastQ);
    if (lastEnd > cleaned.length * 0.5) {
      cleaned = cleaned.substring(0, lastEnd + 1);
    }
  }

  // 6. If nothing meaningful remains, return original (better than empty)
  if (cleaned.length < 20) return text.trim();

  return cleaned;
}
