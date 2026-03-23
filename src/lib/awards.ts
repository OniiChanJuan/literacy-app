export interface AwardMeta {
  label: string;
  icon: string;
  color: string;
}

export const AWARDS: Record<string, AwardMeta> = {
  oscar:    { label: "Academy Award",     icon: "🏆", color: "#D4AF37" },
  emmy:     { label: "Emmy Award",        icon: "📺", color: "#C45BAA" },
  grammy:   { label: "Grammy Award",      icon: "🎵", color: "#E84855" },
  bafta:    { label: "BAFTA",             icon: "🎭", color: "#9B5DE5" },
  hugo:     { label: "Hugo Award",        icon: "🚀", color: "#3185FC" },
  nebula:   { label: "Nebula Award",      icon: "✨", color: "#00BBF9" },
  pulitzer: { label: "Pulitzer Prize",    icon: "📰", color: "#D4AF37" },
  palme:    { label: "Palme d'Or",        icon: "🌴", color: "#2EC4B6" },
  peabody:  { label: "Peabody Award",     icon: "🏅", color: "#F9A620" },
  goty:     { label: "Game of the Year",  icon: "🎮", color: "#2EC4B6" },
  tga:      { label: "The Game Awards",   icon: "🏆", color: "#E84855" },
  eisner:   { label: "Eisner Award",      icon: "💥", color: "#F9A620" },
  harvey:   { label: "Harvey Award",      icon: "📖", color: "#FF6B6B" },
};
