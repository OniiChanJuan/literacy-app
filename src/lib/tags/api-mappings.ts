/**
 * Mappings from external API keywords/genres/themes to our tag slugs.
 * Used in Layer 1 of tag assignment.
 */

// ══════════════════════════════════════════════════════════════
// TMDB keyword → tag mapping
// TMDB keywords are free-text strings from their keyword database
// ══════════════════════════════════════════════════════════════
export const TMDB_KEYWORD_MAP: Record<string, string> = {
  // Themes
  "revenge": "revenge", "vengeance": "revenge",
  "survival": "survival", "survivor": "survival",
  "coming of age": "coming-of-age", "growing up": "coming-of-age",
  "corruption": "corruption",
  "grief": "grief", "loss of loved one": "grief", "mourning": "grief",
  "forbidden love": "forbidden-love",
  "betrayal": "betrayal", "treason": "betrayal",
  "war": "war", "world war ii": "war", "world war i": "war", "civil war": "war", "vietnam war": "war",
  "class differences": "class-struggle", "class conflict": "class-struggle",
  "loneliness": "isolation", "solitude": "isolation",
  "family": "family", "dysfunctional family": "family",
  "power": "power", "lust for power": "power",
  "sacrifice": "sacrifice", "self-sacrifice": "sacrifice",
  "obsession": "obsession",
  "destiny": "fate-vs-choice", "fate": "fate-vs-choice", "prophecy": "fate-vs-choice",
  "artificial intelligence": "tech-vs-humanity", "robot": "tech-vs-humanity",
  "memory": "memory", "amnesia": "memory", "memory loss": "memory",
  "death": "mortality", "afterlife": "mortality",
  "rebellion": "rebellion", "revolution": "rebellion", "uprising": "rebellion",
  "redemption": "redemption",
  "identity": "identity", "identity crisis": "identity",
  "colonialism": "colonialism",
  "justice": "justice", "injustice": "justice",
  "trauma": "trauma", "ptsd": "trauma",
  "deception": "deception", "con artist": "deception",
  "ambition": "ambition",
  "jealousy": "jealousy", "envy": "jealousy",
  "religion": "faith", "faith": "faith",
  "addiction": "addiction", "drug addiction": "addiction", "alcoholism": "addiction",
  "duty": "duty", "honor": "duty",
  "legacy": "legacy", "inheritance": "legacy",
  "paranoia": "paranoia",
  "loyalty": "loyalty",
  "transformation": "transformation",
  "love triangle": "love-triangle",
  "politics": "political-intrigue", "political thriller": "political-intrigue",
  "organized crime": "underworld", "mafia": "underworld", "gang": "underworld", "crime": "underworld",
  "madness": "madness", "insanity": "madness",
  "guilt": "guilt",
  "self-discovery": "self-discovery",
  "environmentalism": "environmentalism", "climate change": "environmentalism",
  "found family": "found-family",

  // Settings
  "cyberpunk": "cyberpunk",
  "post-apocalyptic future": "post-apocalyptic", "post-apocalypse": "post-apocalyptic",
  "medieval": "medieval", "middle ages": "medieval",
  "outer space": "space", "space travel": "space", "spacecraft": "space", "space station": "space",
  "dystopia": "dystopian", "totalitarianism": "dystopian",
  "steampunk": "steampunk",
  "gothic": "gothic",
  "near future": "near-future",
  "alternate history": "alternate-history", "alternative history": "alternate-history",
  "small town": "small-town",
  "underwater": "underwater", "deep sea": "underwater",
  "dream": "dreamscape", "dream world": "dreamscape", "subconscious": "dreamscape",
  "ancient rome": "ancient-world", "ancient greece": "ancient-world", "ancient egypt": "ancient-world",
  "high school": "school", "boarding school": "school", "university": "school",
  "wilderness": "wilderness", "forest": "wilderness", "jungle": "wilderness",
  "prison": "prison", "escape from prison": "prison",
  "virtual reality": "virtual-world",
  "haunted house": "haunted", "ghost": "haunted",
  "parallel universe": "multiverse", "multiverse": "multiverse",
  "desert": "desert",
  "ocean": "ocean", "sea": "ocean",
  "victorian era": "victorian",
  "noir": "noir", "neo-noir": "noir",

  // Characters
  "anti-hero": "anti-hero", "antihero": "anti-hero",
  "ensemble cast": "ensemble-cast",
  "reluctant hero": "reluctant-hero",
  "villain": "villain-protagonist",
  "unreliable narrator": "unreliable-narrator",
  "chosen one": "chosen-one",
  "underdog": "underdog",
  "strong woman": "strong-female-lead",

  // Tone
  "philosophical": "philosophical",
  "satire": "satirical", "social satire": "satirical",
  "dark comedy": "darkly-comic", "black comedy": "darkly-comic",
  "suspense": "suspenseful", "thriller": "suspenseful",
  "nostalgia": "nostalgic",

  // Narrative
  "nonlinear timeline": "nonlinear",
  "twist ending": "twist-ending", "plot twist": "twist-ending",
  "based on true story": "based-on-true-story", "based on true events": "based-on-true-story",
  "anthology": "anthology",
  "heist": "heist-structure",
  "whodunit": "whodunit",
  "documentary": "documentary-style",
  "breaking the fourth wall": "breaking-fourth-wall",
  "flashback": "flashback-heavy",
};

