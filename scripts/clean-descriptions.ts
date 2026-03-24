/**
 * Clean all item descriptions in the database.
 * Run with: npx tsx scripts/clean-descriptions.ts
 *
 * Uses the same logic as src/lib/clean-description.ts but runs
 * directly against the database.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as path from "path";

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

// We can't import from src/ in scripts, so we duplicate the logic.
// Keep in sync with src/lib/clean-description.ts

const CUTOFF_PATTERNS: RegExp[] = [
  /\s*Praise for (?:the )?\w/i,
  /\s*Readers love\b/i,
  /\s*What (?:readers|critics|people) are saying/i,
  /\s*Reviews:/i,
  /\s*Critical acclaim/i,
  /\s*Other (?:Tor )?books by\b/i,
  /\s*Other (?:works|novels|titles) by\b/i,
  /\s*Also by\b/i,
  /\s*More from\b/i,
  /\s*Don't miss (?:the |any |these |his |her |their |[\w\s]+(?:'s |by ))/i,
  /\s*Coming soon from\b/i,
  /\s*Books by\b/i,
  /\s*From the author of\b/i,
  /\s*(?:The Stormlight Archive|The Mistborn (?:Saga|trilogy))\s*(?:The |●)/i,
  /\s*More Cosmere\b/i,
  /\s*Witcher (?:collections|novels|story)\s/i,
  /\s*Hussite Trilogy\b/i,
  /\s*At the Publisher's request/i,
];

const LEADING_PATTERNS: RegExp[] = [
  /^From (?:#1\s+)?(?:New York Times\s+)?(?:bestselling\s+)?(?:author|writer)\s+[\w\s.]+?,\s*/i,
  /^(?:#1\s+)?(?:INSTANT\s+)?(?:BESTSELLER|NEW YORK TIMES BESTSELLER)\s*[•·—–]\s*/i,
  /^NOW A\s+[\w\s+]+?(?:LIMITED |ORIGINAL )?(?:SERIES|FILM|MOVIE|SHOW|STREAMING)\s+[\w\s+]*?[•·—–]\s*/i,
  /^(?:#1\s+)?NEW YORK TIMES BESTSELL(?:ER|ING)\s*[•·—–]\s*(?:ONE OF\s+)?/i,
  /^The (?:international\s+)?bestselling author of [\w\s]+?—[\w\s]+?—\s*/i,
  /^Discover the [\w\s]+? (?:fantasy |fiction )?novel from (?:bestselling )?author [\w\s]+?,\s*(?:the [\w\s]+?,\s*)?(?:part of [\w\s]+?\.\s*)?/i,
  /^[\w\s.']+?(?:bestselling|award-winning)\s+[\w\s]+?(?:series|saga)\s+has\s+inspired\s+[\w\s]+?(?:and\s+)?[\w\s]+?\.\s*/i,
];

const INLINE_REMOVE_PATTERNS: [RegExp, string][] = [
  [/[★☆⭐]+\s*/g, ""],
  [/(?:#1\s+)?NEW YORK TIMES BESTSELL(?:ER|ING)\s*[•·\-—]?\s*/g, ""],
  [/(?:#1\s+)?WALL STREET JOURNAL BESTSELL(?:ER|ING)\s*[•·\-—]?\s*/g, ""],
  [/(?:#1\s+)?(?:INSTANT\s+)?BESTSELL(?:ER|ING)\s*[•·\-—]?\s*/g, ""],
  [/\s*[•·]\s*(?:#1\s+)?(?:BESTSELL(?:ER|ING)|NOW\s+A\s+)[^•·]*/g, ""],
  [/ONE OF [\w\s']+(?:BEST|TOP|GREATEST)\s+[\w\s]+(?:OF ALL TIME|EVER)\s*[•·—–]?\s*/gi, ""],
  [/\s*[""\u201C][^"""\u201D]{5,}[""\u201D]\s*[-—–]\s*(?:The\s+)?[\w\s.,]+$/g, ""],
  [/One of (?:The\s+)?[\w\s']+(?:Great|Best|Top|Most Important)\s+[\w\s]+(?:of the Past|of All Time|Ever Written)[^.]*\.\s*/gi, ""],
  [/This edition includes [\w\s]+?first published in [^.]+\.\s*/gi, ""],
  [/\s*★\s*[^★]+/g, ""],
  [/\s*"[^"]{10,}"\s*[-—–]\s*[\w\s]+$/g, ""],
  [/The New York Times bestselling series\s*/gi, ""],
  [/Over \w+ Million Copies Sold Worldwide\s*/gi, ""],
  [/World Fantasy Award Winning Author\s*/gi, ""],
  [/David Gemmell Legend Award Winning Author\s*/gi, ""],
  [/Named (?:One of )?(?:the )?(?:Greatest|Best) Book Series[\w\s]*?(?:by\s+\w+)?\s*/gi, ""],
  [/Named by Forbes\s*/gi, ""],
  [/'[^']{10,}'\s+(?:The\s+)?(?:Times|Guardian|Telegraph|Observer|Mail|Express|Standard|Tribune|SFX|Independent)\s*/g, ""],
  [/'[^']{10,}'\s+\d+-star\s+reader\s+review\s*/g, ""],
  [/\s*"[^"]{5,}"\s*[-—–]\s*[\w\s.]+?\s+(?=\w)/g, ""],
  [/NOW A\s+[\w\s+]+?(?:LIMITED |ORIGINAL )?(?:SERIES|FILM|MOVIE|SHOW|STREAMING)\s+[\w\s+]*?[•·—–]\s*/gi, ""],
];

const SENTENCE_REMOVE_PATTERNS: RegExp[] = [
  /^'[^']{10,}'\s+(?:\d+-star\s+)?(?:reader\s+)?review\b/i,
  /^'[^']{10,}'\s+(?:Novel Notions|Goodreads|Amazon|Fantasy Book|Book Riot)/i,
  /^\[?(?:It's|The|A|This)\]?\s+[\w\s]+(?:Goodreads|Amazon)\s+(?:reviewer|review)/i,
];

function cleanDescription(text: string): string {
  if (!text || text.length < 10) return text;
  let cleaned = text;

  for (const pat of LEADING_PATTERNS) {
    const match = cleaned.match(pat);
    if (match) { cleaned = cleaned.substring(match[0].length); break; }
  }

  for (const [pat, replacement] of INLINE_REMOVE_PATTERNS) {
    cleaned = cleaned.replace(pat, replacement);
  }

  let cutoffIndex = cleaned.length;
  for (const pat of CUTOFF_PATTERNS) {
    const match = cleaned.match(pat);
    if (match && match.index !== undefined && match.index < cutoffIndex) {
      if (match.index > 50) cutoffIndex = match.index;
    }
  }
  cleaned = cleaned.substring(0, cutoffIndex);

  const sentences = cleaned.split(/(?<=\.)\s+/);
  const filtered: string[] = [];
  for (const s of sentences) {
    const t = s.trim();
    if (!t) continue;
    let remove = false;
    for (const pat of SENTENCE_REMOVE_PATTERNS) {
      if (pat.test(t)) { remove = true; break; }
    }
    if (!remove) filtered.push(s);
  }
  cleaned = filtered.join(" ");

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").replace(/\s{2,}/g, " ").trim();

  if (cutoffIndex < text.length && !cleaned.endsWith(".") && !cleaned.endsWith("!") && !cleaned.endsWith("?") && !cleaned.endsWith('"')) {
    const lastEnd = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf("!"), cleaned.lastIndexOf("?"));
    if (lastEnd > cleaned.length * 0.5) cleaned = cleaned.substring(0, lastEnd + 1);
  }

  if (cleaned.length < 20) return text.trim();
  return cleaned;
}

async function main() {
  console.log("🧹 Cleaning item descriptions (pass 2)\n");

  const items = await prisma.item.findMany({
    where: { description: { not: "" } },
    select: { id: true, title: true, type: true, description: true },
  });

  console.log(`Total items: ${items.length}`);

  let cleanedCount = 0;
  let significantCount = 0;

  for (const item of items) {
    const original = item.description;
    const clean = cleanDescription(original);

    if (clean !== original) {
      await prisma.item.update({
        where: { id: item.id },
        data: { description: clean },
      });
      cleanedCount++;

      const savings = original.length - clean.length;
      if (savings > 30) {
        significantCount++;
        if (significantCount <= 30) {
          console.log(`  "${item.title}": ${original.length} → ${clean.length} (-${savings})`);
        }
      }
    }
  }

  console.log(`\nCleaned: ${cleanedCount}`);
  console.log(`Significantly shortened: ${significantCount}`);

  // Verify
  const verify = await prisma.item.findMany({
    where: { id: { in: [2008, 2007, 1998, 2107, 2032, 2034, 2059, 2076] } },
    select: { id: true, title: true, description: true },
  });
  console.log("\n── Verification ──");
  for (const v of verify) {
    console.log(`\n  [${v.id}] "${v.title}" (${v.description.length} chars)`);
    console.log(`  ${v.description.substring(0, 250)}${v.description.length > 250 ? "..." : ""}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
