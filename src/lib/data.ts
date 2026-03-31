export type MediaType = "movie" | "tv" | "book" | "manga" | "comic" | "game" | "music" | "podcast";

export type RecTag = "recommend" | "mixed" | "skip";

export type ExternalSource =
  // Correct source keys (used by new seeds)
  | "tmdb" | "igdb" | "igdb_critics" | "google_books" | "spotify_popularity"
  // Real external sources (legacy or from OMDb sync)
  | "imdb" | "rt" | "rt_critics" | "rt_audience" | "meta" | "metacritic"
  | "mal" | "anilist" | "ign" | "goodreads" | "pitchfork" | "steam"
  | "letterboxd" | "storygraph" | "rym" | "aoty" | "opencritic";

export interface Person {
  role: string;
  name: string;
}

export interface Item {
  id: number;
  title: string;
  type: MediaType;
  genre: string[];
  vibes: string[];
  year: number;
  cover: string;
  desc: string;
  people: Person[];
  awards: string[];
  platforms: string[];
  ext: Partial<Record<ExternalSource, number>>;
  totalEp: number;
  voteCount?: number;
  tmdbId?: number;
}

export const TYPES: Record<MediaType, { label: string; icon: string; color: string }> = {
  movie:   { label: "Movies",   icon: "🎬", color: "#E84855" },
  tv:      { label: "TV Shows", icon: "📺", color: "#C45BAA" },
  book:    { label: "Books",    icon: "📖", color: "#3185FC" },
  manga:   { label: "Manga",    icon: "🗾", color: "#FF6B6B" },
  comic:   { label: "Comics",   icon: "💥", color: "#F9A620" },
  game:    { label: "Games",    icon: "🎮", color: "#2EC4B6" },
  music:   { label: "Music",    icon: "🎵", color: "#9B5DE5" },
  podcast: { label: "Podcasts", icon: "🎙️", color: "#00BBF9" },
};