// ══════════════════════════════════════════════════════════════
// IGDB theme/keyword/game_mode → tag mapping
// IGDB uses numeric IDs for themes
// ══════════════════════════════════════════════════════════════
export const IGDB_THEME_MAP: Record<number, string> = {
  1: "fast-paced",         // Action
  17: "fantasy",           // Fantasy (maps to medieval if combined)
  18: "space",             // Science fiction → space
  19: "survival",          // Horror → survival
  20: "suspenseful",       // Thriller
  21: "survival-game",     // Survival
  22: "based-on-true-story", // Historical
  23: "stealth",           // Stealth
  27: "darkly-comic",      // Comedy
  28: "urban",             // Business → urban
  31: "brutal",            // Drama → can be brutal
  32: "nonlinear",         // Non-fiction
  33: "sandbox",           // Sandbox
  34: "educational",       // Educational
  35: "children",          // Kids
  38: "open-world",        // Open world
  39: "war",               // Warfare
  40: "party-game",        // Party
  41: "medieval",          // 4X (often medieval/empire)
  42: "eerie",             // Erotic (skip) → use eerie
  43: "mystery-box",       // Mystery
};

export const IGDB_GAME_MODE_MAP: Record<number, string> = {
  1: "single-player",
  2: "multiplayer",
  3: "co-op",
  4: "competitive",      // Split screen → competitive
  5: "mmo",
  6: "battle-royale",
};

export const IGDB_GENRE_MAP: Record<number, string[]> = {
  2: ["point-and-click"],        // Point-and-click
  4: ["fighting"],               // Fighting
  5: ["shooter"],                // Shooter
  7: ["puzzle"],                 // Music (puzzle-adjacent)
  8: ["platformer"],             // Platform
  9: ["puzzle"],                 // Puzzle
  10: ["racing"],                // Racing
  11: ["strategy"],              // Real Time Strategy
  12: ["jrpg"],                  // Role-playing (RPG)
  13: ["simulation"],            // Simulator
  14: ["strategy"],              // Sport
  15: ["strategy"],              // Strategy
  16: ["turn-based"],            // Turn-based strategy
  24: ["tactical"],              // Tactical
  25: ["hack-and-slash"],        // Hack and slash/Beat 'em up
  26: ["puzzle"],                // Quiz/Trivia
  30: ["platformer"],            // Pinball
  31: ["exploration"],           // Adventure
  32: ["indie-rock"],            // Indie → indie game
  33: ["city-builder"],          // Arcade
  34: ["visual-novel"],          // Visual Novel
  35: ["deckbuilder"],           // Card & Board Game
  36: ["mmo"],                   // MOBA
};

// ══════════════════════════════════════════════════════════════
// MAL (Jikan) genre/theme/demographic → tag mapping
// ══════════════════════════════════════════════════════════════
export const MAL_GENRE_MAP: Record<string, string> = {
  "Action": "fast-paced",
  "Adventure": "exploration",
  "Comedy": "playful",
  "Drama": "intimate",
  "Fantasy": "medieval",
  "Horror": "eerie",
  "Mystery": "mystery-box",
  "Romance": "intimate",
  "Sci-Fi": "near-future",
  "Slice of Life": "slice-of-life",
  "Sports": "sports-manga",
  "Supernatural": "eerie",
  "Suspense": "suspenseful",
  "Ecchi": "ecchi",
  "Hentai": "ecchi",
  "Boys Love": "yaoi",
  "Girls Love": "yuri",
};

