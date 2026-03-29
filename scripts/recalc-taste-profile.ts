/**
 * Recalculate a user's taste profile from scratch using only rated items
 * that have MEANINGFUL dimensions (any value deviates > 0.05 from neutral 0.5).
 *
 * Items with all-default 0.5 dimensions are skipped since they carry no taste signal.
 * For items with no stored meaningful dimensions, we also try recalculating from
 * the item's genres, vibes, and description using calculateItemDimensions().
 *
 * Run: npx tsx scripts/recalc-taste-profile.ts
 * Options:
 *   --dry-run    Show the new profile without writing it
 *   --user=EMAIL  Target a specific user (default: first user with ratings)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  neutralDimensions,
  updateTasteProfile,
  calculateItemDimensions,
  type TasteDimensions,
  DIMENSION_KEYS,
} from "../src/lib/taste-dimensions";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const userArg = args.find((a) => a.startsWith("--user="))?.split("=")[1];

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: connUrl });
const prisma = new PrismaClient({ adapter });

function hasMeaningfulDimensions(dims: Record<string, number>): boolean {
  return Object.values(dims).some((v) => Math.abs(v - 0.5) > 0.05);
}

async function main() {
  console.log(`🧠 Taste profile recalculation${DRY_RUN ? " (DRY RUN)" : ""}...\n`);

  // Find target user
  const userWhere = userArg
    ? { email: userArg }
    : undefined;

  const users = userArg
    ? await prisma.user.findMany({ where: { email: userArg }, select: { id: true, name: true, email: true, tasteProfile: true } })
    : await prisma.user.findMany({ select: { id: true, name: true, email: true, tasteProfile: true } });

  if (users.length === 0) {
    console.log("No users found.");
    return;
  }

  for (const user of users) {
    // Get all ratings with item data, ordered by rating date
    const ratings = await prisma.rating.findMany({
      where: { userId: user.id },
      select: {
        score: true,
        createdAt: true,
        item: {
          select: {
            id: true,
            title: true,
            type: true,
            genre: true,
            vibes: true,
            description: true,
            totalEp: true,
            voteCount: true,
            itemDimensions: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (ratings.length < 3) {
      console.log(`Skipping ${user.name} — only ${ratings.length} ratings`);
      continue;
    }

    console.log(`\nUser: ${user.name} (${ratings.length} ratings)`);
    console.log("Old profile:", JSON.stringify(user.tasteProfile));

    let profile = neutralDimensions();
    let usedCount = 0;
    let skippedCount = 0;

    for (const r of ratings) {
      const item = r.item;
      const storedDims = item.itemDimensions as Record<string, number> | null;

      // Determine the best available dimensions for this item
      let dims: TasteDimensions | null = null;

      if (storedDims && hasMeaningfulDimensions(storedDims)) {
        dims = storedDims as TasteDimensions;
      } else {
        // Recalculate from genres/vibes/description
        const freshDims = calculateItemDimensions(
          (item.genre as string[]) || [],
          (item.vibes as string[]) || [],
          item.description || "",
          item.totalEp || 0,
          item.voteCount || 0,
        );
        if (hasMeaningfulDimensions(freshDims as unknown as Record<string, number>)) {
          dims = freshDims;
          console.log(`  [recalc dims] ${item.title}`);
        }
      }

      if (!dims) {
        console.log(`  [skipped - no signal] ${item.title}`);
        skippedCount++;
        continue;
      }

      const ratingAgeDays = Math.floor(
        (Date.now() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      profile = updateTasteProfile(profile, dims, r.score, ratingAgeDays);
      console.log(`  [${r.score}★] ${item.type} ${item.title}`);
      usedCount++;
    }

    console.log(`\nUsed ${usedCount} ratings, skipped ${skippedCount} (no taste signal)`);
    console.log("New profile:");
    for (const key of DIMENSION_KEYS) {
      const old = (user.tasteProfile as any)?.[key] ?? 0.5;
      const delta = profile[key] - old;
      const arrow = delta > 0.01 ? "▲" : delta < -0.01 ? "▼" : "─";
      console.log(`  ${arrow} ${key}: ${old.toFixed(3)} → ${profile[key].toFixed(3)} (Δ${delta >= 0 ? "+" : ""}${delta.toFixed(3)})`);
    }

    if (!DRY_RUN) {
      await prisma.user.update({
        where: { id: user.id },
        data: { tasteProfile: profile as any },
      });
      console.log(`✓ Saved.`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
