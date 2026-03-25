import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TAG_MAP, tagAppliesTo } from "@/lib/tags";

/**
 * GET /api/tags?search=cyb — Search tags for suggestion dropdown
 * POST /api/tags — Submit a tag suggestion { itemId, tagSlug }
 */
export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") || "";
  const itemType = req.nextUrl.searchParams.get("type") || "";

  const results: { slug: string; displayName: string; category: string }[] = [];

  for (const [slug, def] of TAG_MAP) {
    if (itemType && !tagAppliesTo(slug, itemType)) continue;
    if (search && !def.displayName.toLowerCase().includes(search.toLowerCase()) && !slug.includes(search.toLowerCase())) continue;
    results.push({ slug, displayName: def.displayName, category: def.category });
    if (results.length >= 30) break;
  }

  return NextResponse.json({ tags: results });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { itemId, tagSlug } = body;

  if (!itemId || !tagSlug) {
    return NextResponse.json({ error: "itemId and tagSlug required" }, { status: 400 });
  }

  // Validate tag exists
  if (!TAG_MAP.has(tagSlug)) {
    return NextResponse.json({ error: "Unknown tag" }, { status: 400 });
  }

  // Validate item exists and tag applies to its type
  const item = await prisma.item.findUnique({ where: { id: Number(itemId) }, select: { type: true } });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (!tagAppliesTo(tagSlug, item.type)) {
    return NextResponse.json({ error: "Tag does not apply to this media type" }, { status: 400 });
  }

  // Upsert suggestion
  await prisma.userTagSuggestion.upsert({
    where: {
      userId_itemId_tagSlug: {
        userId: session.user.id,
        itemId: Number(itemId),
        tagSlug,
      },
    },
    update: {},
    create: {
      userId: session.user.id,
      itemId: Number(itemId),
      tagSlug,
    },
  });

  // Check if this tag has enough suggestions to auto-assign
  const count = await prisma.userTagSuggestion.count({
    where: { itemId: Number(itemId), tagSlug },
  });

  // Auto-assign at 3+ suggestions
  if (count >= 3) {
    const weight = count >= 10 ? 0.85 : count >= 5 ? 0.75 : 0.6;
    const category = TAG_MAP.get(tagSlug)?.category || "theme";

    // Read current tags and merge
    const currentItem = await prisma.item.findUnique({
      where: { id: Number(itemId) },
      select: { itemTags: true },
    });
    const currentTags = (currentItem?.itemTags as Record<string, any>) || {};

    // Only update if community weight would be higher
    if (!currentTags[tagSlug] || currentTags[tagSlug].weight < weight) {
      currentTags[tagSlug] = { weight, category };
      await prisma.item.update({
        where: { id: Number(itemId) },
        data: { itemTags: currentTags },
      });
    }
  }

  return NextResponse.json({ success: true, suggestionCount: count });
}
