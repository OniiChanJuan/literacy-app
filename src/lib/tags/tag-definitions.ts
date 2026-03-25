/**
 * Complete tag definitions for the weighted tag system.
 * Each tag has: slug, displayName, category, appliesTo (empty = universal).
 */

export interface TagDef {
  slug: string;
  displayName: string;
  category: string;
  appliesTo: string[]; // empty = all types
}

// Media type constants for appliesTo
const MUSIC = ["music"];
const GAME = ["game"];
const ANIME_MANGA = ["manga"];
const TV = ["tv"];
const BOOK = ["book"];
const PODCAST = ["podcast"];
const COMIC = ["comic"];
const ALL: string[] = [];

export const TAG_DEFINITIONS: TagDef[] = [
  // ══════════════════════════════════════════════════════════════
  // UNIVERSAL TAGS — Themes
  // ══════════════════════════════════════════════════════════════
  { slug: "identity", displayName: "Identity", category: "theme", appliesTo: ALL },
  { slug: "redemption", displayName: "Redemption", category: "theme", appliesTo: ALL },
  { slug: "revenge", displayName: "Revenge", category: "theme", appliesTo: ALL },
  { slug: "survival", displayName: "Survival", category: "theme", appliesTo: ALL },
  { slug: "coming-of-age", displayName: "Coming of Age", category: "theme", appliesTo: ALL },
  { slug: "corruption", displayName: "Corruption", category: "theme", appliesTo: ALL },
  { slug: "grief", displayName: "Grief", category: "theme", appliesTo: ALL },
  { slug: "forbidden-love", displayName: "Forbidden Love", category: "theme", appliesTo: ALL },
  { slug: "betrayal", displayName: "Betrayal", category: "theme", appliesTo: ALL },
  { slug: "war", displayName: "War", category: "theme", appliesTo: ALL },
  { slug: "class-struggle", displayName: "Class Struggle", category: "theme", appliesTo: ALL },
  { slug: "existentialism", displayName: "Existentialism", category: "theme", appliesTo: ALL },
  { slug: "isolation", displayName: "Isolation", category: "theme", appliesTo: ALL },
  { slug: "family", displayName: "Family", category: "theme", appliesTo: ALL },
  { slug: "power", displayName: "Power", category: "theme", appliesTo: ALL },
  { slug: "freedom", displayName: "Freedom", category: "theme", appliesTo: ALL },
  { slug: "sacrifice", displayName: "Sacrifice", category: "theme", appliesTo: ALL },
  { slug: "obsession", displayName: "Obsession", category: "theme", appliesTo: ALL },
  { slug: "fate-vs-choice", displayName: "Fate vs Choice", category: "theme", appliesTo: ALL },
  { slug: "tech-vs-humanity", displayName: "Tech vs Humanity", category: "theme", appliesTo: ALL },
  { slug: "memory", displayName: "Memory", category: "theme", appliesTo: ALL },
  { slug: "mortality", displayName: "Mortality", category: "theme", appliesTo: ALL },
  { slug: "rebellion", displayName: "Rebellion", category: "theme", appliesTo: ALL },
  { slug: "found-family", displayName: "Found Family", category: "theme", appliesTo: ALL },
  { slug: "colonialism", displayName: "Colonialism", category: "theme", appliesTo: ALL },
  { slug: "justice", displayName: "Justice", category: "theme", appliesTo: ALL },
  { slug: "trauma", displayName: "Trauma", category: "theme", appliesTo: ALL },
  { slug: "deception", displayName: "Deception", category: "theme", appliesTo: ALL },
  { slug: "ambition", displayName: "Ambition", category: "theme", appliesTo: ALL },
  { slug: "jealousy", displayName: "Jealousy", category: "theme", appliesTo: ALL },
  { slug: "faith", displayName: "Faith", category: "theme", appliesTo: ALL },
  { slug: "addiction", displayName: "Addiction", category: "theme", appliesTo: ALL },
  { slug: "duty", displayName: "Duty", category: "theme", appliesTo: ALL },
  { slug: "legacy", displayName: "Legacy", category: "theme", appliesTo: ALL },
  { slug: "environmentalism", displayName: "Environmentalism", category: "theme", appliesTo: ALL },
  { slug: "paranoia", displayName: "Paranoia", category: "theme", appliesTo: ALL },
  { slug: "loyalty", displayName: "Loyalty", category: "theme", appliesTo: ALL },
  { slug: "transformation", displayName: "Transformation", category: "theme", appliesTo: ALL },
  { slug: "forbidden-knowledge", displayName: "Forbidden Knowledge", category: "theme", appliesTo: ALL },
  { slug: "love-triangle", displayName: "Love Triangle", category: "theme", appliesTo: ALL },
  { slug: "political-intrigue", displayName: "Political Intrigue", category: "theme", appliesTo: ALL },
  { slug: "underworld", displayName: "Underworld", category: "theme", appliesTo: ALL },
  { slug: "madness", displayName: "Madness", category: "theme", appliesTo: ALL },
  { slug: "guilt", displayName: "Guilt", category: "theme", appliesTo: ALL },
  { slug: "self-discovery", displayName: "Self-Discovery", category: "theme", appliesTo: ALL },

  // ══════════════════════════════════════════════════════════════
  // UNIVERSAL TAGS — Setting
  // ══════════════════════════════════════════════════════════════
  { slug: "cyberpunk", displayName: "Cyberpunk", category: "setting", appliesTo: ALL },
  { slug: "post-apocalyptic", displayName: "Post-Apocalyptic", category: "setting", appliesTo: ALL },
  { slug: "medieval", displayName: "Medieval", category: "setting", appliesTo: ALL },
  { slug: "space", displayName: "Space", category: "setting", appliesTo: ALL },
  { slug: "urban", displayName: "Urban", category: "setting", appliesTo: ALL },
  { slug: "dystopian", displayName: "Dystopian", category: "setting", appliesTo: ALL },
  { slug: "noir", displayName: "Noir", category: "setting", appliesTo: ALL },
  { slug: "steampunk", displayName: "Steampunk", category: "setting", appliesTo: ALL },
  { slug: "gothic", displayName: "Gothic", category: "setting", appliesTo: ALL },
  { slug: "near-future", displayName: "Near Future", category: "setting", appliesTo: ALL },
  { slug: "alternate-history", displayName: "Alternate History", category: "setting", appliesTo: ALL },
  { slug: "small-town", displayName: "Small Town", category: "setting", appliesTo: ALL },
  { slug: "underwater", displayName: "Underwater", category: "setting", appliesTo: ALL },
  { slug: "dreamscape", displayName: "Dreamscape", category: "setting", appliesTo: ALL },
  { slug: "ancient-world", displayName: "Ancient World", category: "setting", appliesTo: ALL },
  { slug: "school", displayName: "School", category: "setting", appliesTo: ALL },
  { slug: "wilderness", displayName: "Wilderness", category: "setting", appliesTo: ALL },
  { slug: "prison", displayName: "Prison", category: "setting", appliesTo: ALL },
  { slug: "warzone", displayName: "Warzone", category: "setting", appliesTo: ALL },
  { slug: "virtual-world", displayName: "Virtual World", category: "setting", appliesTo: ALL },
  { slug: "rural", displayName: "Rural", category: "setting", appliesTo: ALL },
  { slug: "tropical", displayName: "Tropical", category: "setting", appliesTo: ALL },
  { slug: "arctic", displayName: "Arctic", category: "setting", appliesTo: ALL },
  { slug: "underground", displayName: "Underground", category: "setting", appliesTo: ALL },
  { slug: "haunted", displayName: "Haunted", category: "setting", appliesTo: ALL },
  { slug: "multiverse", displayName: "Multiverse", category: "setting", appliesTo: ALL },
  { slug: "desert", displayName: "Desert", category: "setting", appliesTo: ALL },
  { slug: "ocean", displayName: "Ocean", category: "setting", appliesTo: ALL },
  { slug: "victorian", displayName: "Victorian", category: "setting", appliesTo: ALL },
  { slug: "industrial", displayName: "Industrial", category: "setting", appliesTo: ALL },
  { slug: "suburban", displayName: "Suburban", category: "setting", appliesTo: ALL },
  { slug: "cosmic", displayName: "Cosmic", category: "setting", appliesTo: ALL },
  { slug: "labyrinth", displayName: "Labyrinth", category: "setting", appliesTo: ALL },
  { slug: "kingdom", displayName: "Kingdom", category: "setting", appliesTo: ALL },

  // ══════════════════════════════════════════════════════════════
  // UNIVERSAL TAGS — Characters
  // ══════════════════════════════════════════════════════════════
  { slug: "anti-hero", displayName: "Anti-Hero", category: "character", appliesTo: ALL },
  { slug: "morally-gray", displayName: "Morally Gray", category: "character", appliesTo: ALL },
  { slug: "ensemble-cast", displayName: "Ensemble Cast", category: "character", appliesTo: ALL },
  { slug: "lone-wolf", displayName: "Lone Wolf", category: "character", appliesTo: ALL },
  { slug: "mentor-student", displayName: "Mentor & Student", category: "character", appliesTo: ALL },
  { slug: "rivals-to-allies", displayName: "Rivals to Allies", category: "character", appliesTo: ALL },
  { slug: "reluctant-hero", displayName: "Reluctant Hero", category: "character", appliesTo: ALL },
  { slug: "villain-protagonist", displayName: "Villain Protagonist", category: "character", appliesTo: ALL },
  { slug: "tragic-villain", displayName: "Tragic Villain", category: "character", appliesTo: ALL },
  { slug: "child-protagonist", displayName: "Child Protagonist", category: "character", appliesTo: ALL },
  { slug: "unreliable-narrator", displayName: "Unreliable Narrator", category: "character", appliesTo: ALL },
  { slug: "duo", displayName: "Duo", category: "character", appliesTo: ALL },
  { slug: "chosen-one", displayName: "Chosen One", category: "character", appliesTo: ALL },
  { slug: "underdog", displayName: "Underdog", category: "character", appliesTo: ALL },
  { slug: "strong-female-lead", displayName: "Strong Female Lead", category: "character", appliesTo: ALL },
  { slug: "genius-protagonist", displayName: "Genius Protagonist", category: "character", appliesTo: ALL },
  { slug: "lovable-rogue", displayName: "Lovable Rogue", category: "character", appliesTo: ALL },
  { slug: "competent-protagonist", displayName: "Competent Protagonist", category: "character", appliesTo: ALL },
  { slug: "fish-out-of-water", displayName: "Fish Out of Water", category: "character", appliesTo: ALL },
  { slug: "tragic-hero", displayName: "Tragic Hero", category: "character", appliesTo: ALL },
  { slug: "femme-fatale", displayName: "Femme Fatale", category: "character", appliesTo: ALL },
  { slug: "silent-protagonist", displayName: "Silent Protagonist", category: "character", appliesTo: ALL },
  { slug: "monster-protagonist", displayName: "Monster Protagonist", category: "character", appliesTo: ALL },

  // ══════════════════════════════════════════════════════════════
  // UNIVERSAL TAGS — Tone
  // ══════════════════════════════════════════════════════════════
  { slug: "philosophical", displayName: "Philosophical", category: "tone", appliesTo: ALL },
  { slug: "satirical", displayName: "Satirical", category: "tone", appliesTo: ALL },
  { slug: "absurdist", displayName: "Absurdist", category: "tone", appliesTo: ALL },
  { slug: "melancholic", displayName: "Melancholic", category: "tone", appliesTo: ALL },
  { slug: "hopeful", displayName: "Hopeful", category: "tone", appliesTo: ALL },
  { slug: "tense", displayName: "Tense", category: "tone", appliesTo: ALL },
  { slug: "cozy", displayName: "Cozy", category: "tone", appliesTo: ALL },
  { slug: "brutal", displayName: "Brutal", category: "tone", appliesTo: ALL },
  { slug: "whimsical", displayName: "Whimsical", category: "tone", appliesTo: ALL },
  { slug: "eerie", displayName: "Eerie", category: "tone", appliesTo: ALL },
  { slug: "nostalgic", displayName: "Nostalgic", category: "tone", appliesTo: ALL },
  { slug: "intimate", displayName: "Intimate", category: "tone", appliesTo: ALL },
  { slug: "grandiose", displayName: "Grandiose", category: "tone", appliesTo: ALL },
  { slug: "chaotic", displayName: "Chaotic", category: "tone", appliesTo: ALL },
  { slug: "meditative", displayName: "Meditative", category: "tone", appliesTo: ALL },
  { slug: "haunting", displayName: "Haunting", category: "tone", appliesTo: ALL },
  { slug: "bittersweet", displayName: "Bittersweet", category: "tone", appliesTo: ALL },
  { slug: "suspenseful", displayName: "Suspenseful", category: "tone", appliesTo: ALL },
  { slug: "playful", displayName: "Playful", category: "tone", appliesTo: ALL },
  { slug: "dreamy", displayName: "Dreamy", category: "tone", appliesTo: ALL },
  { slug: "cynical", displayName: "Cynical", category: "tone", appliesTo: ALL },
  { slug: "uplifting", displayName: "Uplifting", category: "tone", appliesTo: ALL },
  { slug: "oppressive", displayName: "Oppressive", category: "tone", appliesTo: ALL },
  { slug: "darkly-comic", displayName: "Darkly Comic", category: "tone", appliesTo: ALL },
  { slug: "sincere", displayName: "Sincere", category: "tone", appliesTo: ALL },
  { slug: "irreverent", displayName: "Irreverent", category: "tone", appliesTo: ALL },
  { slug: "foreboding", displayName: "Foreboding", category: "tone", appliesTo: ALL },
  { slug: "sentimental", displayName: "Sentimental", category: "tone", appliesTo: ALL },
  { slug: "bleak", displayName: "Bleak", category: "tone", appliesTo: ALL },
  { slug: "euphoric", displayName: "Euphoric", category: "tone", appliesTo: ALL },

  // ══════════════════════════════════════════════════════════════
  // UNIVERSAL TAGS — Narrative
  // ══════════════════════════════════════════════════════════════
  { slug: "nonlinear", displayName: "Nonlinear", category: "narrative", appliesTo: ALL },
  { slug: "multiple-pov", displayName: "Multiple POV", category: "narrative", appliesTo: ALL },
  { slug: "anthology", displayName: "Anthology", category: "narrative", appliesTo: ALL },
  { slug: "mystery-box", displayName: "Mystery Box", category: "narrative", appliesTo: ALL },
  { slug: "slow-reveal", displayName: "Slow Reveal", category: "narrative", appliesTo: ALL },
  { slug: "twist-ending", displayName: "Twist Ending", category: "narrative", appliesTo: ALL },
  { slug: "open-ended", displayName: "Open Ended", category: "narrative", appliesTo: ALL },
  { slug: "tragic-ending", displayName: "Tragic Ending", category: "narrative", appliesTo: ALL },
  { slug: "based-on-true-story", displayName: "Based on True Story", category: "narrative", appliesTo: ALL },
  { slug: "frame-story", displayName: "Frame Story", category: "narrative", appliesTo: ALL },
  { slug: "first-person", displayName: "First Person", category: "narrative", appliesTo: ALL },
  { slug: "epic-scope", displayName: "Epic Scope", category: "narrative", appliesTo: ALL },
  { slug: "minimalist", displayName: "Minimalist", category: "narrative", appliesTo: ALL },
  { slug: "documentary-style", displayName: "Documentary Style", category: "narrative", appliesTo: ALL },
  { slug: "breaking-fourth-wall", displayName: "Breaking Fourth Wall", category: "narrative", appliesTo: ALL },
  { slug: "in-media-res", displayName: "In Media Res", category: "narrative", appliesTo: ALL },
  { slug: "parallel-timelines", displayName: "Parallel Timelines", category: "narrative", appliesTo: ALL },
  { slug: "flashback-heavy", displayName: "Flashback Heavy", category: "narrative", appliesTo: ALL },
  { slug: "whodunit", displayName: "Whodunit", category: "narrative", appliesTo: ALL },
  { slug: "heist-structure", displayName: "Heist Structure", category: "narrative", appliesTo: ALL },

  // ══════════════════════════════════════════════════════════════
  // UNIVERSAL TAGS — Pacing
  // ══════════════════════════════════════════════════════════════
  { slug: "slow-burn", displayName: "Slow Burn", category: "pacing", appliesTo: ALL },
  { slug: "fast-paced", displayName: "Fast-Paced", category: "pacing", appliesTo: ALL },
  { slug: "episodic", displayName: "Episodic", category: "pacing", appliesTo: ALL },
  { slug: "serialized", displayName: "Serialized", category: "pacing", appliesTo: ALL },
  { slug: "standalone", displayName: "Standalone", category: "pacing", appliesTo: ALL },
  { slug: "long-running-series", displayName: "Long-Running Series", category: "pacing", appliesTo: ALL },
  { slug: "trilogy", displayName: "Trilogy", category: "pacing", appliesTo: ALL },
  { slug: "short-and-sweet", displayName: "Short & Sweet", category: "pacing", appliesTo: ALL },
  { slug: "dense", displayName: "Dense", category: "pacing", appliesTo: ALL },
  { slug: "bingeable", displayName: "Bingeable", category: "pacing", appliesTo: ALL },
  { slug: "cliffhangers", displayName: "Cliffhangers", category: "pacing", appliesTo: ALL },
  { slug: "monster-of-the-week", displayName: "Monster of the Week", category: "pacing", appliesTo: ALL },
  { slug: "crescendo-ending", displayName: "Crescendo Ending", category: "pacing", appliesTo: ALL },
  { slug: "quiet-moments", displayName: "Quiet Moments", category: "pacing", appliesTo: ALL },
  { slug: "relentless", displayName: "Relentless", category: "pacing", appliesTo: ALL },
  { slug: "steady-build", displayName: "Steady Build", category: "pacing", appliesTo: ALL },

  // ══════════════════════════════════════════════════════════════
  // MUSIC-ONLY TAGS
  // ══════════════════════════════════════════════════════════════
  { slug: "hip-hop", displayName: "Hip-Hop", category: "music", appliesTo: MUSIC },
  { slug: "rock", displayName: "Rock", category: "music", appliesTo: MUSIC },
  { slug: "pop", displayName: "Pop", category: "music", appliesTo: MUSIC },
  { slug: "electronic", displayName: "Electronic", category: "music", appliesTo: MUSIC },
  { slug: "rnb", displayName: "R&B", category: "music", appliesTo: MUSIC },
  { slug: "metal", displayName: "Metal", category: "music", appliesTo: MUSIC },
  { slug: "jazz", displayName: "Jazz", category: "music", appliesTo: MUSIC },
  { slug: "classical", displayName: "Classical", category: "music", appliesTo: MUSIC },
  { slug: "indie-rock", displayName: "Indie Rock", category: "music", appliesTo: MUSIC },
  { slug: "punk", displayName: "Punk", category: "music", appliesTo: MUSIC },
  { slug: "alternative", displayName: "Alternative", category: "music", appliesTo: MUSIC },
  { slug: "country", displayName: "Country", category: "music", appliesTo: MUSIC },
  { slug: "latin", displayName: "Latin", category: "music", appliesTo: MUSIC },
  { slug: "k-pop", displayName: "K-Pop", category: "music", appliesTo: MUSIC },
  { slug: "j-pop", displayName: "J-Pop", category: "music", appliesTo: MUSIC },
  { slug: "lo-fi", displayName: "Lo-Fi", category: "music", appliesTo: MUSIC },
  { slug: "trap", displayName: "Trap", category: "music", appliesTo: MUSIC },
  { slug: "soul", displayName: "Soul", category: "music", appliesTo: MUSIC },
  { slug: "funk", displayName: "Funk", category: "music", appliesTo: MUSIC },
  { slug: "reggae", displayName: "Reggae", category: "music", appliesTo: MUSIC },
  { slug: "grunge", displayName: "Grunge", category: "music", appliesTo: MUSIC },
  { slug: "shoegaze", displayName: "Shoegaze", category: "music", appliesTo: MUSIC },
  { slug: "ambient", displayName: "Ambient", category: "music", appliesTo: MUSIC },
  { slug: "synthwave", displayName: "Synthwave", category: "music", appliesTo: MUSIC },
  { slug: "folk", displayName: "Folk", category: "music", appliesTo: MUSIC },
  { slug: "blues", displayName: "Blues", category: "music", appliesTo: MUSIC },
  { slug: "gospel", displayName: "Gospel", category: "music", appliesTo: MUSIC },
  { slug: "house", displayName: "House", category: "music", appliesTo: MUSIC },
  { slug: "techno", displayName: "Techno", category: "music", appliesTo: MUSIC },
  { slug: "drill", displayName: "Drill", category: "music", appliesTo: MUSIC },
  { slug: "emo", displayName: "Emo", category: "music", appliesTo: MUSIC },
  { slug: "nu-metal", displayName: "Nu-Metal", category: "music", appliesTo: MUSIC },
  { slug: "concept-album", displayName: "Concept Album", category: "music", appliesTo: MUSIC },
  { slug: "live-album", displayName: "Live Album", category: "music", appliesTo: MUSIC },
  { slug: "debut-album", displayName: "Debut Album", category: "music", appliesTo: MUSIC },
  { slug: "acoustic", displayName: "Acoustic", category: "music", appliesTo: MUSIC },
  { slug: "instrumental", displayName: "Instrumental", category: "music", appliesTo: MUSIC },
  { slug: "collaborative", displayName: "Collaborative", category: "music", appliesTo: MUSIC },
  { slug: "lyrical", displayName: "Lyrical", category: "music", appliesTo: MUSIC },
  { slug: "conscious-rap", displayName: "Conscious Rap", category: "music", appliesTo: MUSIC },
  { slug: "party", displayName: "Party", category: "music", appliesTo: MUSIC },
  { slug: "bedroom-pop", displayName: "Bedroom Pop", category: "music", appliesTo: MUSIC },
  { slug: "orchestral", displayName: "Orchestral", category: "music", appliesTo: MUSIC },
  { slug: "experimental", displayName: "Experimental", category: "music", appliesTo: MUSIC },
  { slug: "prog-rock", displayName: "Prog Rock", category: "music", appliesTo: MUSIC },
  { slug: "post-punk", displayName: "Post-Punk", category: "music", appliesTo: MUSIC },
  { slug: "dream-pop", displayName: "Dream Pop", category: "music", appliesTo: MUSIC },
  { slug: "psychedelic", displayName: "Psychedelic", category: "music", appliesTo: MUSIC },
  { slug: "disco", displayName: "Disco", category: "music", appliesTo: MUSIC },
  { slug: "afrobeat", displayName: "Afrobeat", category: "music", appliesTo: MUSIC },
  { slug: "dancehall", displayName: "Dancehall", category: "music", appliesTo: MUSIC },

  // ══════════════════════════════════════════════════════════════
  // GAME-ONLY TAGS
  // ══════════════════════════════════════════════════════════════
  { slug: "open-world", displayName: "Open World", category: "game", appliesTo: GAME },
  { slug: "turn-based", displayName: "Turn-Based", category: "game", appliesTo: GAME },
  { slug: "souls-like", displayName: "Souls-Like", category: "game", appliesTo: GAME },
  { slug: "roguelike", displayName: "Roguelike", category: "game", appliesTo: GAME },
  { slug: "roguelite", displayName: "Roguelite", category: "game", appliesTo: GAME },
  { slug: "metroidvania", displayName: "Metroidvania", category: "game", appliesTo: GAME },
  { slug: "puzzle", displayName: "Puzzle", category: "game", appliesTo: GAME },
  { slug: "sandbox", displayName: "Sandbox", category: "game", appliesTo: GAME },
  { slug: "multiplayer", displayName: "Multiplayer", category: "game", appliesTo: GAME },
  { slug: "single-player", displayName: "Single Player", category: "game", appliesTo: GAME },
  { slug: "co-op", displayName: "Co-Op", category: "game", appliesTo: GAME },
  { slug: "competitive", displayName: "Competitive", category: "game", appliesTo: GAME },
  { slug: "narrative-driven", displayName: "Narrative-Driven", category: "game", appliesTo: GAME },
  { slug: "exploration", displayName: "Exploration", category: "game", appliesTo: GAME },
  { slug: "crafting", displayName: "Crafting", category: "game", appliesTo: GAME },
  { slug: "stealth", displayName: "Stealth", category: "game", appliesTo: GAME },
  { slug: "hack-and-slash", displayName: "Hack & Slash", category: "game", appliesTo: GAME },
  { slug: "jrpg", displayName: "JRPG", category: "game", appliesTo: GAME },
  { slug: "wrpg", displayName: "WRPG", category: "game", appliesTo: GAME },
  { slug: "platformer", displayName: "Platformer", category: "game", appliesTo: GAME },
  { slug: "shooter", displayName: "Shooter", category: "game", appliesTo: GAME },
  { slug: "fighting", displayName: "Fighting", category: "game", appliesTo: GAME },
  { slug: "racing", displayName: "Racing", category: "game", appliesTo: GAME },
  { slug: "simulation", displayName: "Simulation", category: "game", appliesTo: GAME },
  { slug: "strategy", displayName: "Strategy", category: "game", appliesTo: GAME },
  { slug: "tower-defense", displayName: "Tower Defense", category: "game", appliesTo: GAME },
  { slug: "visual-novel", displayName: "Visual Novel", category: "game", appliesTo: GAME },
  { slug: "point-and-click", displayName: "Point & Click", category: "game", appliesTo: GAME },
  { slug: "battle-royale", displayName: "Battle Royale", category: "game", appliesTo: GAME },
  { slug: "mmo", displayName: "MMO", category: "game", appliesTo: GAME },
  { slug: "looter", displayName: "Looter", category: "game", appliesTo: GAME },
  { slug: "deckbuilder", displayName: "Deckbuilder", category: "game", appliesTo: GAME },
  { slug: "city-builder", displayName: "City Builder", category: "game", appliesTo: GAME },
  { slug: "horror-survival", displayName: "Horror Survival", category: "game", appliesTo: GAME },
  { slug: "walking-simulator", displayName: "Walking Simulator", category: "game", appliesTo: GAME },
  { slug: "boss-rush", displayName: "Boss Rush", category: "game", appliesTo: GAME },
  { slug: "speedrun-friendly", displayName: "Speedrun Friendly", category: "game", appliesTo: GAME },
  { slug: "new-game-plus", displayName: "New Game+", category: "game", appliesTo: GAME },
  { slug: "permadeath", displayName: "Permadeath", category: "game", appliesTo: GAME },
  { slug: "base-building", displayName: "Base Building", category: "game", appliesTo: GAME },
  { slug: "resource-management", displayName: "Resource Management", category: "game", appliesTo: GAME },
  { slug: "bullet-hell", displayName: "Bullet Hell", category: "game", appliesTo: GAME },
  { slug: "party-game", displayName: "Party Game", category: "game", appliesTo: GAME },
  { slug: "tactical", displayName: "Tactical", category: "game", appliesTo: GAME },
  { slug: "survival-game", displayName: "Survival", category: "game", appliesTo: GAME },

  // ══════════════════════════════════════════════════════════════
  // ANIME/MANGA-ONLY TAGS
  // ══════════════════════════════════════════════════════════════
  { slug: "isekai", displayName: "Isekai", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "shonen", displayName: "Shonen", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "seinen", displayName: "Seinen", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "shojo", displayName: "Shojo", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "josei", displayName: "Josei", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "mecha", displayName: "Mecha", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "magical-girl", displayName: "Magical Girl", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "harem", displayName: "Harem", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "reverse-harem", displayName: "Reverse Harem", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "slice-of-life", displayName: "Slice of Life", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "chibi", displayName: "Chibi", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "fan-service", displayName: "Fan Service", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "tournament-arc", displayName: "Tournament Arc", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "power-system", displayName: "Power System", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "training-arc", displayName: "Training Arc", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "school-life", displayName: "School Life", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "idol", displayName: "Idol", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "yuri", displayName: "Yuri", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "yaoi", displayName: "Yaoi", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "light-novel-adaptation", displayName: "Light Novel Adaptation", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "one-shot", displayName: "One-Shot", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "weekly", displayName: "Weekly", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "battle-manga", displayName: "Battle Manga", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "sports-manga", displayName: "Sports Manga", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "psychological-manga", displayName: "Psychological", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "iyashikei", displayName: "Iyashikei", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "ecchi", displayName: "Ecchi", category: "anime", appliesTo: ANIME_MANGA },
  { slug: "kemono", displayName: "Kemono", category: "anime", appliesTo: ANIME_MANGA },

  // ══════════════════════════════════════════════════════════════
  // TV-ONLY TAGS
  // ══════════════════════════════════════════════════════════════
  { slug: "limited-series", displayName: "Limited Series", category: "tv", appliesTo: TV },
  { slug: "miniseries", displayName: "Miniseries", category: "tv", appliesTo: TV },
  { slug: "procedural", displayName: "Procedural", category: "tv", appliesTo: TV },
  { slug: "sitcom", displayName: "Sitcom", category: "tv", appliesTo: TV },
  { slug: "prestige-tv", displayName: "Prestige TV", category: "tv", appliesTo: TV },
  { slug: "anthology-series", displayName: "Anthology Series", category: "tv", appliesTo: TV },
  { slug: "docuseries", displayName: "Docuseries", category: "tv", appliesTo: TV },
  { slug: "reality", displayName: "Reality", category: "tv", appliesTo: TV },
  { slug: "talk-show", displayName: "Talk Show", category: "tv", appliesTo: TV },
  { slug: "sketch-comedy", displayName: "Sketch Comedy", category: "tv", appliesTo: TV },
  { slug: "animated-series", displayName: "Animated Series", category: "tv", appliesTo: TV },
  { slug: "soap-opera", displayName: "Soap Opera", category: "tv", appliesTo: TV },
  { slug: "completed-series", displayName: "Completed Series", category: "tv", appliesTo: TV },
  { slug: "ongoing", displayName: "Ongoing", category: "tv", appliesTo: TV },
  { slug: "cancelled", displayName: "Cancelled", category: "tv", appliesTo: TV },
  { slug: "cold-open", displayName: "Cold Open", category: "tv", appliesTo: TV },
  { slug: "bottle-episode", displayName: "Bottle Episode", category: "tv", appliesTo: TV },
  { slug: "british", displayName: "British", category: "tv", appliesTo: TV },
  { slug: "korean-drama", displayName: "Korean Drama", category: "tv", appliesTo: TV },
  { slug: "workplace-comedy", displayName: "Workplace Comedy", category: "tv", appliesTo: TV },
  { slug: "legal-drama", displayName: "Legal Drama", category: "tv", appliesTo: TV },
  { slug: "medical-drama", displayName: "Medical Drama", category: "tv", appliesTo: TV },
  { slug: "crime-drama", displayName: "Crime Drama", category: "tv", appliesTo: TV },
  { slug: "period-drama", displayName: "Period Drama", category: "tv", appliesTo: TV },

  // ══════════════════════════════════════════════════════════════
  // BOOK-ONLY TAGS
  // ══════════════════════════════════════════════════════════════
  { slug: "literary-fiction", displayName: "Literary Fiction", category: "book", appliesTo: BOOK },
  { slug: "page-turner", displayName: "Page-Turner", category: "book", appliesTo: BOOK },
  { slug: "hard-magic-system", displayName: "Hard Magic System", category: "book", appliesTo: BOOK },
  { slug: "soft-magic-system", displayName: "Soft Magic System", category: "book", appliesTo: BOOK },
  { slug: "epistolary", displayName: "Epistolary", category: "book", appliesTo: BOOK },
  { slug: "poetry-collection", displayName: "Poetry Collection", category: "book", appliesTo: BOOK },
  { slug: "short-story-collection", displayName: "Short Story Collection", category: "book", appliesTo: BOOK },
  { slug: "novella", displayName: "Novella", category: "book", appliesTo: BOOK },
  { slug: "doorstopper", displayName: "Doorstopper", category: "book", appliesTo: BOOK },
  { slug: "debut-novel", displayName: "Debut Novel", category: "book", appliesTo: BOOK },
  { slug: "pulitzer", displayName: "Pulitzer Winner", category: "book", appliesTo: BOOK },
  { slug: "hugo-winner", displayName: "Hugo Winner", category: "book", appliesTo: BOOK },
  { slug: "nebula-winner", displayName: "Nebula Winner", category: "book", appliesTo: BOOK },
  { slug: "booker-winner", displayName: "Booker Winner", category: "book", appliesTo: BOOK },
  { slug: "self-published", displayName: "Self-Published", category: "book", appliesTo: BOOK },
  { slug: "audiobook-great", displayName: "Great Audiobook", category: "book", appliesTo: BOOK },
  { slug: "multiple-timelines", displayName: "Multiple Timelines", category: "book", appliesTo: BOOK },
  { slug: "world-within-world", displayName: "World Within World", category: "book", appliesTo: BOOK },
  { slug: "portal-fantasy", displayName: "Portal Fantasy", category: "book", appliesTo: BOOK },
  { slug: "urban-fantasy", displayName: "Urban Fantasy", category: "book", appliesTo: BOOK },
  { slug: "grimdark", displayName: "Grimdark", category: "book", appliesTo: BOOK },
  { slug: "cozy-mystery", displayName: "Cozy Mystery", category: "book", appliesTo: BOOK },
  { slug: "beach-read", displayName: "Beach Read", category: "book", appliesTo: BOOK },
  { slug: "book-club-pick", displayName: "Book Club Pick", category: "book", appliesTo: BOOK },
  { slug: "omniscient-narrator", displayName: "Omniscient Narrator", category: "book", appliesTo: BOOK },

  // ══════════════════════════════════════════════════════════════
  // PODCAST-ONLY TAGS
  // ══════════════════════════════════════════════════════════════
  { slug: "interview-format", displayName: "Interview Format", category: "podcast", appliesTo: PODCAST },
  { slug: "narrative-nonfiction", displayName: "Narrative Nonfiction", category: "podcast", appliesTo: PODCAST },
  { slug: "true-crime", displayName: "True Crime", category: "podcast", appliesTo: PODCAST },
  { slug: "investigative", displayName: "Investigative", category: "podcast", appliesTo: PODCAST },
  { slug: "conversational", displayName: "Conversational", category: "podcast", appliesTo: PODCAST },
  { slug: "solo-host", displayName: "Solo Host", category: "podcast", appliesTo: PODCAST },
  { slug: "panel", displayName: "Panel", category: "podcast", appliesTo: PODCAST },
  { slug: "serialized-story", displayName: "Serialized Story", category: "podcast", appliesTo: PODCAST },
  { slug: "educational", displayName: "Educational", category: "podcast", appliesTo: PODCAST },
  { slug: "news-commentary", displayName: "News Commentary", category: "podcast", appliesTo: PODCAST },
  { slug: "comedy-podcast", displayName: "Comedy Podcast", category: "podcast", appliesTo: PODCAST },
  { slug: "weekly-release", displayName: "Weekly Release", category: "podcast", appliesTo: PODCAST },
  { slug: "completed-podcast", displayName: "Completed Series", category: "podcast", appliesTo: PODCAST },
  { slug: "celebrity-host", displayName: "Celebrity Host", category: "podcast", appliesTo: PODCAST },
  { slug: "deep-dive", displayName: "Deep Dive", category: "podcast", appliesTo: PODCAST },
  { slug: "roundtable", displayName: "Roundtable", category: "podcast", appliesTo: PODCAST },
  { slug: "storytelling", displayName: "Storytelling", category: "podcast", appliesTo: PODCAST },
  { slug: "science-podcast", displayName: "Science", category: "podcast", appliesTo: PODCAST },
  { slug: "history-podcast", displayName: "History", category: "podcast", appliesTo: PODCAST },
  { slug: "tech-podcast", displayName: "Tech", category: "podcast", appliesTo: PODCAST },
  { slug: "business-podcast", displayName: "Business", category: "podcast", appliesTo: PODCAST },
  { slug: "culture-podcast", displayName: "Culture", category: "podcast", appliesTo: PODCAST },
  { slug: "sports-podcast", displayName: "Sports", category: "podcast", appliesTo: PODCAST },

  // ══════════════════════════════════════════════════════════════
  // COMIC-ONLY TAGS
  // ══════════════════════════════════════════════════════════════
  { slug: "superhero", displayName: "Superhero", category: "comic", appliesTo: COMIC },
  { slug: "indie-comic", displayName: "Indie Comic", category: "comic", appliesTo: COMIC },
  { slug: "graphic-novel", displayName: "Graphic Novel", category: "comic", appliesTo: COMIC },
  { slug: "webcomic", displayName: "Webcomic", category: "comic", appliesTo: COMIC },
  { slug: "manga-influenced", displayName: "Manga-Influenced", category: "comic", appliesTo: COMIC },
  { slug: "single-issue", displayName: "Single Issue", category: "comic", appliesTo: COMIC },
  { slug: "trade-paperback", displayName: "Trade Paperback", category: "comic", appliesTo: COMIC },
  { slug: "crossover-event", displayName: "Crossover Event", category: "comic", appliesTo: COMIC },
  { slug: "origin-story", displayName: "Origin Story", category: "comic", appliesTo: COMIC },
  { slug: "team-book", displayName: "Team Book", category: "comic", appliesTo: COMIC },
  { slug: "creator-owned", displayName: "Creator-Owned", category: "comic", appliesTo: COMIC },
  { slug: "dc", displayName: "DC", category: "comic", appliesTo: COMIC },
  { slug: "marvel", displayName: "Marvel", category: "comic", appliesTo: COMIC },
  { slug: "image", displayName: "Image", category: "comic", appliesTo: COMIC },
  { slug: "dark-horse", displayName: "Dark Horse", category: "comic", appliesTo: COMIC },
  { slug: "vertigo", displayName: "Vertigo", category: "comic", appliesTo: COMIC },
  { slug: "black-and-white", displayName: "Black & White", category: "comic", appliesTo: COMIC },
  { slug: "full-color", displayName: "Full Color", category: "comic", appliesTo: COMIC },
  { slug: "noir-comic", displayName: "Noir Comic", category: "comic", appliesTo: COMIC },
  { slug: "horror-comic", displayName: "Horror Comic", category: "comic", appliesTo: COMIC },
  { slug: "sci-fi-comic", displayName: "Sci-Fi Comic", category: "comic", appliesTo: COMIC },
  { slug: "slice-of-life-comic", displayName: "Slice of Life", category: "comic", appliesTo: COMIC },
  { slug: "autobiographical", displayName: "Autobiographical", category: "comic", appliesTo: COMIC },
];

/** Lookup map: slug → TagDef */
export const TAG_MAP = new Map<string, TagDef>(
  TAG_DEFINITIONS.map(t => [t.slug, t])
);

/** Check if a tag can be applied to a given media type */
export function tagAppliesTo(slug: string, mediaType: string): boolean {
  const def = TAG_MAP.get(slug);
  if (!def) return false;
  if (def.appliesTo.length === 0) return true; // universal
  return def.appliesTo.includes(mediaType);
}

/** Get display name for a tag slug */
export function getTagDisplayName(slug: string): string {
  return TAG_MAP.get(slug)?.displayName || slug;
}

/** Get category for a tag slug */
export function getTagCategory(slug: string): string {
  return TAG_MAP.get(slug)?.category || "theme";
}