export const ITEMS: Item[] = [
  // ── Movies ──────────────────────────────────────────────────────────────
  {
    id: 1, title: "Blade Runner 2049", type: "movie",
    genre: ["Sci-Fi", "Drama"], year: 2017,
    vibes: ["atmospheric", "slow-burn", "thought-provoking"],
    cover: "https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg",
    desc: "A young blade runner discovers a long-buried secret that has the potential to plunge what's left of society into chaos.",
    people: [{ role: "Director", name: "Denis Villeneuve" }, { role: "Star", name: "Ryan Gosling" }, { role: "Star", name: "Harrison Ford" }],
    awards: ["oscar", "bafta"], platforms: ["prime", "hbo"],
    ext: { imdb: 8.0, rt: 88, meta: 81 }, totalEp: 1,
  },
  {
    id: 13, title: "Parasite", type: "movie",
    genre: ["Thriller", "Drama", "Comedy"], year: 2019,
    vibes: ["satirical", "intense", "mind-bending"],
    cover: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    desc: "A poor family schemes to become employed by a wealthy family and infiltrate their household.",
    people: [{ role: "Director", name: "Bong Joon-ho" }, { role: "Star", name: "Song Kang-ho" }, { role: "Star", name: "Cho Yeo-jeong" }],
    awards: ["oscar", "palme", "bafta"], platforms: ["hulu", "prime"],
    ext: { imdb: 8.5, rt: 99, meta: 96 }, totalEp: 1,
  },
  {
    id: 16, title: "Everything Everywhere All at Once", type: "movie",
    genre: ["Sci-Fi", "Action", "Comedy"], year: 2022,
    vibes: ["mind-bending", "heartfelt", "surreal"],
    cover: "https://image.tmdb.org/t/p/w500/u68AjlvlutfEIcpmbYpKcdi09ut.jpg",
    desc: "A laundromat owner must connect with parallel universe versions of herself to prevent a powerful being from destroying the multiverse.",
    people: [{ role: "Directors", name: "Daniels" }, { role: "Star", name: "Michelle Yeoh" }, { role: "Star", name: "Ke Huy Quan" }],
    awards: ["oscar"], platforms: ["prime", "hulu"],
    ext: { imdb: 7.8, rt: 94, meta: 81 }, totalEp: 1,
  },
  {
    id: 25, title: "Interstellar", type: "movie",
    genre: ["Sci-Fi", "Drama", "Adventure"], year: 2014,
    vibes: ["epic", "emotional", "mind-bending"],
    cover: "https://image.tmdb.org/t/p/w500/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg",
    desc: "Explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
    people: [{ role: "Director", name: "Christopher Nolan" }, { role: "Star", name: "Matthew McConaughey" }, { role: "Star", name: "Anne Hathaway" }],
    awards: ["oscar", "bafta"], platforms: ["prime", "hbo"],
    ext: { imdb: 8.7, rt: 73, meta: 74 }, totalEp: 1,
  },
  {
    id: 29, title: "Spider-Man: Into the Spider-Verse", type: "movie",
    genre: ["Action", "Comedy", "Sci-Fi"], year: 2018,
    vibes: ["stylish", "heartfelt", "fast-paced"],
    cover: "https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg",
    desc: "Teen Miles Morales becomes the Spider-Man of his reality and must team with five spider-powered individuals from other dimensions.",
    people: [{ role: "Directors", name: "Persichetti, Ramsey, Rothman" }, { role: "Star", name: "Shameik Moore" }],
    awards: ["oscar", "bafta"], platforms: ["netflix", "prime"],
    ext: { imdb: 8.4, rt: 97, meta: 87 }, totalEp: 1,
  },

  // ── TV Shows ─────────────────────────────────────────────────────────────
  {
    id: 5, title: "Severance", type: "tv",
    genre: ["Sci-Fi", "Thriller", "Mystery"], year: 2022,
    vibes: ["mind-bending", "atmospheric", "slow-burn"],
    cover: "https://image.tmdb.org/t/p/w500/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg",
    desc: "Employees at a corporation undergo a surgical procedure that separates their work and personal memories.",
    people: [{ role: "Creator", name: "Dan Erickson" }, { role: "Star", name: "Adam Scott" }, { role: "Director", name: "Ben Stiller" }],
    awards: ["emmy"], platforms: ["apple"],
    ext: { imdb: 8.7, rt: 97 }, totalEp: 19,
  },
  {
    id: 11, title: "Arcane", type: "tv",
    genre: ["Fantasy", "Action", "Drama"], year: 2021,
    vibes: ["emotional", "intense", "heartbreaking"],
    cover: "https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg",
    desc: "Set in the world of League of Legends, two sisters fight on opposing sides of a brewing war.",
    people: [{ role: "Creator", name: "Christian Linke" }, { role: "Voice", name: "Hailee Steinfeld" }, { role: "Voice", name: "Ella Purnell" }],
    awards: ["emmy", "bafta"], platforms: ["netflix"],
    ext: { imdb: 9.0, rt: 100 }, totalEp: 18,
  },
  {
    id: 21, title: "Dark", type: "tv",
    genre: ["Sci-Fi", "Mystery", "Thriller"], year: 2017,
    vibes: ["mind-bending", "atmospheric", "slow-burn"],
    cover: "https://image.tmdb.org/t/p/w500/7CFCzWIZZcnxHke3yAQiGPWXHwF.jpg",
    desc: "A missing child sets off a chain of events revealing a time travel conspiracy spanning several generations.",
    people: [{ role: "Creators", name: "Baran bo Odar & Jantje Friese" }, { role: "Star", name: "Louis Hofmann" }],
    awards: [], platforms: ["netflix"],
    ext: { imdb: 8.8, rt: 95 }, totalEp: 26,
  },
  {
    id: 27, title: "Breaking Bad", type: "tv",
    genre: ["Drama", "Thriller"], year: 2008,
    vibes: ["intense", "slow-burn", "dark"],
    cover: "https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg",
    desc: "A chemistry teacher turned drug kingpin navigates the criminal underworld with his former student.",
    people: [{ role: "Creator", name: "Vince Gilligan" }, { role: "Star", name: "Bryan Cranston" }, { role: "Star", name: "Aaron Paul" }],
    awards: ["emmy", "peabody"], platforms: ["netflix", "prime"],
    ext: { imdb: 9.5, rt: 96 }, totalEp: 62,
  },

  // ── Books ────────────────────────────────────────────────────────────────
  {
    id: 2, title: "Neuromancer", type: "book",
    genre: ["Sci-Fi", "Thriller"], year: 1984,
    vibes: ["gritty", "dark", "mind-bending"],
    cover: "https://books.google.com/books/content?id=pNQiDQAAQBAJ&printsec=frontcover&img=1&zoom=0&source=gbs_api",
    desc: "Case, a washed-up computer hacker, is hired by a mysterious employer to pull off the ultimate hack in this foundational cyberpunk novel.",
    people: [{ role: "Author", name: "William Gibson" }],
    awards: ["hugo", "nebula"], platforms: ["kindle", "audible", "library"],
    ext: { goodreads: 3.9 }, totalEp: 271,
  },
  {
    id: 10, title: "Dune", type: "book",
    genre: ["Sci-Fi", "Adventure"], year: 1965,
    vibes: ["epic", "atmospheric", "slow-burn"],
    cover: "https://books.google.com/books/content?id=nrRKDwAAQBAJ&printsec=frontcover&img=1&zoom=0&source=gbs_api",
    desc: "A noble family becomes embroiled in a war for control of the galaxy's most valuable asset: a desert planet that is the only source of the most precious substance in existence.",
    people: [{ role: "Author", name: "Frank Herbert" }],
    awards: ["hugo", "nebula"], platforms: ["kindle", "audible", "library"],
    ext: { goodreads: 4.2 }, totalEp: 412,
  },
  {
    id: 18, title: "House of Leaves", type: "book",
    genre: ["Horror", "Mystery"], year: 2000,
    vibes: ["surreal", "mind-bending", "atmospheric"],
    cover: "https://books.google.com/books/content?id=qGA_3RGqTkQC&printsec=frontcover&img=1&zoom=0&source=gbs_api",
    desc: "A young family discovers their house is bigger on the inside than the outside. A labyrinthine novel unlike anything before it.",
    people: [{ role: "Author", name: "Mark Z. Danielewski" }],
    awards: [], platforms: ["kindle", "library"],
    ext: { goodreads: 4.1 }, totalEp: 709,
  },
  {
    id: 24, title: "The Song of Achilles", type: "book",
    genre: ["Fantasy", "Romance", "Drama"], year: 2011,
    vibes: ["heartbreaking", "emotional", "epic"],
    cover: "https://books.google.com/books/content?id=szMU9omwV0wC&printsec=frontcover&img=1&zoom=0&source=gbs_api",
    desc: "A retelling of the Iliad through the eyes of Patroclus, a young prince who befriends and falls in love with Achilles.",
    people: [{ role: "Author", name: "Madeline Miller" }],
    awards: [], platforms: ["kindle", "audible", "library"],
    ext: { goodreads: 4.4 }, totalEp: 352,
  },

  // ── Manga ────────────────────────────────────────────────────────────────
  {
    id: 3, title: "Ghost in the Shell", type: "manga",
    genre: ["Sci-Fi", "Action"], year: 1989,
    vibes: ["thought-provoking", "atmospheric", "dark"],
    cover: "https://myanimelist.net/images/manga/2/155733l.jpg",
    desc: "In a future where cybernetic implants blur the line between human and machine, an elite counterterrorism officer hunts a master hacker.",
    people: [{ role: "Author", name: "Masamune Shirow" }, { role: "Publisher", name: "Kodansha" }],
    awards: [], platforms: ["mangaplus", "viz"],
    ext: { mal: 8.0 }, totalEp: 11,
  },
  {
    id: 12, title: "Berserk", type: "manga",
    genre: ["Fantasy", "Action", "Horror"], year: 1989,
    vibes: ["dark", "brutal", "epic"],
    cover: "https://myanimelist.net/images/manga/1/157897l.jpg",
    desc: "A lone mercenary warrior struggles against a monstrous fate in a dark medieval world filled with demons.",
    people: [{ role: "Author", name: "Kentaro Miura" }, { role: "Publisher", name: "Hakusensha" }],
    awards: [], platforms: ["mangaplus", "viz"],
    ext: { mal: 9.4 }, totalEp: 364,
  },
  {
    id: 20, title: "Chainsaw Man", type: "manga",
    genre: ["Action", "Horror", "Comedy"], year: 2018,
    vibes: ["chaotic", "dark", "funny"],
    cover: "https://myanimelist.net/images/manga/3/216464l.jpg",
    desc: "A young devil hunter merges with his chainsaw devil companion and joins a government agency hunting supernatural threats.",
    people: [{ role: "Author", name: "Tatsuki Fujimoto" }, { role: "Publisher", name: "Shueisha" }],
    awards: ["harvey"], platforms: ["mangaplus", "viz"],
    ext: { mal: 8.8 }, totalEp: 177,
  },
  {
    id: 26, title: "Attack on Titan", type: "manga",
    genre: ["Action", "Fantasy", "Horror"], year: 2009,
    vibes: ["intense", "dark", "epic"],
    cover: "https://myanimelist.net/images/manga/2/37846l.jpg",
    desc: "In a world where humanity lives behind walls to protect themselves from giant humanoid monsters, a young soldier vows revenge.",
    people: [{ role: "Author", name: "Hajime Isayama" }, { role: "Publisher", name: "Kodansha" }],
    awards: ["harvey"], platforms: ["mangaplus", "viz"],
    ext: { mal: 8.5 }, totalEp: 139,
  },

  // ── Comics ───────────────────────────────────────────────────────────────
  {
    id: 7, title: "Saga", type: "comic",
    genre: ["Sci-Fi", "Fantasy", "Romance"], year: 2012,
    vibes: ["epic", "emotional", "heartbreaking"],
    cover: "https://comicvine.gamespot.com/a/uploads/scale_large/10/108980/2260155-saga__1__2012_.jpg",
    desc: "An epic space opera following two soldiers from opposite sides of a galactic war who fall in love and struggle to care for their child.",
    people: [{ role: "Writer", name: "Brian K. Vaughan" }, { role: "Artist", name: "Fiona Staples" }],
    awards: ["eisner", "hugo", "harvey"], platforms: ["comixology"],
    ext: {}, totalEp: 66,
  },
  {
    id: 15, title: "Watchmen", type: "comic",
    genre: ["Sci-Fi", "Mystery", "Drama"], year: 1986,
    vibes: ["dark", "thought-provoking", "satirical"],
    cover: "https://comicvine.gamespot.com/a/uploads/scale_large/8/80654/2184494-watchmen__1_pg_00.jpg",
    desc: "In an alternate 1985, a group of retired costumed heroes investigates the murder of one of their own — and uncovers a global conspiracy.",
    people: [{ role: "Writer", name: "Alan Moore" }, { role: "Artist", name: "Dave Gibbons" }],
    awards: ["hugo", "eisner"], platforms: ["comixology", "library"],
    ext: {}, totalEp: 12,
  },
  {
    id: 23, title: "Maus", type: "comic",
    genre: ["Drama", "Documentary"], year: 1991,
    vibes: ["heartbreaking", "thought-provoking", "dark"],
    cover: "https://comicvine.gamespot.com/a/uploads/scale_large/11/111746/3824386-138958-050-4916fbff.jpg",
    desc: "A cartoonist interviews his father about surviving the Holocaust, depicting Jews as mice and Nazis as cats.",
    people: [{ role: "Author/Artist", name: "Art Spiegelman" }],
    awards: ["pulitzer", "eisner", "harvey"], platforms: ["comixology", "library"],
    ext: {}, totalEp: 2,
  },

  // ── Games ────────────────────────────────────────────────────────────────
  {
    id: 4, title: "Cyberpunk 2077", type: "game",
    genre: ["Sci-Fi", "Action"], year: 2020,
    vibes: ["gritty", "immersive", "intense"],
    cover: "https://images.igdb.com/igdb/image/upload/t_720p/coaih8.jpg",
    desc: "In the megalopolis of Night City, a mercenary gets caught up in a heist that goes wrong and wakes up with a dead legend in their head.",
    people: [{ role: "Developer", name: "CD Projekt Red" }, { role: "Composer", name: "Marcin Przybyłowicz" }],
    awards: ["tga"], platforms: ["steam", "ps", "xbox"],
    ext: { ign: 7.0, meta: 86, steam: 86 }, totalEp: 60,
  },
  {
    id: 9, title: "The Witcher 3: Wild Hunt", type: "game",
    genre: ["Fantasy", "Adventure"], year: 2015,
    vibes: ["epic", "immersive", "dark"],
    cover: "https://images.igdb.com/igdb/image/upload/t_720p/coaarl.jpg",
    desc: "Geralt of Rivia, a monster bounty hunter, embarks on an epic journey to find his missing adopted daughter in a war-torn open world.",
    people: [{ role: "Developer", name: "CD Projekt Red" }, { role: "Based on", name: "Andrzej Sapkowski" }],
    awards: ["goty", "tga", "bafta"], platforms: ["steam", "ps", "xbox", "switch"],
    ext: { ign: 9.3, meta: 92, steam: 97 }, totalEp: 100,
  },
  {
    id: 14, title: "Hades", type: "game",
    genre: ["Action", "Fantasy"], year: 2020,
    vibes: ["fast-paced", "stylish", "immersive"],
    cover: "https://images.igdb.com/igdb/image/upload/t_720p/cob9kr.jpg",
    desc: "Defy the god of the dead as you hack and slash your way out of the Underworld with help from the gods of Olympus.",
    people: [{ role: "Developer", name: "Supergiant Games" }, { role: "Director", name: "Greg Kasavin" }],
    awards: ["goty", "bafta", "tga"], platforms: ["steam", "ps", "xbox", "switch"],
    ext: { ign: 9.0, meta: 93, steam: 96 }, totalEp: 40,
  },
  {
    id: 17, title: "The Last of Us", type: "game",
    genre: ["Horror", "Drama", "Adventure"], year: 2013,
    vibes: ["emotional", "dark", "heartbreaking"],
    cover: "https://images.igdb.com/igdb/image/upload/t_720p/co1r7f.jpg",
    desc: "A hardened survivor escorting a teenage girl across a post-apocalyptic America discovers the redemptive power of human connection.",
    people: [{ role: "Developer", name: "Naughty Dog" }, { role: "Director", name: "Neil Druckmann" }],
    awards: ["goty", "bafta", "tga"], platforms: ["ps"],
    ext: { ign: 10.0, meta: 95 }, totalEp: 15,
  },
  {
    id: 22, title: "Celeste", type: "game",
    genre: ["Adventure", "Indie"], year: 2018,
    vibes: ["emotional", "uplifting", "wholesome"],
    cover: "https://images.igdb.com/igdb/image/upload/t_720p/cob9dh.jpg",
    desc: "Help Madeline survive her struggle with her inner demons on her journey to the top of Celeste Mountain.",
    people: [{ role: "Developer", name: "Maddy Makes Games" }, { role: "Director", name: "Matt Thorson" }],
    awards: ["goty", "tga"], platforms: ["steam", "switch", "ps", "xbox"],
    ext: { ign: 9.0, meta: 92, steam: 97 }, totalEp: 20,
  },
  {
    id: 30, title: "Hollow Knight", type: "game",
    genre: ["Adventure", "Action", "Indie"], year: 2017,
    vibes: ["atmospheric", "melancholic", "immersive"],
    cover: "https://images.igdb.com/igdb/image/upload/t_720p/cobfzp.jpg",
    desc: "A tiny, nameless warrior descends into the vast underground ruins of the fallen bug kingdom of Hallownest.",
    people: [{ role: "Developer", name: "Team Cherry" }],
    awards: ["tga"], platforms: ["steam", "switch", "ps", "xbox"],
    ext: { ign: 9.4, meta: 87, steam: 97 }, totalEp: 30,
  },

  // ── Music ────────────────────────────────────────────────────────────────
  {
    id: 6, title: "OK Computer", type: "music",
    genre: ["Indie", "Alternative"], year: 1997,
    vibes: ["atmospheric", "melancholic", "thought-provoking"],
    cover: "https://i.scdn.co/image/ab67616d0000b273c8b444df094279e70d0ed856",
    desc: "Radiohead's landmark third album explores themes of technology, consumerism, and political apathy in the modern world.",
    people: [{ role: "Artist", name: "Radiohead" }, { role: "Producer", name: "Nigel Godrich" }],
    awards: ["grammy"], platforms: ["spotify", "apple_music"],
    ext: { pitchfork: 10.0 }, totalEp: 12,
  },
  {
    id: 19, title: "IGOR", type: "music",
    genre: ["Indie", "R&B"], year: 2019,
    vibes: ["emotional", "melancholic", "surreal"],
    cover: "https://i.scdn.co/image/ab67616d0000b27330a635de2bb0caa4e26f6abb",
    desc: "Tyler, the Creator's fifth studio album: a concept album tracing the arc of a doomed relationship from infatuation to heartbreak.",
    people: [{ role: "Artist", name: "Tyler, the Creator" }, { role: "Label", name: "Columbia" }],
    awards: ["grammy"], platforms: ["spotify", "apple_music"],
    ext: { pitchfork: 8.0 }, totalEp: 12,
  },
  {
    id: 28, title: "DAMN.", type: "music",
    genre: ["Hip-Hop", "Drama"], year: 2017,
    vibes: ["thought-provoking", "intense", "emotional"],
    cover: "https://i.scdn.co/image/ab67616d0000b2738b52c6b9bc4e43d873869699",
    desc: "Kendrick Lamar's Pulitzer Prize-winning album explores duality, faith, and loyalty through the lens of street life in Compton.",
    people: [{ role: "Artist", name: "Kendrick Lamar" }, { role: "Producer", name: "Various" }],
    awards: ["pulitzer", "grammy"], platforms: ["spotify", "apple_music"],
    ext: { pitchfork: 9.2 }, totalEp: 14,
  },

  // ── Podcasts ─────────────────────────────────────────────────────────────
  {
    id: 8, title: "Lex Fridman Podcast", type: "podcast",
    genre: ["Technology", "Science"], year: 2018,
    vibes: ["thought-provoking", "cerebral"],
    cover: "https://i.scdn.co/image/ab6765630000ba8a563ebb538d297875b10114b7",
    desc: "Long-form conversations with some of the most brilliant and curious minds in science, technology, history, philosophy and beyond.",
    people: [{ role: "Host", name: "Lex Fridman" }],
    awards: [], platforms: ["spotify", "apple_pod"],
    ext: {}, totalEp: 400,
  },
];

