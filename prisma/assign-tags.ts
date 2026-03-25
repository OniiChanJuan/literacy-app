/**
 * Batch assign weighted tags to all items.
 * Runs Layer 2 (keyword co-occurrence) and Layer 3 (genre/vibe inference) on all items.
 * Layer 1 (API tags) requires API calls so is done separately for new items.
 * Also seeds the tags reference table.
 *
 * Run: npx tsx prisma/assign-tags.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DB_URL = "postgresql://postgres:Baylorlawsucks2021@db.shlyuoeabdaifketvaeo.supabase.co:5432/postgres";
const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

// Import tag system (compiled from TypeScript)
// We'll inline the logic here since we can't import .ts directly in all setups

// ── Keyword clusters (subset of the full list for batch processing) ──
interface KeywordCluster {
  tag: string;
  keywords: string[];
  genreGate?: string[];
  minMatches: number;
}

const KEYWORD_CLUSTERS: KeywordCluster[] = [
  // Themes
  { tag: "revenge", keywords: ["revenge", "avenge", "vendetta", "retribution", "payback", "vengeance", "grudge"], minMatches: 2 },
  { tag: "survival", keywords: ["surviv", "endure", "desperate", "last hope", "against all odds", "stranded", "trapped"], minMatches: 2 },
  { tag: "coming-of-age", keywords: ["grow up", "adolescen", "teen", "youth", "school", "first love", "coming of age", "childhood"], genreGate: ["drama", "comedy", "romance", "slice of life"], minMatches: 2 },
  { tag: "betrayal", keywords: ["betray", "traitor", "backstab", "double-cross", "trust", "deceive", "conspiracy", "treachery"], minMatches: 2 },
  { tag: "redemption", keywords: ["redeem", "redemption", "atone", "second chance", "forgive", "sins", "past mistakes"], minMatches: 2 },
  { tag: "identity", keywords: ["identity", "who am i", "self", "consciousness", "soul", "human", "persona"], genreGate: ["sci-fi", "drama", "thriller", "psychological", "science fiction"], minMatches: 2 },
  { tag: "found-family", keywords: ["found family", "band of", "crew", "team", "together", "brotherhood", "orphan", "ragtag", "companion", "fellowship"], minMatches: 2 },
  { tag: "war", keywords: ["war", "battle", "soldier", "military", "army", "combat", "troops", "invasion", "warfare"], minMatches: 2 },
  { tag: "forbidden-love", keywords: ["forbidden", "taboo", "secret affair", "star-crossed", "impossible love", "unrequited", "doomed love"], minMatches: 2 },
  { tag: "cyberpunk", keywords: ["cyber", "hacker", "neural", "implant", "neon", "megacorp", "augment", "android", "synthetic"], genreGate: ["sci-fi", "action", "science fiction", "thriller"], minMatches: 2 },
  { tag: "post-apocalyptic", keywords: ["wasteland", "ruins", "survivor", "fallout", "collapse", "aftermath", "mutant", "bunker", "apocalyp"], genreGate: ["sci-fi", "action", "drama", "science fiction", "horror"], minMatches: 2 },
  { tag: "dystopian", keywords: ["dystopi", "totalitarian", "surveillance", "authoritarian", "oppressive regime", "controlled society"], minMatches: 2 },
  { tag: "medieval", keywords: ["medieval", "knight", "castle", "kingdom", "sword", "throne", "lord", "feudal", "dungeon"], minMatches: 2 },
  { tag: "space", keywords: ["space", "galactic", "starship", "planet", "asteroid", "orbit", "cosmos", "alien", "interstellar"], minMatches: 2 },
  { tag: "noir", keywords: ["noir", "detective", "femme fatale", "shadows", "hard-boiled", "gumshoe", "seedy"], minMatches: 2 },
  { tag: "gothic", keywords: ["gothic", "dark", "mansion", "haunted", "shadow", "macabre", "decay", "sinister"], genreGate: ["horror", "drama", "thriller", "mystery", "romance"], minMatches: 2 },
  { tag: "school", keywords: ["school", "student", "teacher", "classroom", "campus", "university", "college", "academy"], minMatches: 2 },
  { tag: "prison", keywords: ["prison", "jail", "inmate", "warden", "cell", "sentence", "incarcerat", "escape"], minMatches: 2 },
  { tag: "haunted", keywords: ["haunt", "ghost", "spirit", "paranormal", "poltergeist", "apparition", "phantom"], minMatches: 2 },
  { tag: "multiverse", keywords: ["multiverse", "parallel universe", "dimension", "alternate reality", "portal", "other world"], minMatches: 2 },
  { tag: "desert", keywords: ["desert", "sand", "dune", "oasis", "arid", "barren", "scorching", "sandstorm"], minMatches: 2 },
  { tag: "ocean", keywords: ["ocean", "sea", "ship", "sail", "captain", "harbor", "coast", "island", "maritime"], minMatches: 2 },
  { tag: "anti-hero", keywords: ["anti-hero", "antihero", "morally ambiguous", "flawed hero", "dark past", "questionable methods"], minMatches: 2 },
  { tag: "morally-gray", keywords: ["moral", "gray", "ambiguous", "complex", "neither good nor bad", "shades of", "dilemma"], minMatches: 2 },
  { tag: "ensemble-cast", keywords: ["ensemble", "group of", "team", "gang", "crew", "band of", "cast of", "multiple characters"], minMatches: 2 },
  { tag: "lone-wolf", keywords: ["lone", "solo", "solitary", "loner", "outcast", "drifter", "wanderer"], minMatches: 2 },
  { tag: "chosen-one", keywords: ["chosen", "prophecy", "destined", "foretold", "special power", "the one", "savior"], minMatches: 2 },
  { tag: "underdog", keywords: ["underdog", "overlooked", "underestimate", "unlikely", "nobody", "against all odds"], minMatches: 2 },
  { tag: "philosophical", keywords: ["philosoph", "meaning", "existential", "moral", "ethical", "contemplate", "ponder", "reflect"], minMatches: 2 },
  { tag: "brutal", keywords: ["brutal", "violent", "gore", "savage", "merciless", "ruthless", "graphic", "visceral"], minMatches: 2 },
  { tag: "cozy", keywords: ["cozy", "warm", "comfort", "gentle", "soothing", "peaceful", "heartwarming", "charming"], minMatches: 2 },
  { tag: "eerie", keywords: ["eerie", "creepy", "unsettling", "disturb", "unnerving", "sinister", "ominous", "chilling"], minMatches: 2 },
  { tag: "suspenseful", keywords: ["suspens", "thriller", "mystery", "twist", "clue", "revelation", "unravel", "shocking"], minMatches: 2 },
  { tag: "melancholic", keywords: ["melanchol", "sadness", "sorrow", "wistful", "longing", "bittersweet", "pensive"], minMatches: 2 },
  { tag: "tense", keywords: ["tense", "tension", "edge of seat", "nerve", "gripping", "nail-biting", "heart-pounding"], minMatches: 2 },
  { tag: "hopeful", keywords: ["hope", "optimis", "bright", "inspire", "uplift", "triumph", "overcome"], minMatches: 2 },
  { tag: "darkly-comic", keywords: ["dark comedy", "black humor", "gallows", "morbid", "twisted humor", "absurd", "ironic"], minMatches: 2 },
  { tag: "intimate", keywords: ["intimate", "personal", "vulnerable", "confessional", "raw", "honest", "emotional"], minMatches: 2 },
  { tag: "chaotic", keywords: ["chaotic", "unpredict", "wild", "frantic", "disorder", "anarchy", "mayhem"], minMatches: 2 },
  { tag: "twist-ending", keywords: ["twist", "shocking ending", "unexpected", "revelation", "surprise ending"], minMatches: 2 },
  { tag: "based-on-true-story", keywords: ["based on", "true story", "real events", "inspired by", "biographical", "actual events"], minMatches: 1 },
  { tag: "heist-structure", keywords: ["heist", "robbery", "steal", "plan", "crew assembl", "one last job", "caper"], minMatches: 2 },
  { tag: "whodunit", keywords: ["whodunit", "detective", "mystery", "suspect", "clue", "investigate", "murder mystery"], minMatches: 2 },
  { tag: "slow-burn", keywords: ["slow burn", "slow-burn", "gradually", "deliberate", "patient", "builds slowly"], minMatches: 1 },
  { tag: "fast-paced", keywords: ["fast-paced", "action-packed", "breakneck", "thrilling", "non-stop", "adrenaline", "explosive"], minMatches: 2 },
  { tag: "bingeable", keywords: ["binge", "addictive", "can't stop", "one more episode", "compelling", "page-turner"], minMatches: 2 },
  { tag: "power", keywords: ["power", "control", "dominat", "authority", "throne", "ruler", "reign", "empire", "conquer"], minMatches: 2 },
  { tag: "freedom", keywords: ["freedom", "liberty", "free", "escape", "liberation", "chains", "captive"], minMatches: 2 },
  { tag: "sacrifice", keywords: ["sacrifice", "give up", "lay down", "noble death", "ultimate price", "selfless", "martyr"], minMatches: 2 },
  { tag: "obsession", keywords: ["obsess", "consume", "fixat", "compuls", "driven", "relentless pursuit", "mania"], minMatches: 2 },
  { tag: "memory", keywords: ["memory", "remember", "forget", "amnesia", "past", "flashback", "recall", "erased"], minMatches: 2 },
  { tag: "rebellion", keywords: ["rebel", "revolt", "revolution", "uprising", "resist", "defy", "overthrow", "insurgent"], minMatches: 2 },
  { tag: "corruption", keywords: ["corrupt", "bribe", "scandal", "crooked", "graft", "abuse of power", "cover-up"], minMatches: 2 },
  { tag: "grief", keywords: ["grief", "mourn", "loss", "bereave", "funeral", "death of", "passed away", "cope"], minMatches: 2 },
  { tag: "trauma", keywords: ["trauma", "ptsd", "haunt", "scar", "damaged", "broken", "nightmar", "triggered"], minMatches: 2 },
  { tag: "deception", keywords: ["decei", "lie", "fake", "fraud", "imperson", "disguise", "con", "trick", "manipulat"], minMatches: 2 },
  { tag: "paranoia", keywords: ["paranoi", "suspic", "trust no one", "conspir", "spy", "surveil"], minMatches: 2 },
  { tag: "political-intrigue", keywords: ["politic", "intrigue", "scheme", "alliance", "diplomat", "court", "faction"], minMatches: 2 },
  { tag: "underworld", keywords: ["mafia", "gang", "cartel", "crime boss", "syndicate", "smuggl", "mob", "hitman"], minMatches: 2 },
  { tag: "family", keywords: ["family", "father", "mother", "son", "daughter", "sibling", "parent", "child", "brother", "sister"], minMatches: 3 },
  { tag: "grandiose", keywords: ["epic", "grand", "sweeping", "monumental", "spectacular", "vast", "massive", "ambitious"], minMatches: 2 },
  { tag: "urban", keywords: ["city", "urban", "metropolis", "downtown", "streets", "skyline", "nightlife"], minMatches: 3 },
  { tag: "uplifting", keywords: ["uplift", "inspir", "heartwarming", "feel-good", "triumphant", "joyous", "empowering"], minMatches: 2 },
  { tag: "bleak", keywords: ["bleak", "hopeless", "desolat", "grim", "oppressive", "suffocating", "despair"], minMatches: 3 },
  { tag: "wilderness", keywords: ["wilderness", "forest", "mountain", "jungle", "untamed", "wild", "nature"], minMatches: 2 },
  { tag: "kingdom", keywords: ["kingdom", "king", "queen", "prince", "princess", "royal", "crown", "palace", "realm"], minMatches: 2 },
  { tag: "tech-vs-humanity", keywords: ["artificial", "robot", "android", "cyborg", "machine", "AI", "singularity", "sentient"], genreGate: ["sci-fi", "science fiction", "thriller", "drama"], minMatches: 2 },
  { tag: "fate-vs-choice", keywords: ["fate", "destiny", "prophecy", "chosen", "predestined", "inevitable", "free will"], minMatches: 2 },
  { tag: "mortality", keywords: ["death", "dying", "mortal", "afterlife", "terminal", "funeral", "finality"], minMatches: 2 },
  { tag: "isolation", keywords: ["isolat", "alone", "lonely", "solitary", "withdrawn", "exile", "abandoned"], minMatches: 2 },
  { tag: "loyalty", keywords: ["loyal", "devot", "allegianc", "faithful", "honor", "oath", "pledge", "unwavering"], minMatches: 2 },
  { tag: "transformation", keywords: ["transform", "metamorph", "evolve", "change", "becom", "transition", "mutation", "rebirth"], minMatches: 2 },
  { tag: "existentialism", keywords: ["exist", "meaning", "purpose", "void", "nihil", "absurd", "consciousness", "nothingness"], genreGate: ["drama", "sci-fi", "science fiction", "psychological"], minMatches: 2 },
  { tag: "class-struggle", keywords: ["class", "wealth", "poverty", "rich", "poor", "inequality", "privilege", "oppressed"], minMatches: 2 },
  { tag: "guilt", keywords: ["guilt", "remorse", "conscience", "regret", "haunt", "sin", "burden", "shame"], minMatches: 2 },
  { tag: "self-discovery", keywords: ["discover", "find myself", "journey", "purpose", "soul search", "introspect", "identity"], minMatches: 2 },
  { tag: "madness", keywords: ["mad", "insane", "lunatic", "sanity", "psycho", "unhinged", "derang", "hysteria"], minMatches: 2 },
  { tag: "ambition", keywords: ["ambit", "aspir", "driven", "climb", "success", "strive", "determined", "relentless"], minMatches: 2 },
  { tag: "justice", keywords: ["justice", "injustice", "court", "trial", "verdict", "innocent", "wrongly accused"], minMatches: 2 },
  { tag: "addiction", keywords: ["addict", "substance", "drug", "alcohol", "depend", "withdrawal", "sober", "relapse"], minMatches: 2 },
  { tag: "faith", keywords: ["faith", "religion", "god", "pray", "divine", "church", "belief", "devout"], minMatches: 2 },
  { tag: "legacy", keywords: ["legacy", "inherit", "dynasty", "generation", "ancestor", "heir", "lineage", "succession"], minMatches: 2 },
  { tag: "duty", keywords: ["duty", "honor", "obligation", "sworn", "oath", "serve", "responsibility"], minMatches: 2 },
  { tag: "satirical", keywords: ["satir", "parody", "mock", "ironi", "lampoon", "spoof", "tongue-in-cheek"], minMatches: 2 },
  { tag: "nostalgic", keywords: ["nostalgi", "remember", "those days", "back when", "childhood", "memories", "retro"], minMatches: 2 },
  { tag: "whimsical", keywords: ["whimsical", "magical", "fantastical", "fairy", "enchant", "wonder", "playful"], minMatches: 2 },
  { tag: "dreamy", keywords: ["dream", "ethereal", "floaty", "surreal", "hazy", "otherworldly", "mesmerizing"], minMatches: 2 },
];

// ── Genre/vibe → tag inference ──
const GENRE_TAG_MAP: Record<string, string[]> = {
  "sci-fi": ["near-future"], "science fiction": ["near-future"],
  "fantasy": ["medieval"], "dark fantasy": ["medieval", "brutal"],
  "horror": ["eerie", "tense"], "thriller": ["suspenseful", "tense"],
  "mystery": ["mystery-box", "whodunit"], "crime": ["underworld"],
  "romance": ["intimate"], "drama": ["intimate"],
  "comedy": ["playful"], "action": ["fast-paced"],
  "adventure": ["exploration"], "western": ["rural"],
  "war": ["war", "warzone"], "historical": ["ancient-world"],
  "documentary": ["documentary-style", "based-on-true-story"],
  "animation": ["whimsical"], "family": ["family", "cozy"],
  "psychological": ["philosophical", "tense"],
};

const VIBE_TAG_MAP: Record<string, string> = {
  "dark": "bleak", "atmospheric": "meditative", "mind-bending": "philosophical",
  "slow burn": "slow-burn", "thought-provoking": "philosophical",
  "emotional": "intimate", "epic": "grandiose", "intense": "tense",
  "wholesome": "cozy", "gritty": "brutal", "heartbreaking": "melancholic",
  "satirical": "satirical", "surreal": "dreamscape", "brutal": "brutal",
  "uplifting": "uplifting", "chaotic": "chaotic", "immersive": "dense",
  "melancholic": "melancholic", "stylish": "noir", "cozy": "cozy",
  "cerebral": "philosophical", "heartfelt": "sincere", "funny": "playful",
  "fast-paced": "fast-paced",
};

const MUSIC_GENRE_TAG: Record<string, string> = {
  "hip-hop": "hip-hop", "rock": "rock", "pop": "pop",
  "electronic": "electronic", "r&b": "rnb", "metal": "metal",
  "jazz": "jazz", "classical": "classical", "indie": "indie-rock",
  "punk": "punk", "alternative": "alternative", "country": "country",
  "folk": "folk", "latin": "latin", "k-pop": "k-pop",
  "soul": "soul", "funk": "funk", "blues": "blues", "ambient": "ambient",
};

// Tag type enforcement
const TAG_TYPE_RESTRICTIONS: Record<string, string[]> = {
  // Music-only
  "hip-hop": ["music"], "rock": ["music"], "pop": ["music"], "electronic": ["music"],
  "rnb": ["music"], "metal": ["music"], "jazz": ["music"], "classical": ["music"],
  "indie-rock": ["music"], "punk": ["music"], "alternative": ["music"],
  "country": ["music"], "latin": ["music"], "k-pop": ["music"], "soul": ["music"],
  "funk": ["music"], "blues": ["music"], "ambient": ["music"],
  "concept-album": ["music"], "lyrical": ["music"], "conscious-rap": ["music"],
  "acoustic": ["music"], "instrumental": ["music"],
  // Game-only
  "open-world": ["game"], "single-player": ["game"], "multiplayer": ["game"],
  "co-op": ["game"], "souls-like": ["game"], "roguelike": ["game"],
  "metroidvania": ["game"], "puzzle": ["game"], "sandbox": ["game"],
  "narrative-driven": ["game"], "jrpg": ["game"], "wrpg": ["game"],
  "platformer": ["game"], "shooter": ["game"], "strategy": ["game"],
  "simulation": ["game"], "turn-based": ["game"], "stealth": ["game"],
  "hack-and-slash": ["game"], "survival-game": ["game"], "horror-survival": ["game"],
  // Anime/manga-only
  "isekai": ["manga"], "shonen": ["manga"], "seinen": ["manga"],
  "shojo": ["manga"], "mecha": ["manga"], "slice-of-life": ["manga"],
  "school-life": ["manga"], "battle-manga": ["manga"], "power-system": ["manga"],
  // TV-only
  "prestige-tv": ["tv"], "sitcom": ["tv"], "procedural": ["tv"],
  "limited-series": ["tv"], "anthology-series": ["tv"],
  // Book-only
  "literary-fiction": ["book"], "page-turner": ["book"],
  // Podcast-only
  "true-crime": ["podcast"], "interview-format": ["podcast"],
  "conversational": ["podcast"], "educational": ["podcast"],
  // Comic-only
  "superhero": ["comic"], "graphic-novel": ["comic"],
};

function tagAppliesTo(slug: string, type: string): boolean {
  const restrictions = TAG_TYPE_RESTRICTIONS[slug];
  if (!restrictions) return true; // universal
  return restrictions.includes(type);
}

interface WeightedTag { weight: number; category: string; }
type ItemTags = Record<string, WeightedTag>;

function assignTagsForItem(
  title: string, description: string, genres: string[], vibes: string[], type: string,
): ItemTags {
  const tags: Record<string, number[]> = {};

  const addTag = (slug: string, weight: number) => {
    if (!tagAppliesTo(slug, type)) return;
    if (!tags[slug]) tags[slug] = [];
    tags[slug].push(weight);
  };

  // Layer 2: Keyword co-occurrence
  const text = `${title} ${description}`.toLowerCase();
  const lowerGenres = new Set(genres.map(g => g.toLowerCase()));

  for (const cluster of KEYWORD_CLUSTERS) {
    let matchCount = 0;
    for (const kw of cluster.keywords) {
      if (text.includes(kw.toLowerCase())) matchCount++;
    }
    if (matchCount < cluster.minMatches) continue;
    let weight = Math.min(0.85, 0.25 + matchCount * 0.15);
    if (cluster.genreGate?.length) {
      const gateMatch = cluster.genreGate.some(g => lowerGenres.has(g));
      if (!gateMatch) weight *= 0.5;
    }
    if (weight >= 0.2) addTag(cluster.tag, weight);
  }

  // Layer 3: Genre inference
  for (const [genre, tagSlugs] of Object.entries(GENRE_TAG_MAP)) {
    if (lowerGenres.has(genre)) {
      for (const slug of tagSlugs) addTag(slug, 0.5);
    }
  }

  // Vibe inference
  const lowerVibes = new Set(vibes.map(v => v.toLowerCase()));
  for (const [vibe, slug] of Object.entries(VIBE_TAG_MAP)) {
    if (lowerVibes.has(vibe)) addTag(slug, 0.55);
  }

  // Music genre inference
  if (type === "music") {
    for (const [g, slug] of Object.entries(MUSIC_GENRE_TAG)) {
      if (lowerGenres.has(g)) addTag(slug, 0.7);
    }
  }

  // Merge: max weight + 0.05 per additional layer, cap 0.95
  const result: ItemTags = {};
  for (const [slug, weights] of Object.entries(tags)) {
    const maxW = Math.max(...weights);
    const bonus = (weights.length - 1) * 0.05;
    const finalW = Math.min(0.95, maxW + bonus);
    if (finalW < 0.2) continue;

    // Determine category
    let category = "theme";
    if (["cyberpunk","post-apocalyptic","medieval","space","urban","dystopian","noir","steampunk","gothic","near-future","school","prison","haunted","multiverse","desert","ocean","wilderness","kingdom","warzone","dreamscape","victorian","arctic","cosmic","rural","tropical","underground","suburban","industrial","labyrinth","alternate-history","small-town","underwater","ancient-world","virtual-world"].includes(slug)) category = "setting";
    else if (["anti-hero","morally-gray","ensemble-cast","lone-wolf","chosen-one","underdog","villain-protagonist","tragic-hero","mentor-student","reluctant-hero","genius-protagonist","duo","strong-female-lead","competent-protagonist","fish-out-of-water","femme-fatale","unreliable-narrator","tragic-villain","child-protagonist","rivals-to-allies","lovable-rogue","silent-protagonist","monster-protagonist"].includes(slug)) category = "character";
    else if (["philosophical","satirical","absurdist","melancholic","hopeful","tense","cozy","brutal","whimsical","eerie","nostalgic","intimate","grandiose","chaotic","meditative","haunting","bittersweet","suspenseful","playful","dreamy","cynical","uplifting","oppressive","darkly-comic","sincere","irreverent","foreboding","sentimental","bleak","euphoric"].includes(slug)) category = "tone";
    else if (["nonlinear","multiple-pov","anthology","mystery-box","slow-reveal","twist-ending","open-ended","tragic-ending","based-on-true-story","frame-story","first-person","epic-scope","minimalist","documentary-style","breaking-fourth-wall","in-media-res","parallel-timelines","flashback-heavy","whodunit","heist-structure"].includes(slug)) category = "narrative";
    else if (["slow-burn","fast-paced","episodic","serialized","standalone","long-running-series","trilogy","short-and-sweet","dense","bingeable","cliffhangers","monster-of-the-week","crescendo-ending","quiet-moments","relentless","steady-build"].includes(slug)) category = "pacing";
    else if (TAG_TYPE_RESTRICTIONS[slug]) {
      const r = TAG_TYPE_RESTRICTIONS[slug][0];
      category = r === "music" ? "music" : r === "game" ? "game" : r === "manga" ? "anime" : r === "tv" ? "tv" : r === "book" ? "book" : r === "podcast" ? "podcast" : r === "comic" ? "comic" : "theme";
    }

    result[slug] = { weight: Math.round(finalW * 100) / 100, category };
  }

  return result;
}

// ── Tag definitions to seed ──
import { TAG_DEFINITIONS } from "../src/lib/tags/tag-definitions";

async function seedTagsTable() {
  console.log("Seeding tags reference table...");
  let created = 0;

  for (const def of TAG_DEFINITIONS) {
    try {
      await prisma.tag.upsert({
        where: { slug: def.slug },
        update: { displayName: def.displayName, category: def.category, appliesTo: def.appliesTo },
        create: { slug: def.slug, displayName: def.displayName, category: def.category, appliesTo: def.appliesTo },
      });
      created++;
    } catch (e: any) {
      // Skip duplicates
    }
  }

  console.log(`  Seeded ${created} tag definitions`);
}

async function main() {
  // Seed tags table first
  await seedTagsTable();

  // Fetch all items
  const items = await prisma.item.findMany({
    select: {
      id: true, title: true, type: true, description: true,
      genre: true, vibes: true, itemTags: true,
    },
  });

  console.log(`\nAssigning tags for ${items.length} items...`);

  let updated = 0;
  let skipped = 0;
  const tagCounts: Record<string, number> = {};
  const typeStats: Record<string, { total: number; tagged: number; tagCount: number }> = {};

  for (const item of items) {
    const tags = assignTagsForItem(
      item.title,
      item.description,
      item.genre,
      item.vibes,
      item.type,
    );

    const tagCount = Object.keys(tags).length;

    // Track stats
    if (!typeStats[item.type]) typeStats[item.type] = { total: 0, tagged: 0, tagCount: 0 };
    typeStats[item.type].total++;
    if (tagCount > 0) typeStats[item.type].tagged++;
    typeStats[item.type].tagCount += tagCount;

    for (const slug of Object.keys(tags)) {
      tagCounts[slug] = (tagCounts[slug] || 0) + 1;
    }

    if (tagCount === 0) {
      skipped++;
      continue;
    }

    // Merge with existing tags (keep higher weights)
    const existingTags = (item.itemTags as unknown as ItemTags) || {};
    const merged: ItemTags = { ...existingTags };
    for (const [slug, tag] of Object.entries(tags)) {
      if (!merged[slug] || merged[slug].weight < tag.weight) {
        merged[slug] = tag;
      }
    }

    await prisma.item.update({
      where: { id: item.id },
      data: { itemTags: merged as any },
    });
    updated++;

    if ((updated + skipped) % 200 === 0) {
      console.log(`  ${updated + skipped}/${items.length} (${updated} updated, ${skipped} no tags)`);
    }
  }

  // Report
  console.log(`\n═══ RESULTS ═══`);
  console.log(`Total: ${items.length} items`);
  console.log(`Updated: ${updated}, Skipped (no tags): ${skipped}`);

  console.log(`\n── Per-type stats ──`);
  for (const [type, stats] of Object.entries(typeStats)) {
    const avg = stats.tagged > 0 ? (stats.tagCount / stats.tagged).toFixed(1) : "0";
    console.log(`  ${type}: ${stats.tagged}/${stats.total} tagged, avg ${avg} tags/item`);
  }

  const lowTagItems = items.filter(i => {
    const tags = assignTagsForItem(i.title, i.description, i.genre, i.vibes, i.type);
    return Object.keys(tags).length > 0 && Object.keys(tags).length < 3;
  }).length;
  console.log(`\nItems with < 3 tags: ${lowTagItems}`);

  // Top 20 most used tags
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  console.log(`\n── Top 20 tags ──`);
  for (const [slug, count] of sorted.slice(0, 20)) {
    console.log(`  ${slug}: ${count} items`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
