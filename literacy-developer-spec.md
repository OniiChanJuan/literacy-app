# Literacy — Technical Spec for Developer

## What is Literacy?
A cross-media review and recommendation platform. Users rate and review content 
across movies, TV, books, manga, comics, games, music, and podcasts. The app 
recommends content across media types based on taste (e.g., liking a sci-fi manga 
might recommend a sci-fi film or game).

## Interactive Prototype
An interactive React prototype is included with this spec. It demonstrates the UI, 
user flows, and features for V1. The prototype code can be used as a starting point 
for the frontend — it's written in React with functional components and hooks.

## V1 Features (Build These)
- User accounts (sign up / log in via email + Google/Apple OAuth)
- Browse & search a media catalog (movies, TV, books, manga, comics, games, music, podcasts)
- Rate items (1–5 stars)
- Write & read community reviews
- Aggregate community scores with rating distribution
- Cross-media recommendation engine (genre-matching across media types)
- Personal library with status tracking (Completed, In Progress, Want To, Dropped)
- Progress tracking (e.g., episode 5 of 12, page 200 of 400)
- Horizontal scrollable rows organized by media type and genre
- Explore page with filters by media type and genre
- Detail view for each item with reviews, ratings, and metadata

## Future Features (Design the database and API to accommodate these, but don't build yet)
- Franchise/fandom following (follow "Spider-Man" to see all related media)
- Discussion threads and comments on items
- User profiles visible to others
- Follow other users and see their ratings
- Custom lists (e.g., "Best Sci-Fi Across All Media")
- Activity feed showing friends' recent ratings and reviews
- Advanced recommendation engine (collaborative filtering, AI-powered)
- Mobile app (iOS + Android)

## Required Tech Stack
- **Framework:** Next.js (App Router) — handles both frontend and backend
- **Language:** TypeScript (not plain JavaScript)
- **Database:** PostgreSQL (via Supabase or Railway)
- **ORM:** Prisma (for clean database queries and migrations)
- **Auth:** NextAuth.js or Supabase Auth (Google + Apple + email)
- **Media data APIs:** TMDB (movies/TV), IGDB (games), OpenLibrary (books), Spotify (music/podcasts), MangaDex or Jikan (manga), Comic Vine (comics)
- **Hosting:** Vercel (frontend) + Railway or Supabase (database)
- **Styling:** Tailwind CSS (already close to prototype style)

## Architecture Requirements
- Clean REST API or tRPC with documented endpoints
- Database schema designed for future features listed above
- Separate concerns: API routes, database models, UI components, and business logic 
  should each live in their own clear folder structure
- Environment variables for all API keys and secrets
- Seed script to populate initial media data from external APIs
- Mobile-responsive design from day one

## Database Schema (design to include these entities at minimum)
- Users (id, email, name, avatar, auth provider, created_at)
- Items (id, title, type, genres, year, description, cover_url, external_api_id)
- Ratings (user_id, item_id, score, created_at)
- Reviews (user_id, item_id, text, helpful_count, created_at)
- Library entries (user_id, item_id, status [completed/in_progress/want_to/dropped], 
  progress_current, progress_total, started_at, completed_at)
- Franchises (id, name, description) — can be empty for now, just create the table
- Franchise_items (franchise_id, item_id) — same, just create the table
- Follows (follower_id, followed_id) — same
- Lists (id, user_id, name, description, is_public) — same
- List_items (list_id, item_id, position) — same

## What I'm Looking For in a Developer
- Experience building social/review platforms or similar CRUD apps
- Familiar with Next.js + PostgreSQL + Prisma stack
- Writes clean, documented code that another developer can pick up later
- Communicates regularly with progress updates
- Comfortable working from a visual prototype as the spec

## Automated Data Sync (Critical)
The catalog must stay up to date without manual intervention.
- **Scheduled sync jobs** (cron tasks) that pull new releases and updated metadata from:
  - TMDB (movies & TV) — sync every 6 hours
  - IGDB (games) — sync every 12 hours
  - OpenLibrary / Google Books (books) — sync daily
  - Spotify API (music & podcasts) — sync daily
  - MangaDex or Jikan/MyAnimeList (manga) — sync daily
  - Comic Vine (comics) — sync daily
- **External review scores** (IMDb, Rotten Tomatoes, Metacritic, etc.) should refresh daily
- **Cover art and metadata** pulled automatically from source APIs
- **New releases** should appear in the catalog within hours of being listed in source databases
- Sync jobs should log successes/failures and be easy to monitor
- Build the sync as a standalone service/module so it can be maintained independently

## Future Feature: Customizable Skins/Themes (Design for later)
- Users will eventually be able to choose visual themes for their profile and/or site-wide view
- Examples: fantasy parchment theme, neon cyberpunk theme, dark gothic theme, clean default
- The core layout/structure stays identical — only backgrounds, textures, accent colors, and fonts change
- Design the CSS/styling architecture with theming in mind (CSS variables, theme config object)
  so adding skins later doesn't require a rewrite
- Do NOT build skins for V1 — just make sure the styling approach supports them later

## Budget & Timeline
- Budget: $3,000–$5,000 USD
- Timeline: 6–8 weeks
- Milestone-based payments (not all upfront)

## Deliverables
- Deployed, working web application
- Source code in a GitHub repository I own
- Database with seed data from media APIs
- Documentation for how to run, deploy, and maintain the app
- One week of post-launch bug fixes included