// ── Upcoming releases ────────────────────────────────────────────────────────
export interface UpcomingItem extends Item {
  releaseDate: string; // ISO date string
  hypeScore: number;   // 0–100
  wantCount: number;
  upcoming: true;
}

export const UPCOMING: UpcomingItem[] = [
  {
    id: 101, title: "The Odyssey", type: "movie",
    genre: ["Adventure", "Drama", "Fantasy"], year: 2025,
    vibes: ["epic", "atmospheric", "emotional"],
    cover: "https://image.tmdb.org/t/p/w500/pe5cCoX5iIb5IWKPsbPkCwjLFHt.jpg",
    desc: "Christopher Nolan brings Homer's ancient epic to the big screen in a sweeping mythological journey across the Mediterranean.",
    people: [{ role: "Director", name: "Christopher Nolan" }, { role: "Star", name: "Matt Damon" }, { role: "Star", name: "Tom Holland" }],
    awards: [], platforms: ["theaters"],
    ext: {}, totalEp: 1,
    releaseDate: "2025-07-17", hypeScore: 92, wantCount: 14320, upcoming: true,
  },
  {
    id: 102, title: "Hollow Knight: Silksong", type: "game",
    genre: ["Adventure", "Action", "Indie"], year: 2025,
    vibes: ["atmospheric", "immersive", "intense"],
    cover: "https://images.igdb.com/igdb/image/upload/t_720p/coaob9.jpg",
    desc: "Play as Hornet in this highly anticipated sequel, exploring a vast new kingdom filled with deadly silk creatures and ancient mysteries.",
    people: [{ role: "Developer", name: "Team Cherry" }],
    awards: [], platforms: ["steam", "switch"],
    ext: {}, totalEp: 30,
    releaseDate: "2025-06-12", hypeScore: 88, wantCount: 28740, upcoming: true,
  },
  {
    id: 103, title: "Winds of Winter", type: "book",
    genre: ["Fantasy", "Drama"], year: 2026,
    vibes: ["epic", "dark", "slow-burn"],
    cover: "linear-gradient(135deg, #2c3e50, #4a6741, #d4af37)",
    desc: "The long-awaited sixth installment in A Song of Ice and Fire continues the sprawling saga of Westeros.",
    people: [{ role: "Author", name: "George R.R. Martin" }],
    awards: [], platforms: ["kindle", "audible", "library"],
    ext: {}, totalEp: 900,
    releaseDate: "2026-11-01", hypeScore: 95, wantCount: 41200, upcoming: true,
  },
  {
    id: 104, title: "Arcane: Season 3", type: "tv",
    genre: ["Fantasy", "Action", "Drama"], year: 2026,
    vibes: ["emotional", "intense", "heartbreaking"],
    cover: "https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg",
    desc: "The final chapter of the Arcane saga concludes the war between Piltover and Zaun in this animated epic from Riot Games.",
    people: [{ role: "Creator", name: "Christian Linke" }, { role: "Voice", name: "Hailee Steinfeld" }, { role: "Voice", name: "Ella Purnell" }],
    awards: [], platforms: ["netflix"],
    ext: {}, totalEp: 9,
    releaseDate: "2026-08-15", hypeScore: 91, wantCount: 19800, upcoming: true,
  },
  {
    id: 105, title: "Chainsaw Man Part 3", type: "manga",
    genre: ["Action", "Horror", "Comedy"], year: 2026,
    vibes: ["chaotic", "dark", "intense"],
    cover: "https://myanimelist.net/images/manga/3/216464l.jpg",
    desc: "Tatsuki Fujimoto's unhinged shonen saga enters its third major arc with new devils, new allies, and escalating chaos.",
    people: [{ role: "Author", name: "Tatsuki Fujimoto" }, { role: "Publisher", name: "Shueisha" }],
    awards: [], platforms: ["mangaplus", "viz"],
    ext: {}, totalEp: 0,
    releaseDate: "2026-04-21", hypeScore: 82, wantCount: 15600, upcoming: true,
  },
  {
    id: 106, title: "GTA VI", type: "game",
    genre: ["Action", "Adventure"], year: 2025,
    vibes: ["immersive", "intense", "stylish"],
    cover: "https://images.igdb.com/igdb/image/upload/t_720p/co9rwo.jpg",
    desc: "Rockstar Games returns to Vice City in the most anticipated open-world game of the decade, featuring dual protagonists and a living, breathing metropolis.",
    people: [{ role: "Developer", name: "Rockstar Games" }, { role: "Publisher", name: "Take-Two Interactive" }],
    awards: [], platforms: ["ps", "xbox"],
    ext: {}, totalEp: 80,
    releaseDate: "2025-10-26", hypeScore: 98, wantCount: 67500, upcoming: true,
  },
  {
    id: 107, title: "Kendrick Lamar — New Album", type: "music",
    genre: ["Hip-Hop", "Drama"], year: 2026,
    vibes: ["thought-provoking", "intense", "cerebral"],
    cover: "https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58",
    desc: "The Pulitzer Prize-winning rapper's follow-up to GNX, rumored to be a conceptual double album exploring legacy and fatherhood.",
    people: [{ role: "Artist", name: "Kendrick Lamar" }, { role: "Producer", name: "Various" }],
    awards: [], platforms: ["spotify", "apple_music"],
    ext: {}, totalEp: 0,
    releaseDate: "2026-06-01", hypeScore: 87, wantCount: 22100, upcoming: true,
  },
  {
    id: 108, title: "Invincible: Season 4", type: "tv",
    genre: ["Action", "Sci-Fi", "Drama"], year: 2026,
    vibes: ["brutal", "emotional", "intense"],
    cover: "https://image.tmdb.org/t/p/w500/4tblBrslcKSifMVZ3TmtT2ukMor.jpg",
    desc: "Mark Grayson faces the Viltrumite War as the animated adaptation continues to push the boundaries of superhero storytelling.",
    people: [{ role: "Creator", name: "Robert Kirkman" }, { role: "Voice", name: "Steven Yeun" }, { role: "Voice", name: "J.K. Simmons" }],
    awards: [], platforms: ["prime"],
    ext: {}, totalEp: 8,
    releaseDate: "2026-05-10", hypeScore: 84, wantCount: 16900, upcoming: true,
  },
  {
    id: 109, title: "Elden Ring: Nightreign", type: "game",
    genre: ["Fantasy", "Action", "Adventure"], year: 2025,
    vibes: ["epic", "dark", "immersive"],
    cover: "https://images.igdb.com/igdb/image/upload/t_720p/co95gk.jpg",
    desc: "A standalone co-op experience set in the Elden Ring universe, blending roguelike survival with FromSoftware's signature dark fantasy combat.",
    people: [{ role: "Developer", name: "FromSoftware" }, { role: "Director", name: "Hidetaka Miyazaki" }],
    awards: [], platforms: ["steam", "ps", "xbox"],
    ext: {}, totalEp: 50,
    releaseDate: "2025-06-27", hypeScore: 90, wantCount: 31400, upcoming: true,
  },
];

