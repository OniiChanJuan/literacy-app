# CLAUDE.md — Literacy Project Context

## What is Literacy?
Literacy is a cross-media review and recommendation platform. Think Goodreads meets Letterboxd meets MyAnimeList — but for ALL media types at once. The core idea: your taste in one medium reveals what you'd love in another. Rate a sci-fi manga and discover a sci-fi album. Love a dark atmospheric game and find a dark atmospheric book.

**Tagline:** "Fluent in every medium"

## Core Identity (IMPORTANT)
- Literacy is a **review-first platform**, NOT a streaming service. It should feel like Letterboxd/Goodreads, not Netflix.
- Community ratings, reviews, and discussion are the primary content — not just poster browsing.
- The cross-media recommendation engine is the unique selling point.
- The "rabbit hole" experience is central — users should get lost exploring connections between media.

## Supported Media Types
- 🎬 Movies
- 📺 TV Shows
- 📖 Books
- 🗾 Manga
- 💥 Comics
- 🎮 Games
- 🎵 Music
- 🎙️ Podcasts

## Features (V1 — Build These)

### Rating System (Dual)
- **5-star rating** — standard score
- **Recommend / Mixed / Skip** — separate tag alongside stars
- Both are shown on every review and in aggregate on item pages
- Emoji thresholds for aggregate: 👍 = 70%+, 🤷 = 40-69%, 👎 = below 40%
- The recommend % should correlate logically with star averages (4+ stars ≈ 80%+ recommend)

### Community Reviews
- Users write text reviews alongside their star rating + recommend tag
- Each review shows: username, avatar, star rating, recommend emoji, review text, date
- Aggregate community score shown on every item: star average + rating distribution bars + recommend %
- "Helpful" voting on reviews

### Item Detail Pages (Full Page, Not Popup)
- Clicking an item opens a full dedicated page (review website feel, not streaming browse)
- Two-column layout: left = description, vibes, people, awards, platforms. Right = scores, rating, status tracking
- External scores: IMDb, Rotten Tomatoes, Metacritic, IGN, Goodreads, MyAnimeList, Pitchfork (whichever are relevant)
- "Where to watch/read/play/listen" — platform buttons (Netflix, Steam, Kindle, etc.)
- Awards are displayed and in the future should be clickable to browse other winners
- Vibes/tone tags shown prominently and are clickable to browse that vibe

### Hover Preview
- Long hover (~800ms) on any card shows a detailed preview popup
- Shows: title, type, year, genres, vibes, score + recommend %, external scores, description snippet, people, awards, platforms
- Click goes to full page

### Cross-Media Recommendations
- Genre matching across media types (V1)
- Vibe/tone matching across media types (V1)
- Three recommendation columns on every item's page:
  1. "More [same type]" — similar movies if it's a movie, etc.
  2. "Across media" — cross-media picks sharing genres/vibes
  3. Adaptive third column: "Deep cuts" if user liked it, "Something different" if user disliked it
- Future: collaborative filtering (users who rated similarly), AI-powered theme connections

### Vibe/Tone Tags
- Items tagged with mood descriptors beyond genre: Dark, Atmospheric, Mind-Bending, Slow Burn, Thought-Provoking, Emotional, Epic, Intense, Wholesome, Gritty, Heartbreaking, Satirical, Surreal, Brutal, Uplifting, Chaotic, Immersive, Melancholic, Stylish, Cozy, Cerebral, Heartfelt, Funny, Fast-Paced
- Vibes are clickable — opens a dedicated vibe browse page
- Vibe browse page: hero section with icon/name/count, related vibes, then rows by media type
- Vibes factor into recommendation engine alongside genres
- In real app: vibes would be community-driven (users tag items with vibes)

### Library / Status Tracking
- Users mark items as: Completed, In Progress, Want To, Dropped
- For ongoing media (TV, manga, comics, podcasts): "Completed" button says "Caught Up" instead
- Progress tracking for "In Progress" items: episodes, chapters, pages, hours depending on type
- Library tab organized by status sections with progress bars on In Progress items
- Filtering in library: by media type (all 8 types shown), by genre
- Per-section quick filters: each status section has its own media type pills