export const MAL_THEME_MAP: Record<string, string> = {
  "Gore": "brutal",
  "Military": "war",
  "Mythology": "ancient-world",
  "Psychological": "psychological-manga",
  "School": "school-life",
  "Space": "space",
  "Vampire": "gothic",
  "Mecha": "mecha",
  "Music": "intimate",
  "Parody": "satirical",
  "Samurai": "medieval",
  "Super Power": "power-system",
  "Martial Arts": "battle-manga",
  "Historical": "ancient-world",
  "Harem": "harem",
  "Reverse Harem": "reverse-harem",
  "Isekai": "isekai",
  "Reincarnation": "isekai",
  "Time Travel": "nonlinear",
  "Survival": "survival",
  "Detective": "whodunit",
  "Magical Girls": "magical-girl",
  "Idols (Female)": "idol",
  "Idols (Male)": "idol",
  "CGDCT": "iyashikei",
  "Iyashikei": "iyashikei",
  "Workplace": "urban",
  "Gag Humor": "absurdist",
  "Organized Crime": "underworld",
  "Delinquents": "anti-hero",
  "Otaku Culture": "nostalgic",
  "Performing Arts": "intimate",
  "Strategy Game": "strategy",
  "Team Sports": "sports-manga",
  "Combat Sports": "battle-manga",
  "Racing": "fast-paced",
  "Love Polygon": "love-triangle",
  "Visual Arts": "intimate",
  "Villainess": "villain-protagonist",
  "Childcare": "family",
  "Crossdressing": "identity",
  "Anthropomorphic": "kemono",
};

export const MAL_DEMOGRAPHIC_MAP: Record<string, string> = {
  "Shounen": "shonen",
  "Seinen": "seinen",
  "Shoujo": "shojo",
  "Josei": "josei",
  "Kids": "playful",
};

// ══════════════════════════════════════════════════════════════
// Spotify artist genre → music tag mapping
// ══════════════════════════════════════════════════════════════
export const SPOTIFY_GENRE_MAP: Record<string, string> = {
  "hip hop": "hip-hop", "rap": "hip-hop", "trap": "trap",
  "rock": "rock", "classic rock": "rock", "hard rock": "rock",
  "pop": "pop", "dance pop": "pop", "synth-pop": "pop",
  "electronic": "electronic", "edm": "electronic", "electro": "electronic",
  "r&b": "rnb", "urban contemporary": "rnb",
  "metal": "metal", "heavy metal": "metal", "death metal": "metal", "black metal": "metal",
  "jazz": "jazz", "smooth jazz": "jazz", "acid jazz": "jazz",
  "classical": "classical", "baroque": "classical", "romantic era": "classical",
  "indie": "indie-rock", "indie rock": "indie-rock", "indie pop": "indie-rock",
  "punk": "punk", "punk rock": "punk", "pop punk": "punk",
  "alternative": "alternative", "alt-rock": "alternative", "alternative rock": "alternative",
  "country": "country", "modern country": "country",
  "latin": "latin", "reggaeton": "latin", "latin pop": "latin",
  "k-pop": "k-pop", "korean pop": "k-pop",
  "j-pop": "j-pop",
  "lo-fi": "lo-fi", "lo-fi beats": "lo-fi",
  "soul": "soul", "neo soul": "soul",
  "funk": "funk",
  "reggae": "reggae", "dancehall": "dancehall",
  "grunge": "grunge",
  "shoegaze": "shoegaze",
  "ambient": "ambient",
  "synthwave": "synthwave", "retrowave": "synthwave", "vaporwave": "synthwave",
  "folk": "folk", "indie folk": "folk", "folk rock": "folk",
  "blues": "blues",
  "gospel": "gospel",
  "house": "house", "deep house": "house",
  "techno": "techno",
  "drill": "drill", "uk drill": "drill",
  "emo": "emo", "emo rap": "emo",
  "nu-metal": "nu-metal", "nu metal": "nu-metal",
  "progressive rock": "prog-rock", "prog": "prog-rock",
  "post-punk": "post-punk",
  "dream pop": "dream-pop",
  "psychedelic": "psychedelic", "psychedelic rock": "psychedelic",
  "disco": "disco", "nu-disco": "disco",
  "afrobeat": "afrobeat", "afrobeats": "afrobeat",
  "conscious hip hop": "conscious-rap",
  "bedroom pop": "bedroom-pop",
};

// ══════════════════════════════════════════════════════════════
// Comic Vine concept → tag mapping
// ══════════════════════════════════════════════════════════════
export const COMIC_VINE_CONCEPT_MAP: Record<string, string> = {
  "superhero": "superhero",
  "anti-hero": "anti-hero",
  "origin story": "origin-story",
  "crossover": "crossover-event",
  "time travel": "nonlinear",
  "multiverse": "multiverse",
  "dystopia": "dystopian",
  "noir": "noir-comic",
  "horror": "horror-comic",
  "science fiction": "sci-fi-comic",
};
