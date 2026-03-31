export interface AwardMeta {
  label: string;
  icon: string;
  color: string;
  /**
   * Media types this award can legitimately belong to.
   * Used to catch mismatches when assigning awards to items.
   * undefined = award spans multiple types (e.g. hugo covers books, comics, tv, film)
   */
  allowedTypes?: string[];
}

export const AWARDS: Record<string, AwardMeta> = {
  oscar:    { label: "Academy Award",     icon: "🏆", color: "#D4AF37", allowedTypes: ["movie"] },
  emmy:     { label: "Emmy Award",        icon: "📺", color: "#C45BAA", allowedTypes: ["tv"] },
  grammy:   { label: "Grammy Award",      icon: "🎵", color: "#E84855", allowedTypes: ["music"] },
  bafta:    { label: "BAFTA",             icon: "🎭", color: "#9B5DE5", allowedTypes: ["movie", "tv", "game"] },
  hugo:     { label: "Hugo Award",        icon: "🚀", color: "#3185FC" }, // spans book, comic, manga, tv, movie
  nebula:   { label: "Nebula Award",      icon: "✨", color: "#00BBF9", allowedTypes: ["book", "comic", "manga"] },
  pulitzer: { label: "Pulitzer Prize",    icon: "📰", color: "#D4AF37", allowedTypes: ["book", "comic", "music"] },
  palme:    { label: "Palme d'Or",        icon: "🌴", color: "#2EC4B6", allowedTypes: ["movie"] },
  peabody:  { label: "Peabody Award",     icon: "🏅", color: "#F9A620", allowedTypes: ["tv", "podcast"] },
  goty:     { label: "Game of the Year",  icon: "🎮", color: "#2EC4B6", allowedTypes: ["game"] },
  tga:      { label: "The Game Awards",   icon: "🏆", color: "#E84855", allowedTypes: ["game"] },
  eisner:   { label: "Eisner Award",      icon: "💥", color: "#F9A620", allowedTypes: ["comic", "manga"] },
  harvey:   { label: "Harvey Award",      icon: "📖", color: "#FF6B6B", allowedTypes: ["comic", "manga"] },
};

/**
 * Returns true if the award is valid for the given media type.
 * Use this before assigning awards to items to catch mistakes like
 * attaching an Emmy to a game or a GOTY to a TV show.
 */
export function awardAllowedForType(awardKey: string, mediaType: string): boolean {
  const award = AWARDS[awardKey];
  if (!award) return false;
  if (!award.allowedTypes) return true; // no restriction (e.g. hugo)
  return award.allowedTypes.includes(mediaType);
}
