/**
 * Layer 2: Genre-gated keyword co-occurrence matching.
 * Each tag has a keyword cluster and optional genre gates.
 * Requires 2+ keyword matches for assignment.
 */

interface KeywordCluster {
  tag: string;
  keywords: string[];
  genreGate?: string[]; // genres that must be present (empty/undefined = no gate)
  minMatches: number;   // minimum keywords to match (usually 2)
}

export const KEYWORD_CLUSTERS: KeywordCluster[] = [
  // ── Themes ──
  { tag: "cyberpunk", keywords: ["cyber", "hacker", "neural", "implant", "neon", "megacorp", "augment", "android", "synthetic", "virtual"], genreGate: ["sci-fi", "action", "science fiction", "thriller"], minMatches: 2 },
  { tag: "post-apocalyptic", keywords: ["wasteland", "ruins", "survivor", "fallout", "collapse", "aftermath", "mutant", "bunker", "scaveng", "desolat", "apocalyp"], genreGate: ["sci-fi", "action", "drama", "science fiction", "horror"], minMatches: 2 },
  { tag: "revenge", keywords: ["revenge", "avenge", "vendetta", "retribution", "payback", "vengeance", "grudge", "settle the score"], minMatches: 2 },
  { tag: "identity", keywords: ["identity", "who am i", "self", "consciousness", "soul", "human", "remember", "forget", "memory", "persona", "sense of self"], genreGate: ["sci-fi", "drama", "thriller", "psychological", "science fiction"], minMatches: 2 },
  { tag: "coming-of-age", keywords: ["grow up", "adolescen", "teen", "youth", "school", "first love", "coming of age", "childhood", "matur", "young"], genreGate: ["drama", "comedy", "romance", "slice of life"], minMatches: 2 },
  { tag: "found-family", keywords: ["found family", "band of", "crew", "team", "together", "brotherhood", "sisterhood", "orphan", "ragtag", "companion", "fellowship", "unlikely allies"], minMatches: 2 },
  { tag: "betrayal", keywords: ["betray", "traitor", "backstab", "double-cross", "trust", "deceive", "turncoat", "conspiracy", "treachery"], minMatches: 2 },
  { tag: "survival", keywords: ["surviv", "endure", "desperate", "last hope", "against all odds", "fight for", "cling to life", "stranded", "trapped"], minMatches: 2 },
  { tag: "redemption", keywords: ["redeem", "redemption", "atone", "second chance", "forgive", "sins", "past mistakes", "make amends"], minMatches: 2 },
  { tag: "war", keywords: ["war", "battle", "soldier", "military", "army", "combat", "troops", "invasion", "warfare", "front lines", "regiment"], minMatches: 2 },
  { tag: "class-struggle", keywords: ["class", "wealth", "poverty", "rich", "poor", "inequality", "privilege", "oppressed", "elite", "working class", "bourgeois"], minMatches: 2 },
  { tag: "existentialism", keywords: ["exist", "meaning", "purpose", "void", "nihil", "absurd", "consciousness", "being", "nothingness", "essence"], genreGate: ["drama", "sci-fi", "science fiction", "art house", "psychological"], minMatches: 2 },
  { tag: "isolation", keywords: ["isolat", "alone", "lonely", "solitary", "withdrawn", "hermit", "exile", "abandoned", "desolate", "remote"], minMatches: 2 },
  { tag: "family", keywords: ["family", "father", "mother", "son", "daughter", "sibling", "parent", "child", "brother", "sister", "generation", "heir"], minMatches: 3 },
  { tag: "power", keywords: ["power", "control", "dominat", "authority", "throne", "ruler", "reign", "empire", "conquer", "tyrant", "monarch"], minMatches: 2 },
  { tag: "freedom", keywords: ["freedom", "liberty", "free", "escape", "liberation", "chains", "captive", "emancipat", "break free"], minMatches: 2 },
  { tag: "sacrifice", keywords: ["sacrifice", "give up", "lay down", "noble death", "ultimate price", "selfless", "martyr", "for the greater good"], minMatches: 2 },
  { tag: "obsession", keywords: ["obsess", "consume", "fixat", "compuls", "driven", "relentless pursuit", "mania", "fanat", "all-consuming"], minMatches: 2 },
  { tag: "fate-vs-choice", keywords: ["fate", "destiny", "prophecy", "chosen", "predestined", "ordained", "inevitable", "free will", "choice"], minMatches: 2 },
  { tag: "tech-vs-humanity", keywords: ["artificial", "robot", "android", "cyborg", "machine", "algorithm", "AI", "singularity", "automation", "sentient", "transhumanism"], genreGate: ["sci-fi", "science fiction", "thriller", "drama"], minMatches: 2 },
  { tag: "memory", keywords: ["memory", "remember", "forget", "amnesia", "past", "flashback", "nostalgi", "recall", "erased", "forgotten"], minMatches: 2 },
  { tag: "mortality", keywords: ["death", "dying", "mortal", "afterlife", "terminal", "funeral", "grave", "finality", "legacy", "eternal"], minMatches: 2 },
  { tag: "rebellion", keywords: ["rebel", "revolt", "revolution", "uprising", "resist", "defy", "overthrow", "insurgent", "dissident", "subvert"], minMatches: 2 },
  { tag: "corruption", keywords: ["corrupt", "bribe", "scandal", "crooked", "graft", "abuse of power", "cover-up", "complicit", "rot"], minMatches: 2 },
  { tag: "grief", keywords: ["grief", "mourn", "loss", "bereave", "widow", "funeral", "death of", "passed away", "cope with loss"], minMatches: 2 },
  { tag: "forbidden-love", keywords: ["forbidden", "taboo", "secret affair", "illicit", "star-crossed", "impossible love", "unrequited", "doomed love"], minMatches: 2 },
  { tag: "trauma", keywords: ["trauma", "ptsd", "haunt", "scar", "damaged", "broken", "nightmar", "triggered", "flashback", "cope"], minMatches: 2 },
  { tag: "deception", keywords: ["decei", "lie", "fake", "fraud", "imperson", "disguise", "con", "trick", "manipulat", "pretend"], minMatches: 2 },
  { tag: "ambition", keywords: ["ambit", "aspir", "driven", "climb", "success", "strive", "determined", "relentless", "goal", "achieve"], minMatches: 2 },
  { tag: "paranoia", keywords: ["paranoi", "suspic", "trust no one", "watch", "conspir", "spy", "surveil", "follow", "bugged", "delusion"], minMatches: 2 },
  { tag: "loyalty", keywords: ["loyal", "devot", "allegianc", "faithful", "honor", "oath", "pledge", "stand by", "unwavering"], minMatches: 2 },
  { tag: "transformation", keywords: ["transform", "metamorph", "evolve", "change", "becom", "transition", "mutation", "rebirth", "awaken"], minMatches: 2 },
  { tag: "political-intrigue", keywords: ["politic", "intrigue", "scheme", "alliance", "diplomat", "court", "faction", "throne", "counsel", "spy"], minMatches: 2 },
  { tag: "underworld", keywords: ["mafia", "gang", "cartel", "crime boss", "syndicate", "smuggl", "mob", "hitman", "heist", "organized crime"], minMatches: 2 },
  { tag: "madness", keywords: ["mad", "insane", "lunatic", "sanity", "psycho", "unhinged", "derang", "mental", "hysteria", "breakdown"], minMatches: 2 },
  { tag: "guilt", keywords: ["guilt", "remorse", "conscience", "regret", "haunt", "sin", "burden", "shame", "culpab"], minMatches: 2 },
  { tag: "self-discovery", keywords: ["discover", "find myself", "journey", "purpose", "soul search", "introspect", "identity", "path", "awaken", "revelation"], minMatches: 2 },
  { tag: "love-triangle", keywords: ["love triangle", "torn between", "two lovers", "caught between", "jealous", "rival", "choose between"], minMatches: 1 },
  { tag: "forbidden-knowledge", keywords: ["forbidden knowledge", "secret", "ancient", "occult", "hidden truth", "taboo knowledge", "arcane", "eldritch"], minMatches: 2 },
  { tag: "legacy", keywords: ["legacy", "inherit", "dynasty", "generation", "ancestor", "heir", "lineage", "bloodline", "succession"], minMatches: 2 },
  { tag: "addiction", keywords: ["addict", "substance", "drug", "alcohol", "depend", "withdrawal", "sober", "relapse", "overdose"], minMatches: 2 },
  { tag: "faith", keywords: ["faith", "religion", "god", "pray", "divine", "church", "temple", "belief", "devout", "spiritual"], minMatches: 2 },
  { tag: "duty", keywords: ["duty", "honor", "obligation", "sworn", "oath", "serve", "protec", "responsibility", "charge"], minMatches: 2 },
  { tag: "jealousy", keywords: ["jealous", "envy", "covet", "rival", "resent", "bitter", "green-eyed", "possessive"], minMatches: 2 },
  { tag: "environmentalism", keywords: ["environment", "nature", "pollut", "climate", "ecolog", "deforest", "extinct", "planet", "ecosystem"], minMatches: 2 },
  { tag: "colonialism", keywords: ["colonial", "empire", "conquer", "native", "indigenous", "settler", "occupat", "imperialist", "exploit"], minMatches: 2 },
  { tag: "justice", keywords: ["justice", "injustice", "court", "trial", "verdict", "innocent", "wrongly accused", "law", "fair"], minMatches: 2 },

  // ── Settings ──
  { tag: "dystopian", keywords: ["dystopi", "totalitarian", "surveillance", "authoritarian", "oppressive regime", "big brother", "controlled society"], minMatches: 2 },
  { tag: "medieval", keywords: ["medieval", "knight", "castle", "kingdom", "sword", "throne", "lord", "feudal", "peasant", "dungeon"], minMatches: 2 },
  { tag: "space", keywords: ["space", "galactic", "starship", "planet", "asteroid", "orbit", "cosmos", "alien", "interstellar", "nebula"], minMatches: 2 },
  { tag: "noir", keywords: ["noir", "detective", "femme fatale", "shadows", "crime", "dark streets", "hard-boiled", "gumshoe", "seedy", "smoke-filled"], minMatches: 2 },
  { tag: "steampunk", keywords: ["steampunk", "clockwork", "steam", "victorian", "brass", "gear", "airship", "automaton", "mechanical"], minMatches: 2 },
  { tag: "gothic", keywords: ["gothic", "dark", "mansion", "haunted", "shadow", "macabre", "decay", "sinister", "ominous", "gargoyle"], genreGate: ["horror", "drama", "thriller", "mystery", "romance"], minMatches: 2 },
  { tag: "near-future", keywords: ["near future", "not far from now", "tomorrow", "2030", "2040", "2050", "modern day", "contemporary sci-fi"], minMatches: 1 },
  { tag: "alternate-history", keywords: ["alternate history", "what if", "parallel", "diverge", "historical fiction", "reimagin"], minMatches: 2 },
  { tag: "small-town", keywords: ["small town", "village", "rural", "community", "townsfolk", "quaint", "neighborhood", "local"], minMatches: 2 },
  { tag: "dreamscape", keywords: ["dream", "subconscious", "surreal", "nightmare", "lucid", "sleep", "vision", "hallucinat"], genreGate: ["sci-fi", "fantasy", "psychological", "drama", "science fiction"], minMatches: 2 },
  { tag: "school", keywords: ["school", "student", "teacher", "classroom", "campus", "university", "college", "academy", "professor"], minMatches: 2 },
  { tag: "wilderness", keywords: ["wilderness", "forest", "mountain", "jungle", "untamed", "wild", "nature", "expedition", "trek", "outback"], minMatches: 2 },
  { tag: "prison", keywords: ["prison", "jail", "inmate", "warden", "cell", "sentence", "incarcerat", "escape", "lockup", "penitentiary"], minMatches: 2 },
  { tag: "warzone", keywords: ["warzone", "battlefield", "front line", "trench", "combat zone", "siege", "bombardment", "evacuat"], minMatches: 2 },
  { tag: "virtual-world", keywords: ["virtual", "simulation", "matrix", "digital world", "cyberspace", "avatar", "VR", "game world", "logged in"], minMatches: 2 },
  { tag: "haunted", keywords: ["haunt", "ghost", "spirit", "paranormal", "poltergeist", "apparition", "phantom", "specter", "supernatural presence"], minMatches: 2 },
  { tag: "multiverse", keywords: ["multiverse", "parallel universe", "dimension", "alternate reality", "portal", "other world", "crossing over"], minMatches: 2 },
  { tag: "desert", keywords: ["desert", "sand", "dune", "oasis", "arid", "barren", "scorching", "sandstorm", "nomad"], minMatches: 2 },
  { tag: "ocean", keywords: ["ocean", "sea", "ship", "sail", "captain", "harbor", "coast", "island", "maritime", "naval"], minMatches: 2 },
  { tag: "victorian", keywords: ["victorian", "19th century", "1800s", "gaslight", "corset", "gentleman", "london", "industrial revolution"], minMatches: 2 },
  { tag: "urban", keywords: ["city", "urban", "metropolis", "downtown", "streets", "skyline", "apartment", "nightlife", "subway"], minMatches: 3 },
  { tag: "kingdom", keywords: ["kingdom", "king", "queen", "prince", "princess", "royal", "crown", "court", "palace", "realm"], minMatches: 2 },
  { tag: "cosmic", keywords: ["cosmic", "universe", "infinite", "void", "celestial", "astral", "eternal", "beyond comprehension"], minMatches: 2 },
  { tag: "arctic", keywords: ["arctic", "ice", "frozen", "tundra", "blizzard", "polar", "glacier", "frostbite", "snow"], minMatches: 2 },

  // ── Characters ──
  { tag: "anti-hero", keywords: ["anti-hero", "antihero", "morally ambiguous", "flawed hero", "reluctant", "dark past", "questionable methods"], minMatches: 2 },
  { tag: "morally-gray", keywords: ["moral", "gray", "ambiguous", "complex", "neither good nor bad", "shades of", "ethical", "dilemma"], minMatches: 2 },
  { tag: "ensemble-cast", keywords: ["ensemble", "group of", "team", "gang", "crew", "band of", "cast of", "multiple characters"], minMatches: 2 },
  { tag: "lone-wolf", keywords: ["lone", "solo", "solitary", "loner", "outcast", "drifter", "wanderer", "hermit", "recluse"], minMatches: 2 },
  { tag: "mentor-student", keywords: ["mentor", "teacher", "student", "apprentice", "master", "disciple", "trains", "teach", "guide"], minMatches: 2 },
  { tag: "reluctant-hero", keywords: ["reluctant", "unwilling", "dragged into", "forced to", "didn't ask for", "ordinary person"], minMatches: 2 },
  { tag: "chosen-one", keywords: ["chosen", "prophecy", "destined", "foretold", "special power", "the one", "savior", "messiah"], minMatches: 2 },
  { tag: "underdog", keywords: ["underdog", "overlooked", "underestimate", "unlikely", "nobody", "against all odds", "impossible"], minMatches: 2 },
  { tag: "genius-protagonist", keywords: ["genius", "brilliant", "prodigy", "intellect", "mastermind", "gifted", "exceptional mind"], minMatches: 2 },
  { tag: "tragic-hero", keywords: ["tragic", "downfall", "hubris", "fatal flaw", "doomed", "inevitable end", "fall from grace"], minMatches: 2 },
  { tag: "villain-protagonist", keywords: ["villain", "antagonist", "evil", "dark side", "criminal mastermind", "bad guy"], minMatches: 2 },

  // ── Tone ──
  { tag: "philosophical", keywords: ["philosoph", "meaning", "existential", "moral", "ethical", "question", "contemplate", "ponder", "reflect"], minMatches: 2 },
  { tag: "satirical", keywords: ["satir", "parody", "mock", "ironi", "lampoon", "send-up", "spoof", "tongue-in-cheek"], minMatches: 2 },
  { tag: "melancholic", keywords: ["melanchol", "sadness", "sorrow", "wistful", "longing", "bittersweet", "pensive", "mournful"], minMatches: 2 },
  { tag: "tense", keywords: ["tense", "tension", "edge of seat", "nerve", "gripping", "nail-biting", "heart-pounding", "anxiety"], minMatches: 2 },
  { tag: "brutal", keywords: ["brutal", "violent", "gore", "savage", "merciless", "ruthless", "graphic", "unflinching", "visceral"], minMatches: 2 },
  { tag: "eerie", keywords: ["eerie", "creepy", "unsettling", "disturb", "unnerving", "sinister", "ominous", "chilling", "macabre"], minMatches: 2 },
  { tag: "cozy", keywords: ["cozy", "warm", "comfort", "gentle", "soothing", "peaceful", "heartwarming", "charming", "delightful"], minMatches: 2 },
  { tag: "whimsical", keywords: ["whimsical", "magical", "fantastical", "fairy", "enchant", "wonder", "playful", "fanciful"], minMatches: 2 },
  { tag: "hopeful", keywords: ["hope", "optimis", "bright", "inspire", "uplift", "triumph", "overcome", "persever", "light"], minMatches: 2 },
  { tag: "nostalgic", keywords: ["nostalgi", "remember", "those days", "back when", "childhood", "memories", "retro", "vintage"], minMatches: 2 },
  { tag: "suspenseful", keywords: ["suspens", "thriller", "mystery", "who", "twist", "clue", "revelation", "unravel", "shocking"], minMatches: 2 },
  { tag: "darkly-comic", keywords: ["dark comedy", "black humor", "gallows", "morbid", "twisted humor", "absurd", "ironic"], minMatches: 2 },
  { tag: "intimate", keywords: ["intimate", "personal", "vulnerable", "confessional", "raw", "honest", "emotional", "heart"], minMatches: 2 },
  { tag: "grandiose", keywords: ["epic", "grand", "sweeping", "monumental", "spectacular", "vast", "massive", "ambitious", "scale"], minMatches: 2 },
  { tag: "chaotic", keywords: ["chaotic", "unpredict", "wild", "frantic", "disorder", "anarchy", "mayhem", "madness"], minMatches: 2 },
  { tag: "bleak", keywords: ["bleak", "hopeless", "desolat", "grim", "dark", "oppressive", "suffocating", "dreary", "despair"], minMatches: 3 },
  { tag: "euphoric", keywords: ["euphori", "ecstat", "joy", "elat", "bliss", "exhilarat", "thrilling", "transcendent"], minMatches: 2 },
  { tag: "haunting", keywords: ["haunt", "linger", "unforgettable", "stay with you", "echo", "resonat", "powerful", "profound"], minMatches: 2 },
  { tag: "bittersweet", keywords: ["bittersweet", "bitterswe", "happy and sad", "mixed emotions", "poignant", "touching", "tearful"], minMatches: 1 },
  { tag: "uplifting", keywords: ["uplift", "inspir", "heartwarming", "feel-good", "triumphant", "joyous", "empowering", "moving"], minMatches: 2 },
  { tag: "cynical", keywords: ["cynical", "jaded", "disillusioned", "skeptic", "pessimist", "sarcastic", "world-weary"], minMatches: 2 },
  { tag: "dreamy", keywords: ["dream", "ethereal", "floaty", "surreal", "hazy", "otherworldly", "mesmerizing", "trancelike"], minMatches: 2 },
  { tag: "meditative", keywords: ["meditat", "contemplat", "peaceful", "tranquil", "serene", "mindful", "calm", "reflective"], minMatches: 2 },

  // ── Narrative ──
  { tag: "nonlinear", keywords: ["nonlinear", "out of order", "flashback", "time jump", "chronolog", "timeline", "past and present"], minMatches: 2 },
  { tag: "twist-ending", keywords: ["twist", "shocking ending", "unexpected", "revelation", "didn't see coming", "surprise ending"], minMatches: 2 },
  { tag: "based-on-true-story", keywords: ["based on", "true story", "real events", "inspired by", "biographical", "true account", "actual events"], minMatches: 1 },
  { tag: "heist-structure", keywords: ["heist", "robbery", "steal", "plan", "crew assembl", "one last job", "pulling off", "caper"], minMatches: 2 },
  { tag: "whodunit", keywords: ["whodunit", "detective", "mystery", "suspect", "clue", "investigate", "murder mystery", "case"], minMatches: 2 },
  { tag: "epic-scope", keywords: ["epic", "sweeping", "saga", "spanning", "generations", "world-changing", "monumental", "grand scale"], minMatches: 2 },
  { tag: "multiple-pov", keywords: ["multiple perspectives", "different viewpoints", "each character", "interweaving stories", "parallel stories"], minMatches: 1 },
  { tag: "anthology", keywords: ["anthology", "collection", "short stories", "tales", "episodes", "vignettes", "standalone"], minMatches: 1 },
  { tag: "documentary-style", keywords: ["documentary", "found footage", "mockumentary", "interview", "real footage", "archival"], minMatches: 1 },

  // ── Pacing ──
  { tag: "slow-burn", keywords: ["slow burn", "slow-burn", "gradually", "deliberate", "patient", "builds slowly", "methodical", "unhurried"], minMatches: 1 },
  { tag: "fast-paced", keywords: ["fast-paced", "action-packed", "breakneck", "thrilling", "non-stop", "adrenaline", "relentless", "explosive"], minMatches: 2 },
  { tag: "bingeable", keywords: ["binge", "addictive", "can't stop", "one more episode", "compelling", "page-turner", "gripping"], minMatches: 2 },
  { tag: "cliffhangers", keywords: ["cliffhanger", "suspense", "what happens next", "left hanging", "to be continued", "shocking ending"], minMatches: 2 },
];

/**
 * Run keyword co-occurrence matching on text.
 * Returns tags with computed weights.
 */
export function matchKeywords(
  text: string,
  genres: string[],
): Record<string, number> {
  const lowerText = text.toLowerCase();
  const lowerGenres = new Set(genres.map(g => g.toLowerCase()));
  const result: Record<string, number> = {};

  for (const cluster of KEYWORD_CLUSTERS) {
    let matchCount = 0;

    for (const kw of cluster.keywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        matchCount++;
      }
    }

    if (matchCount < cluster.minMatches) continue;

    // Calculate weight: 0.25 base + 0.15 per match, capped at 0.85
    let weight = Math.min(0.85, 0.25 + matchCount * 0.15);

    // Genre gate check
    if (cluster.genreGate && cluster.genreGate.length > 0) {
      const gateMatch = cluster.genreGate.some(g => lowerGenres.has(g));
      if (!gateMatch) {
        weight *= 0.5; // halve weight if genre doesn't match
      }
    }

    if (weight >= 0.2) {
      result[cluster.tag] = weight;
    }
  }

  return result;
}
