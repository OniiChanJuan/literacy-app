# Catalog-expansion reconciliation — 2026-06-14 (READ-ONLY, no ingestion run)

Verifies `crossshelf-catalog-expansion-list.xlsx` (460 unique titles referenced by the
cross-shelf connection corpus) against the **real `items` catalog** (29,864 items, prod
Supabase). **Nothing was ingested.** Sequence ingestion after owner review.

**Method:** bulk-read the whole catalog once (id/title/type/year — egress-frugal), then matched
all 460 titles locally with diacritic/punctuation normalization + article-stripping, plus a
fuzzy second pass (subtitle / abbreviation / Roman-numeral / suffix variants) and targeted
ILIKE probes for every ambiguous case. Script: `scripts/_recon-catalog-expansion.ts`
(re-runnable); data dump: `catalog-expansion-recon.json`.

> **Catalog type vocabulary:** `book, comic, game, manga, movie, music, podcast, tv`.
> There is **no `anime` type** — anime lives under `tv` (series) and `movie` (films). All sheet
> "Anime" entries were matched against tv+movie accordingly.

---

## Headline

| Sheet's guess | Count | Reality after verification |
|---|---|---|
| **ADD IT** (assumed missing) | 321 | **~265 are already PRESENT** — the corpus massively over-flagged. Only ~55 are genuinely missing. |
| **in catalog** (assumed present) | 127 | All present **except 2**: **Mistborn** and **Outer Wilds (base game)**. |
| **CHECK (mixed)** | 12 | **11 PRESENT, 1 missing** (The Silence of the Lambs *as a book*). |

**Confirmed-missing total: ~55 single titles** (+3 non-ingestable aggregate/vague refs).
By media: **Book 33 · Movie 9 · TV 10 · Anime 2 · Game 1 · Manga 0.**

The dominant pattern behind the over-flagging: the corpus flagged the **canonical/short title**
(e.g. "The Witcher 3", "Baldur's Gate 3", "Skyrim", "BOTW", "Sekiro", "Glass Onion") while the
catalog stores the **full title** ("The Witcher 3: Wild Hunt", "Baldur's Gate III", "The Elder
Scrolls V: Skyrim", "…Breath of the Wild", "Sekiro: Shadows Die Twice", "Glass Onion: A Knives
Out Mystery"). Also common: a work present in **another medium** than the corpus assumed (book
flagged, but only the film/series is in-catalog, or vice-versa).

---

## 1. CONFIRMED-MISSING (truly need adding), grouped by media + source API

Priority = **Activates** count (refs unlocked when ingested). Higher first.

