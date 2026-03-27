/**
 * Full taste profile recalculation from all of a user's ratings.
 *
 * Unlike the incremental update in POST /api/ratings (which shifts the profile
 * by one rating at a time), this rebuilds the entire taste vector from scratch
 * using all of the user's ratings in chronological order.
 *
 * Used after bulk imports so the profile reflects the full imported history.
 */
import { prisma } from "@/lib/prisma";
import { updateTasteProfile, neutralDimensions, type TasteDimensions } from "@/lib/taste-dimensions";

export async function recalculateTasteProfile(userId: string): Promise<void> {
  // Fetch all ratings ordered oldest-first so recent ratings take the final "shape"
  const ratings = await prisma.rating.findMany({
    where: { userId },
    include: {
      item: { select: { itemDimensions: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (ratings.length === 0) return;

  let profile: TasteDimensions = neutralDimensions();
  const now = Date.now();

  for (const rating of ratings) {
    if (!rating.item.itemDimensions) continue;
    const ratingAgeDays = Math.floor(
      (now - rating.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    profile = updateTasteProfile(
      profile,
      rating.item.itemDimensions as unknown as TasteDimensions,
      rating.score,
      ratingAgeDays,
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { tasteProfile: profile as any },
  });
}