### Upcoming Releases
- Browsable section on For You page sorted by community interest
- Each upcoming item shows: release date, people involved, expected platforms, description
- "Want count" — how many Literacy users have it on their Want To list
- Hype Score (0-100) calculated from: Literacy wishlists, social media mentions, trailer engagement, pre-order data
- Users can add upcoming items to their Want To list
- No star ratings or reviews until released

### Explore Page
- Search bar that searches everything including upcoming
- Four browsing modes: All (grid with filters), By Media (type tiles), By Genre (genre tiles), By Vibe (vibe tiles)
- Each mode shows clickable category tiles with item counts, then results below when selected

### People / Social (Taste-Focused, NOT Facebook-Like)
- Search-first design — primary action is finding specific users
- Follow system — follow other users to see their ratings
- Activity feed — shows recent reviews from people you follow (equally prominent with search)
- "Reviewers with similar taste" suggestions (lower prominence, beneath search + activity)
- User profiles: show their stats, top rated items, library by status
- Private profiles option — follow but can't see their library
- NOT a social media feed. It's about taste discovery, not socializing.

### User Accounts
- Sign up / log in via email + Google/Apple OAuth
- Profile with username, bio, avatar
- Privacy toggle (public/private library)

## Upcoming Features (Design database/architecture to support these, don't build yet)

### Saved Ideas — REMIND USER ABOUT THESE PERIODICALLY
1. 🎨 **Customizable skins/themes** — Users choose visual themes (fantasy parchment, cyberpunk neon, gothic dark, clean default). Core layout stays same, backgrounds/textures/fonts/accents change. CSS variables + theme config for easy addition later.
2. 📖 **Media-type-specific UI elements** — Ebook page-turning for books, comic panel layouts for comics/manga, controller UI for games, vinyl/waveform for music. Makes each type feel native.
3. 🃏 **Cards/collectibles & fandom sub-sections** — For franchises like Pokémon: trading cards, board games, merch, spin-offs. Turns fandoms into explorable universes.
4. 📌 **Review-first identity** — Always prioritize reviews/ratings over browse aesthetics. Don't look like Netflix.
5. 🔥 **Hype meter factors** — Finalize calculation: wishlists, social mentions, trailers, pre-orders.
6. 💰 **Monetization via affiliate links** — Platform buttons (Netflix, Steam, etc.) could be affiliate links eventually. Never the core identity.
7. ✅ **Verified profiles for creators** — Directors, authors, game devs, musicians get verified accounts. See what Christopher Nolan reads or what Miyazaki plays.
8. **Franchise/fandom following** — Follow "Spider-Man" to see all related media across types.
9. **Discussion threads** — Comment threads on each item for community discussion.
10. **Custom lists** — "Best Sci-Fi Across All Media", user-curated collections.
11. **Activity feed on For You page** — Surface interesting reviews ("review of the day").
12. **Advanced recommendation engine** — Collaborative filtering, AI-powered theme connections.

## Tech Stack (Required)
- **Framework:** Next.js (App Router) with TypeScript
- **Database:** PostgreSQL via Supabase or Railway
- **ORM:** Prisma
- **Auth:** NextAuth.js or Supabase Auth (Google + Apple + email)
- **Styling:** Tailwind CSS with CSS variables for future theming
- **Media APIs:** TMDB (movies/TV), IGDB (games), OpenLibrary/Google Books (books), Spotify (music/podcasts), MangaDex or Jikan (manga), Comic Vine (comics)
- **Hosting:** Vercel (frontend) + Railway or Supabase (database)

## Automated Data Sync
- Scheduled sync jobs pulling new releases from all media APIs
- TMDB every 6 hours, IGDB every 12 hours, others daily
- External review scores (IMDb, RT, etc.) refresh daily
- Cover art and metadata pulled automatically
- New releases appear within hours of being listed in source databases