### Books — 33  · source: **Google Books / NYT**
| Activates | Title | Note |
|---|---|---|
| 5 | The Time Traveler's Wife | absent (no book) |
| 4 | The Power Broker | absent |
| 3 | **Mistborn** | absent — *sheet said in-catalog* (see §2B) |
| 3 | Altered Carbon | book absent; **TV present** (#9364) |
| 3 | The Silence of the Lambs | book absent; **movie present** (was CHECK) |
| 2 | Snow Crash | absent |
| 2 | The Call of Cthulhu | book absent; **game present** (#12046) |
| 2 | The Girl with All the Gifts | absent |
| 2 | The Wheel of Time | books absent; **TV present** (#9112) |
| 2 | Battle Royale | novel absent; **movie #3967 + manga #20555 present** |
| 1 | 20,000 Leagues Under the Sea | absent |
| 1 | Atlas Shrugged | absent |
| 1 | Blindsight | absent |
| 1 | Brideshead Revisited | absent |
| 1 | Fear and Loathing in Las Vegas | absent |
| 1 | Fight Club | book absent; **movie present** (#2654) |
| 1 | From Blood and Ash | absent |
| 1 | If We Were Villains | absent |
| 1 | Lore Olympus | absent (webtoon — Google Books may not carry it; consider deferring) |
| 1 | Murderbot Diaries | absent |
| 1 | My Side of the Mountain | absent |
| 1 | Shōgun (novel) | novel absent; **TV present** (#9557) |
| 1 | The City of Ember | book absent; **movie present** (#5575) |
| 1 | The Count of Monte Cristo | book absent; **movie/TV present** |
| 1 | The Expanse | books absent; **TV present** (#8390) |
| 1 | The Fountainhead | absent |
| 1 | The Hating Game | book absent; **movie present** (#4820) |
| 1 | The House of the Spirits | absent |
| 1 | The Long Way to a Small, Angry Planet | absent |
| 1 | The Magicians | absent (Lev Grossman — Narnia "The Magician's Nephew" is a different book) |
| 1 | Uprooted | absent |
| 1 | We | absent (Zamyatin) |
| 1 | World War Z | book absent; **movie #3160 + game #12132 present** |

### Movies — 9 · source: **TMDB**
| Activates | Title | Note |
|---|---|---|
| 2 | The Death of Stalin | absent |
| 1 | Ready or Not (2019) | absent (catalog "Ready or Not: Here I Come" is a different 2026 film) |
| 1 | The Witch (2015) | absent (catalog "The Witch: Part 2" is a different 2022 KR film) |
| 1 | Begin Again | film absent (a book "Begin Again" #27722 is unrelated) |
| 1 | Glengarry Glen Ross | absent |
| 1 | Kill Your Darlings | absent |
| 1 | The Fountain | absent |
| 1 | The Last of Sheila | absent |
| 1 | The Stepford Wives | absent |

### TV — 10 · source: **TMDB**
| Activates | Title | Note |
|---|---|---|
| 2 | Parks and Recreation | series absent (only a tie-in book) |
| 1 | Buffy the Vampire Slayer | absent |
| 1 | Penny Dreadful | absent |
| 1 | Russian Doll | absent |
| 1 | Wolf Hall | absent |
| 1 | Years and Years | absent |
| 1 | The Corner (2000 HBO) | absent |
| 1 | Critical Role | show absent; companion **book present** (#27572) |
| 1 | Little Fires Everywhere | series absent; **book present** (#27443) |
| 1 | The Walking Dead | flagship series absent; **comic #2507 + game #11221 + spinoffs present** |

### Anime — 2 · source: **AniList**
| Activates | Title | Note |
|---|---|---|
| 1 | Record of Lodoss War | absent |
| 1 | Hajime no Ippo (anime) | anime absent; **manga present** ("…Fighting Spirit!" #836) — franchise partly covered |

### Games — 1 · source: **IGDB**
| Activates | Title | Note |
|---|---|---|
| 7 | **Outer Wilds** (base game) | base absent — *sheet said in-catalog*; only DLC "Echoes of the Eye" (#572) is in catalog (see §2B). **Highest-leverage single add.** |

### Manga — 0
Nothing missing. (The sheet's lone manga flag, "Oyasumi Punpun", is **present** as *Goodnight Punpun* #795.)

### Non-ingestable / aggregate refs — exclude from the queue
- **Studio Ghibli films** (Movie, act1) — aggregate; individual Ghibli films already present (Totoro, Mononoke, Howl's, Kaguya, Princess Mononoke…).
- **The Before Trilogy** (Movie, act1) — aggregate; *Before Sunrise* present (Sunset/Midnight may be partial — spot-check separately).
- **Joe Abercrombie's other books** (Book, act1) — vague; *The First Law* trilogy already present.
- **Philip K. Dick stories** (Book, act1) — vague; multiple PKD collections already present.

---

## 2. Disagreements with the sheet's Status guess (corpus flags to correct)

### 2A — Flagged **ADD IT** but actually **PRESENT** (clear these pending flags) — ~265 titles
The full list is in `catalog-expansion-recon.json` (`present:true && sheetStatus:"ADD IT"`).
Highest-leverage corrections (act ≥3): **Annihilation, Pachinko, Mad Men, Neuromancer, BoJack
Horseman, Foundation, House of Leaves, Blood Meridian, Guardians of the Galaxy, My Neighbor
Totoro, Ocean's Eleven, Station Eleven, The Good Place, 2001: A Space Odyssey, Citizen Kane,
Cloud Atlas, Contact, Dark, Fargo, Firefly, In the Mood for Love, Lady Bird, Lost in Translation,
Minari, Notes from Underground, Perks of Being a Wallflower, Scott Pilgrim, Shadow of the
Colossus, Sicario, Turning Red, Unforgiven.** Plus fuzzy-confirmed present that the exact pass
missed: **Sekiro, Animal Crossing, Crusader Kings, Deus Ex, Morrowind, Divinity: Original Sin 2,
Glass Onion, Across the Spider-Verse, Pride & Prejudice (2005), It (2017), Harry Potter, Kafka
(The Trial), Kitchen Confidential, Klara and the Sun, Me Before You, The Glass Castle, The Secret
History, The First Law, A Song of Ice and Fire, The Witcher (novels), Cosmos, Beloved, Lupin III,
Haikyu!!, Oyasumi Punpun→Goodnight Punpun, Watchmen (as comic).**

### 2B — Marked **in-catalog** but actually **MISSING** (only 2 — the sheet was nearly always right here)
- **Mistborn** (Book, act3) — no catalog row at all. → confirmed-missing.
- **Outer Wilds** (Game, act7) — only the DLC *Echoes of the Eye* is in catalog; the base game is absent. → confirmed-missing (high leverage).

*(All other in-catalog guesses verified present, incl. The Witcher 3, Baldur's Gate III, Breath of
the Wild, God of War (2018) + Ragnarök, Civilization VI, Skyrim, Demon Slayer, Ghost in the Shell:
SAC, The Office, Dr. Strangelove, Project Hail Mary, Re:Zero, Star Wars (1977 = A New Hope), LOTR:
Fellowship, True Detective, and The Lord of the Rings book editions.)*

---

## 3. The 12 "CHECK (mixed)" — resolved

| Title | Media | Verdict |
|---|---|---|
| A Little Life | Book | **PRESENT** #25006 |
| Children of Men | Movie | **PRESENT** #3998 |
| Vagabond | Manga | **PRESENT** #782 |
| Macbeth | Book | **PRESENT** #16964 / #29310 |
| Nausicaä of the Valley of the Wind | Anime | **PRESENT** #3884 (movie) / #19163 (tv) |
| The Little Prince | Book | **PRESENT** #22516 |
| The Mandalorian | TV | **PRESENT** #1335 |
| The Silence of the Lambs | Book | **MISSING as book** (movie present) → confirmed-missing |
| Gone Girl | Movie | **PRESENT** #3150 |
| Kill Bill | Movie | **PRESENT** #2723 (*The Whole Bloody Affair*) |
| Snowpiercer | Movie | **PRESENT** #3518 |
| The Great Gatsby | Book | **PRESENT** #16495 |

---

## 4. Ingestion recommendation (for when you sequence it — NOT run here)

- **Do targeted single-title adds, not a `populate-catalog.ts` re-run.** The confirmed-missing set
  is tiny (~55). Re-running the bulk populate pulls large batches from every API and re-scans the
  whole catalog to dedup — far more API + Supabase egress for no extra coverage. Add by external ID
  per title instead.
- **Suggested order (leverage-first):** Outer Wilds (IGDB, act7) → The Time Traveler's Wife
  (Google Books, act5) → The Power Broker (act4) → Mistborn / Altered Carbon / The Silence of the
  Lambs (act3) → the act-2 cluster → act-1 long tail.
- **Egress note:** the act-1 long tail is ~40 of the 55. If egress/cost is tight, ingest act≥2
  first (15 titles) and batch the act-1 tail later — each act-1 title unlocks only one pending
  connection.
- **Cross-media caveat:** ~15 of the missing books/series exist in the catalog in *another medium*
  (noted inline). Ingesting the missing form is still correct (the corpus references that specific
  medium), but **dedup will not catch them** by external ID — they are genuinely separate items.
- **Webtoon caveat:** *Lore Olympus* may not be in Google Books; consider a comic/webtoon source or defer.

---

## Artifacts (uncommitted, local)
- `scripts/_recon-catalog-expansion.ts` — re-runnable reconciliation (read-only).
- `catalog-expansion-titles.json` — the 460 parsed sheet rows.
- `catalog-expansion-recon.json` — full per-title verdicts (present/missing, matches, fuzzy, disagreements).
