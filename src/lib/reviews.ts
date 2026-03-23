import type { RecTag } from "./data";

export interface Review {
  username: string;
  avatarColor: string;
  rating: number;
  rec: RecTag;
  text: string;
  daysAgo: number;
}

export interface AggregateScore {
  avg: string;
  count: number;
  dist: [number, number, number, number, number];
  recPct: number;
}

// ── Deterministic seed so reviews are stable across renders ──────────────
function seed(id: number, n: number): number {
  return Math.abs(Math.sin(id * 7.13 + n * 3.77));
}

// ── Fake usernames ──────────────────────────────────────────────────────
const USERNAMES = [
  "nova_sky", "idle_hands", "reelthoughts", "pagecrawler",
  "synthwave99", "couch_critic", "inkblot", "ctrl_alt_defeat",
  "bassline", "the_librarian", "pixel_pilgrim", "chapter_one",
  "vinyl_ghost", "deep_focus", "joystick_poet", "scroll_sage",
];

const AVATAR_COLORS = [
  "linear-gradient(135deg, #E84855, #C45BAA)",
  "linear-gradient(135deg, #3185FC, #2EC4B6)",
  "linear-gradient(135deg, #9B5DE5, #00BBF9)",
  "linear-gradient(135deg, #F9A620, #E84855)",
  "linear-gradient(135deg, #2EC4B6, #3185FC)",
  "linear-gradient(135deg, #FF6B6B, #9B5DE5)",
  "linear-gradient(135deg, #C45BAA, #3185FC)",
  "linear-gradient(135deg, #00BBF9, #2EC4B6)",
];

// ── Review text templates by star tier ──────────────────────────────────
const REVIEW_TEXT: string[][] = [
  // 1 star
  [
    "Not worth the time. Couldn't get into it at all.",
    "Don't understand the appeal. Really struggled with this one.",
    "One of the most disappointing things I've experienced this year.",
  ],
  // 2 stars
  [
    "Had potential but mostly fell flat. Disappointing.",
    "Struggled to get through this. Some interesting ideas buried under poor execution.",
    "Not terrible but I wouldn't recommend it to anyone.",
  ],
  // 3 stars
  [
    "Decent but uneven. Does what it sets out to do, nothing more.",
    "Mixed feelings overall. Some genuinely great moments alongside frustrating ones.",
    "Won't revisit but I don't regret the time. Solidly okay.",
    "Not bad, not great. Right down the middle for me.",
    "Has its moments but doesn't quite come together as a whole.",
  ],
  // 4 stars
  [
    "Really solid. Gets almost everything right and keeps you engaged throughout.",
    "Thoroughly enjoyed this. One of the better ones I've experienced lately.",
    "Does something genuinely fresh with familiar material. Impressed.",
    "Almost excellent. A few rough edges away from being a masterpiece.",
    "Went in with low expectations and was pleasantly blown away.",
  ],
  // 5 stars
  [
    "An absolute masterpiece. This will stick with me for a long time.",
    "Can't stop thinking about this. Everything just clicks perfectly.",
    "Rarely does something hit this hard. A genuine work of art.",
    "Best thing I've experienced in years. Make this your next priority.",
    "Perfect from start to finish. Changed how I think about this medium.",
    "Transcendent. This is why I love this medium.",
  ],
];

// ── Generate reviews for a given item ID ────────────────────────────────
export function generateReviews(itemId: number): Review[] {
  const count = 4 + Math.floor(seed(itemId, 0) * 5); // 4-8 reviews
  const reviews: Review[] = [];

  for (let i = 0; i < count; i++) {
    const s = seed(itemId, i + 1);

    // Weight toward higher ratings (most items in the catalog are good)
    const rating = s < 0.04 ? 1
      : s < 0.12 ? 2
      : s < 0.35 ? 3
      : s < 0.70 ? 4
      : 5;

    // Rec tag correlates with rating
    const recRoll = seed(itemId, i + 50);
    const rec: RecTag = rating === 5 ? "recommend"
      : rating === 4 ? (recRoll < 0.85 ? "recommend" : "mixed")
      : rating === 3 ? (recRoll < 0.25 ? "recommend" : recRoll < 0.75 ? "mixed" : "skip")
      : rating === 2 ? (recRoll < 0.1 ? "mixed" : "skip")
      : "skip";

    const texts = REVIEW_TEXT[rating - 1];
    const text = texts[Math.floor(seed(itemId, i + 10) * texts.length)];
    const username = USERNAMES[Math.floor(seed(itemId, i + 20) * USERNAMES.length)];
    const avatarColor = AVATAR_COLORS[Math.floor(seed(itemId, i + 30) * AVATAR_COLORS.length)];
    const daysAgo = 1 + Math.floor(seed(itemId, i + 40) * 90);

    reviews.push({ username, avatarColor, rating, rec, text, daysAgo });
  }

  return reviews;
}

// ── Compute aggregate score from reviews ────────────────────────────────
export function computeAggregate(reviews: Review[]): AggregateScore {
  if (!reviews.length) {
    return { avg: "0.0", count: 0, dist: [0, 0, 0, 0, 0], recPct: 0 };
  }

  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  reviews.forEach((r) => dist[r.rating - 1]++);

  const recs = reviews.filter((r) => r.rec === "recommend").length;

  // Inflate count for realism (our 4-8 reviews represent a larger community)
  const inflatedCount = reviews.length * 13 + 47;

  return {
    avg: (sum / reviews.length).toFixed(1),
    count: inflatedCount,
    dist,
    recPct: Math.round((recs / reviews.length) * 100),
  };
}

// ── Score color helper ──────────────────────────────────────────────────
export function scoreColor(avg: number): string {
  if (avg >= 4) return "var(--score-good)";
  if (avg >= 3) return "var(--score-mid)";
  return "var(--score-poor)";
}