## Database Schema (Core Entities)
- Users (id, email, name, bio, avatar, auth_provider, is_private, created_at)
- Items (id, title, type, genres, vibes, year, description, cover_url, external_api_id, total_episodes)
- Ratings (user_id, item_id, score 1-5, recommend_tag, created_at)
- Reviews (user_id, item_id, text, helpful_count, created_at)
- Library_entries (user_id, item_id, status, progress_current, progress_total, started_at, completed_at)
- Follows (follower_id, followed_id, created_at)
- Franchises (id, name, description) — empty for now
- Franchise_items (franchise_id, item_id)
- Lists (id, user_id, name, description, is_public)
- List_items (list_id, item_id, position)
- Awards (id, item_id, award_name, year)
- Item_platforms (item_id, platform_key, url)
- External_scores (item_id, source, score, max_score, updated_at)

## Design Language
- Dark theme (#0b0b10 background, #141419 card backgrounds)
- Fonts: Playfair Display (headings, serif, bold), DM Sans (body, sans-serif)
- Accent color: #E84855 (red) for primary actions and branding
- Media type colors: Movie #E84855, TV #C45BAA, Book #3185FC, Manga #FF6B6B, Comic #F9A620, Game #2EC4B6, Music #9B5DE5, Podcast #00BBF9
- Score colors: Green #2EC4B6 (good), Yellow #F9A620 (mid), Red #E84855 (poor)
- Cards have gradient covers (placeholders — real app uses actual cover art from APIs)
- Hover effects: translateY(-4px) lift, box-shadow increase
- Clean, minimal aesthetic — NOT cluttered, NOT overly social-media-like

## Prototype
A working React prototype exists (literacy.jsx) that demonstrates all V1 features interactively. The prototype code can serve as a starting point for the frontend — it's written in React with functional components and hooks. Real implementation should use Next.js App Router with server components where appropriate.

## Data Sync Scripts (run these to populate/maintain the database)

### One-time setup (run in order):
1. `npx tsx scripts/seed-catalog.ts` — Initial population from all APIs
2. `npx tsx scripts/migrate-score-keys.ts` — Rename legacy score keys (imdb→tmdb, ign→igdb, goodreads→google_books)
3. `npx tsx scripts/backfill-book-votes.ts` — Populate voteCount for books so they appear in catalog
4. `npx tsx scripts/fetch-external-scores.ts` — Populate ExternalScore table from ext JSON + APIs

### Real external scores (run daily, OMDb limit 1,000 req/day):
- `npx tsx scripts/sync-omdb-scores.ts` — Fetch real IMDb/RT/Metacritic for movies+TV
- Use `--skip-existing` to avoid re-fetching: `npx tsx scripts/sync-omdb-scores.ts --skip-existing`
- Use `--limit=100` for testing: `npx tsx scripts/sync-omdb-scores.ts --limit=10`
- Run daily until all ~800 movies/TV are covered, then run weekly for new items
- After first run: popular movies show real IMDb + RT + Metacritic scores instead of mislabeled TMDB average

### Anime cross-referencing and cleanup:
- `npx tsx scripts/cross-reference-anime.ts` — Add TMDB scores to Jikan-sourced anime (uses --limit=50 first to test)
- `npx tsx scripts/deduplicate-anime.ts --dry-run` — Report TMDB/Jikan duplicate pairs (review before changing)
- `npx tsx scripts/deduplicate-anime.ts` — Link anime seasons into franchises + merge duplicate scores

### Score key conventions (enforced after migrate-score-keys.ts):
- `tmdb` — TMDB community vote_average (0-10); used for movies + TV
- `imdb` — Real IMDb rating from OMDb API (0-10); replaces tmdb for movies/TV after OMDb sync
- `igdb` — IGDB total_rating, community blend (0-100); used for games
- `igdb_critics` — IGDB aggregated_rating, critics only (0-100); used for games
- `google_books` — Google Books averageRating (0-5); used for books
- `mal` — MyAnimeList score (0-10); used for manga + anime
- `spotify_popularity` — Spotify popularity index (0-100); used for music + podcasts
- `rt_critics` — Rotten Tomatoes critic % (0-100); populated by OMDb sync
- `metacritic` — Metacritic score (0-100); populated by OMDb sync or IGDB for games

## Project Owner Context
The project owner is non-technical but deeply involved in all product decisions. They are learning coding through this project with AI assistance. All technical decisions should be explained in plain language. The owner wants to understand what's happening at every step, not just have code generated blindly. They prefer building incrementally — one feature at a time, tested and understood before moving to the next.
