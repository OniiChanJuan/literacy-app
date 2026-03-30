import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/validation";

/**
 * POST /api/franchises/detect — Real-time franchise detection for a single item.
 * Called automatically when a new item is added to the database.
 *
 * Checks:
 * 1. Title pattern matching against existing franchises
 * 2. Wikidata lookup for series/franchise membership
 * 3. API-specific relationship data
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`franchises-detect:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again in a moment." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  try {
    const { itemId } = await req.json();
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, title: true, type: true, year: true, people: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // Check if already in a franchise
    const existing = await prisma.franchiseItem.findFirst({ where: { itemId } });
    if (existing) return NextResponse.json({ franchiseId: existing.franchiseId, alreadyLinked: true });

    // 0. Warhammer-specific detection (runs before generic title matching)
    //    Catches titles that don't start with "Warhammer" but are part of the IP.
    const wh40kFranchiseId = 578; // Warhammer 40,000
    const whFantasyFranchiseId = 594; // Warhammer Fantasy / The Old World
    const titleLower = item.title.toLowerCase();
    const publisher = Array.isArray(item.people)
      ? (item.people as any[]).find((p: any) => p.role === "Publisher")?.name?.toLowerCase() || ""
      : "";
    const isBlackLibrary = publisher.includes("black library") || publisher.includes("games workshop");

    const wh40kPatterns = [
      "warhammer 40", "dawn of war", "darktide", "space marine",
      "mechanicus", "boltgun", "necromunda", "battlefleet gothic",
      "warhammer: inquisitor", "rogue trader", "chaos gate",
      "gladius - relics", "battlesector", "deathwatch", "space hulk",
      "eternal crusade", "fire warrior", "kill team", "rites of war",
      "space wolf", "space hulk", "horus heresy", "eisenhorn",
      "gaunt's ghosts", "ciaphas cain", "siege of terra", "primarchs",
    ];
    const whFantasyPatterns = [
      "total war: warhammer", "vermintide", "blood bowl",
      "mordheim", "warhammer: mark of chaos", "shadow of the horned rat",
      "warhammer: dark omen", "age of sigmar", "warhammer underworlds",
      "gotrek", "warcry", "warhammer fantasy",
    ];

    const is40K = wh40kPatterns.some((p) => titleLower.includes(p)) ||
      (isBlackLibrary && ["space marine", "chaos space", "imperium", "astartes",
        "adeptus", "necron", "eldar", "tyranid", "ork", "horus", "primarch",
        "warp", "inquisitor", "40,000", "40k"].some((kw) => titleLower.includes(kw)));
    const isFantasy = !is40K && (
      whFantasyPatterns.some((p) => titleLower.includes(p)) ||
      (isBlackLibrary && ["gotrek", "skaven", "sigmar", "old world",
        "lizardmen", "bretonnian", "chaos warrior", "trollslayer", "daemonslayer"].some(
        (kw) => titleLower.includes(kw)
      ))
    );

    if (is40K || isFantasy) {
      const targetFranchiseId = is40K ? wh40kFranchiseId : whFantasyFranchiseId;
      // Verify the franchise exists before linking
      const franchise = await prisma.franchise.findUnique({ where: { id: targetFranchiseId }, select: { id: true, name: true } });
      if (franchise) {
        await prisma.franchiseItem.create({
          data: { franchiseId: franchise.id, itemId, addedBy: "realtime_warhammer" },
        });
        return NextResponse.json({ franchiseId: franchise.id, matched: "warhammer_pattern", franchiseName: franchise.name });
      }
    }

    // 1. Title pattern matching against existing franchises
    const baseName = item.title.toLowerCase()
      .replace(/\s*[:–—]\s.*$/, "")
      .replace(/\s*\(.*?\)\s*/g, "")
      .replace(/\s+season\s*\d+.*$/i, "")
      .replace(/\s+part\s*\d+.*$/i, "")
      .replace(/\s+(i{1,4}|iv|v|vi{0,3}|ix|x{0,3})$/i, "")
      .replace(/\s+\d+$/, "")
      .replace(/\s*-\s*(game of the year|goty|complete|remastered|ultimate|premium|deluxe|special|enhanced|director'?s?\s*cut|anniversary).*$/i, "")
      .trim();

    if (baseName.length >= 3) {
      // Find franchises whose name matches the base title
      const franchises = await prisma.franchise.findMany({
        where: {
          name: { contains: baseName, mode: "insensitive" },
        },
        select: { id: true, name: true },
      });

      if (franchises.length > 0) {
        // Add to the first matching franchise
        const franchise = franchises[0];
        await prisma.franchiseItem.create({
          data: { franchiseId: franchise.id, itemId, addedBy: "realtime_title" },
        });
        return NextResponse.json({ franchiseId: franchise.id, matched: "title_pattern", franchiseName: franchise.name });
      }

      // Also check if other items with similar base names exist
      const similarItems = await prisma.item.findMany({
        where: {
          id: { not: itemId },
          title: { contains: baseName, mode: "insensitive" },
        },
        select: { id: true, title: true },
        take: 10,
      });

      if (similarItems.length >= 1) {
        // Check if any similar item is already in a franchise
        for (const si of similarItems) {
          const siLink = await prisma.franchiseItem.findFirst({ where: { itemId: si.id } });
          if (siLink) {
            // Add to the same franchise
            await prisma.franchiseItem.create({
              data: { franchiseId: siLink.franchiseId, itemId, addedBy: "realtime_title" },
            });
            const franchise = await prisma.franchise.findUnique({ where: { id: siLink.franchiseId }, select: { name: true } });
            return NextResponse.json({ franchiseId: siLink.franchiseId, matched: "existing_franchise", franchiseName: franchise?.name });
          }
        }
      }
    }

    // 2. Wikidata lookup (optional — can be slow)
    try {
      const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(item.title)}&language=en&type=item&limit=3&format=json`;
      const searchData = await fetch(searchUrl).then(r => r.json());
      const wdMatch = (searchData.search || []).find((r: any) =>
        r.label?.toLowerCase() === item.title.toLowerCase()
      );

      if (wdMatch) {
        const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wdMatch.id}&props=claims&format=json`;
        const entityData = await fetch(entityUrl).then(r => r.json());
        const claims = entityData.entities?.[wdMatch.id]?.claims;

        if (claims) {
          // Check P179 (part of series)
          for (const claim of claims.P179 || []) {
            const seriesId = claim.mainsnak?.datavalue?.value?.id;
            if (seriesId) {
              // Find franchise by wikidata ID
              const franchise = await prisma.franchise.findFirst({ where: { wikidataId: seriesId } });
              if (franchise) {
                await prisma.franchiseItem.create({
                  data: { franchiseId: franchise.id, itemId, addedBy: "realtime_wikidata" },
                });
                return NextResponse.json({ franchiseId: franchise.id, matched: "wikidata_series", franchiseName: franchise.name });
              }
            }
          }
        }

        // Save Wikidata ID
        await prisma.item.update({ where: { id: itemId }, data: { wikidataId: wdMatch.id } }).catch(() => {});
      }
    } catch {
      // Wikidata lookup is optional — don't fail if it errors
    }

    return NextResponse.json({ matched: null, message: "No franchise match found" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