/** Helper to check if an item is upcoming */
export function isUpcoming(item: Item): item is UpcomingItem {
  return "upcoming" in item && (item as UpcomingItem).upcoming === true;
}

/** All items combined (for search, etc.) */
export const ALL_ITEMS: Item[] = [...ITEMS, ...UPCOMING];

// Ordered list of types for the For You page rows
export const TYPE_ORDER: MediaType[] = ["movie", "tv", "book", "manga", "comic", "game", "music", "podcast"];

// ── Vibe metadata ──────────────────────────────────────────────────────────
export const VIBES: Record<string, { label: string; icon: string; color: string }> = {
  atmospheric:         { label: "Atmospheric",       icon: "🌫",  color: "#5a7a8a" },
  "slow-burn":         { label: "Slow Burn",         icon: "🕯",  color: "#c0853a" },
  "thought-provoking": { label: "Thought-Provoking", icon: "💭",  color: "#3185FC" },
  dark:                { label: "Dark",              icon: "🌑",  color: "#4a4a5a" },
  "mind-bending":      { label: "Mind-Bending",      icon: "🌀",  color: "#7b4397" },
  gritty:              { label: "Gritty",            icon: "⛓",   color: "#6b6b6b" },
  immersive:           { label: "Immersive",         icon: "🎧",  color: "#00BBF9" },
  intense:             { label: "Intense",           icon: "🔥",  color: "#E84855" },
  epic:                { label: "Epic",              icon: "⚔",   color: "#D4AF37" },
  emotional:           { label: "Emotional",         icon: "💔",  color: "#C45BAA" },
  heartbreaking:       { label: "Heartbreaking",     icon: "💔",  color: "#e84878" },
  satirical:           { label: "Satirical",         icon: "🎭",  color: "#F9A620" },
  surreal:             { label: "Surreal",           icon: "🪞",  color: "#9B5DE5" },
  brutal:              { label: "Brutal",            icon: "💀",  color: "#8b0000" },
  chaotic:             { label: "Chaotic",           icon: "🌪",  color: "#e67e22" },
  melancholic:         { label: "Melancholic",       icon: "🌧",  color: "#5b7fa5" },
  stylish:             { label: "Stylish",           icon: "💎",  color: "#9b59b6" },
  heartfelt:           { label: "Heartfelt",         icon: "🤍",  color: "#e8a0bf" },
  funny:               { label: "Funny",             icon: "😂",  color: "#f1c40f" },
  "fast-paced":        { label: "Fast-Paced",        icon: "⚡",  color: "#e74c3c" },
  uplifting:           { label: "Uplifting",         icon: "✨",  color: "#2ecc71" },
  wholesome:           { label: "Wholesome",         icon: "☀",   color: "#2EC4B6" },
  cerebral:            { label: "Cerebral",          icon: "🧠",  color: "#3498db" },
};

// ── Derived: all unique genres sorted by frequency ─────────────────────────
export const ALL_GENRES: string[] = (() => {
  const counts: Record<string, number> = {};
  ITEMS.forEach((item) => item.genre.forEach((g) => { counts[g] = (counts[g] || 0) + 1; }));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g]) => g);
})();

// ── Derived: all unique vibes sorted by frequency ──────────────────────────
export const ALL_VIBES: string[] = (() => {
  const counts: Record<string, number> = {};
  ITEMS.forEach((item) => item.vibes.forEach((v) => { counts[v] = (counts[v] || 0) + 1; }));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([v]) => v);
})();
