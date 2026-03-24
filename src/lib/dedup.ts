/**
 * Duplicate detection utility — checks if an item already exists before inserting.
 */

const BOOK_NOISE = [
  /\s*:\s+(?:the\s+)?(?:first|second|third|fourth|fifth|new|next|final|bestselling|worldwide|epic|thrilling|sensational|extraordinary|critically|stunning|brilliant|award|beloved|international|unforgettable|captivating|classic|definitive|landmark|groundbreaking|complete|incredible|remarkable|ultimate)\s.{20,}$/i,
  /\s*\((?:book|volume|vol\.?|#|part|series|the\s|a\s|an\s|no\.?\s)\s*\d*[^)]*\)/gi,
  /\s*\([^)]*(?:chronicles?|saga|trilogy|quartet|series|cycle|archive|sequence)\s*(?:#\d+|,?\s*(?:book|volume|vol\.?)\s*\d+)?[^)]*\)/gi,
  /\s*:\s*(?:a\s+)?(?:novel|memoir|thriller|romance|mystery|novella|short\s+story|epic\s+fantasy|graphic\s+novel)$/i,
  /\s*[\(\[]?(?:now\s+a\s+(?:major\s+)?(?:motion\s+picture|hit\s+tv|netflix|hbo|amazon|disney|hulu))[^\)\]]*[\)\]]?/gi,
  /\s*[\(\[]?(?:media|movie|film|tv)\s*tie[^)\]]*[\)\]]?/gi,
  /\s*[\(\[]?(?:mass\s+market|trade)\s*(?:paperback|paper\s+back)[\)\]]?/gi,
  /\s*[\(\[]?(?:hardcover|illustrated|annotated|collector'?s|anniversary|revised|international|expanded|enhanced|special|deluxe|limited)\s*edition[\)\]]?/gi,
];

const MUSIC_NOISE = [
  /\s*[\(\[]?(?:deluxe|super\s+deluxe|expanded|platinum|gold|special|collector'?s|anniversary|limited|bonus\s+track|japanese)\s*(?:edition|version)?[\)\]]?$/i,
  /\s*[\(\[]?(?:remastered|remaster|remixed)[\)\]]?$/i,
  /\s*[\(\[]?(?:explicit|clean)[\)\]]?$/i,
];

const GAME_NOISE = [
  /\s+-\s+(?:Game\s+of\s+the\s+Year|GOTY|Definitive|Complete|Ultimate|Legendary|Premium|Gold|Deluxe|Enhanced|Special|Collector'?s|Anniversary|Standard)\s*(?:Edition)?$/i,
  /\s*:\s+(?:Game\s+of\s+the\s+Year|GOTY|Definitive|Complete|Ultimate|Legendary|Premium|Gold|Deluxe|Enhanced|Special|Collector'?s|Anniversary)\s*(?:Edition)?$/i,
  /\s+-\s+(?:Remastered|HD\s+Remaster|Remake|Director'?s\s+Cut|Final\s+Cut)$/i,
  /\s*:\s+(?:Director'?s\s+Cut|Final\s+Cut)$/i,
  /\s+(?:Remastered|Remake|Anniversary)$/i,
  /\s*\((?:Game\s+of\s+the\s+Year|GOTY|Definitive|Complete|Ultimate|Legendary|Deluxe|Enhanced|Special|Collector'?s|Remastered|Remake)\s*(?:Edition)?\)$/i,
];

export function normalizeTitle(title: string, type: string): string {
  let t = title.trim();
  const patterns = type === "book" ? BOOK_NOISE
    : type === "music" ? MUSIC_NOISE
    : type === "game" ? GAME_NOISE
    : [];

  for (const pat of patterns) {
    t = t.replace(pat, "");
  }
  return t.trim().replace(/\s+/g, " ");
}

export function getCreatorName(people: any): string {
  if (!Array.isArray(people)) return "";
  const creator = (people as { name: string; role: string }[]).find((p) =>
    /author|writer|creator|artist|band|performer|developer|director/i.test(p.role)
  );
  return (creator?.name || "").toLowerCase().trim();
}

/**
 * Check if an item likely already exists in the database.
 * Returns the existing item ID if found, null if not.
 */
export async function findExistingItem(
  prisma: any,
  title: string,
  type: string,
  year: number,
  people?: any,
): Promise<number | null> {
  const norm = normalizeTitle(title, type).toLowerCase();
  const creator = getCreatorName(people);

  // Exact title match (case insensitive)
  const exact = await prisma.item.findFirst({
    where: {
      type,
      parentItemId: null,
      title: { equals: title, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (exact) return exact.id;

  // Normalized title match
  const candidates = await prisma.item.findMany({
    where: {
      type,
      parentItemId: null,
      title: { contains: norm.split(" ")[0], mode: "insensitive" },
    },
    select: { id: true, title: true, people: true },
    take: 20,
  });

  for (const c of candidates) {
    const cNorm = normalizeTitle(c.title, type).toLowerCase();
    if (cNorm === norm) {
      // If we have creator info, verify it matches
      if (creator) {
        const cCreator = getCreatorName(c.people);
        if (cCreator && cCreator === creator) return c.id;
        if (!cCreator) return c.id; // No creator on existing — assume match
      }
      return c.id;
    }
  }

  return null;
}

// ── Franchise detection for new items ────────────────────────────────────

/**
 * After a new item is created, check if it should be linked to an existing franchise.
 * Checks: 1) Same author already in a franchise, 2) Title matches franchise name
 */
export async function detectFranchiseForItem(
  prisma: any,
  itemId: number,
  title: string,
  type: string,
  people?: any,
): Promise<number | null> {
  const creator = getCreatorName(people);

  // 1. Check if the same author/creator has other items in a franchise
  if (creator && (type === "book" || type === "manga" || type === "comic")) {
    const sameAuthorItems = await prisma.item.findMany({
      where: {
        type,
        parentItemId: null,
        id: { not: itemId },
      },
      select: { id: true, people: true },
      take: 100,
    });

    for (const other of sameAuthorItems) {
      const otherCreator = getCreatorName(other.people);
      if (otherCreator === creator) {
        // Check if this other item is in a franchise
        const franchiseLink = await prisma.franchiseItem.findFirst({
          where: { itemId: other.id },
          select: { franchiseId: true },
        });
        if (franchiseLink) {
          return franchiseLink.franchiseId;
        }
      }
    }
  }

  // 2. Check if the title contains a franchise name
  const franchises = await prisma.franchise.findMany({
    where: { parentFranchiseId: null },
    select: { id: true, name: true },
  });

  const titleLower = title.toLowerCase();
  for (const f of franchises) {
    const fNameLower = f.name.toLowerCase();
    // Franchise name must be a significant part of the title
    if (fNameLower.length >= 4 && titleLower.includes(fNameLower)) {
      return f.id;
    }
  }

  return null;
}
