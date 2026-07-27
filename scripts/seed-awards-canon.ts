/**
 * seed-awards-canon.ts (provenance/awards workstream, step 1 — pure marking)
 *
 * Seeds the relational public.awards table from curated winner lists
 * (winners only, result='won'). Marks EXISTING catalog items only:
 *   - matched   → Award row (createMany skipDuplicates — idempotent)
 *               + award key merged into items.awards JSON display cache
 *   - unmatched → scripts/awards-pending-review.json (never silent-drop,
 *                 never silent-ingest — the delta is step 3/4's work-list)
 *
 * Lists: Oscar Best Picture 1927–2024 · Palme d'Or 1975–2025 ·
 *        Emmy Drama/Comedy 1990–2025 + Limited (confident era only) ·
 *        Grammy AOTY 1959–2025 · TGA GotY 2014–2025 ·
 *        Booker 1969–2025 · Hugo Best Novel 1953–2025
 * 2025-cycle winners verified against the web 2026-07-25 (TGA: Clair
 * Obscur; Emmys: The Pitt/The Studio/Adolescence; Booker: Flesh;
 * Hugo: The Tainted Cup).
 *
 * Deliberately SKIPPED (shaky-memory bar — do not guess):
 *   - Emmy Limited 1990–1999, 2001, 2005–2007 (uncertain winners)
 *   - Emmy Limited 2012–2013 (category merged with TV movies; winners
 *     Game Change / Behind the Candelabra are films, not series)
 *   - Palme pre-1975 (Grand Prix era naming), Palme 2020 (no festival)
 *   - Booker "Lost Booker" (1970, awarded retroactively 2010)
 *
 * year semantics per award's own convention (see prisma Award docs):
 *   oscar/palme/tga → work/edition year; emmy/grammy/booker/hugo → award year.
 * Matching year (`y`) is the catalog item's expected year; award year
 * (`ay`) defaults to `y` where they coincide.
 *
 * Run: npx tsx scripts/seed-awards-canon.ts --dry-run   # report only
 *      npx tsx scripts/seed-awards-canon.ts             # write
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import { awardAllowedForType } from "../src/lib/awards";

const DRY = process.argv.includes("--dry-run");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// ── entry: t=title, y=item(match) year, ay=award year if different,
//    who=required person token (books/music), alt=alternate titles ──
type Entry = { t: string; y: number; ay?: number; who?: string; alt?: string[] };
type AwardList = {
  key: string; category: string; type: "movie" | "tv" | "game" | "book" | "music";
  entries: Entry[];
};

const LISTS: AwardList[] = [
  {
    key: "oscar", category: "Best Picture", type: "movie",
    entries: [
      { t: "Wings", y: 1927 }, { t: "The Broadway Melody", y: 1929 },
      { t: "All Quiet on the Western Front", y: 1930 }, { t: "Cimarron", y: 1931 },
      { t: "Grand Hotel", y: 1932 }, { t: "Cavalcade", y: 1933 },
      { t: "It Happened One Night", y: 1934 }, { t: "Mutiny on the Bounty", y: 1935 },
      { t: "The Great Ziegfeld", y: 1936 }, { t: "The Life of Emile Zola", y: 1937 },
      { t: "You Can't Take It with You", y: 1938 }, { t: "Gone with the Wind", y: 1939 },
      { t: "Rebecca", y: 1940 }, { t: "How Green Was My Valley", y: 1941 },
      { t: "Mrs. Miniver", y: 1942 }, { t: "Casablanca", y: 1942, ay: 1943 },
      { t: "Going My Way", y: 1944 }, { t: "The Lost Weekend", y: 1945 },
      { t: "The Best Years of Our Lives", y: 1946 }, { t: "Gentleman's Agreement", y: 1947 },
      { t: "Hamlet", y: 1948 }, { t: "All the King's Men", y: 1949 },
      { t: "All About Eve", y: 1950 }, { t: "An American in Paris", y: 1951 },
      { t: "The Greatest Show on Earth", y: 1952 }, { t: "From Here to Eternity", y: 1953 },
      { t: "On the Waterfront", y: 1954 }, { t: "Marty", y: 1955 },
      { t: "Around the World in 80 Days", y: 1956 }, { t: "The Bridge on the River Kwai", y: 1957 },
      { t: "Gigi", y: 1958 }, { t: "Ben-Hur", y: 1959 },
      { t: "The Apartment", y: 1960 }, { t: "West Side Story", y: 1961 },
      { t: "Lawrence of Arabia", y: 1962 }, { t: "Tom Jones", y: 1963 },
      { t: "My Fair Lady", y: 1964 }, { t: "The Sound of Music", y: 1965 },
      { t: "A Man for All Seasons", y: 1966 }, { t: "In the Heat of the Night", y: 1967 },
      { t: "Oliver!", y: 1968 }, { t: "Midnight Cowboy", y: 1969 },
      { t: "Patton", y: 1970 }, { t: "The French Connection", y: 1971 },
      { t: "The Godfather", y: 1972 }, { t: "The Sting", y: 1973 },
      { t: "The Godfather Part II", y: 1974 }, { t: "One Flew Over the Cuckoo's Nest", y: 1975 },
      { t: "Rocky", y: 1976 }, { t: "Annie Hall", y: 1977 },
      { t: "The Deer Hunter", y: 1978 }, { t: "Kramer vs. Kramer", y: 1979 },
      { t: "Ordinary People", y: 1980 }, { t: "Chariots of Fire", y: 1981 },
      { t: "Gandhi", y: 1982 }, { t: "Terms of Endearment", y: 1983 },
      { t: "Amadeus", y: 1984 }, { t: "Out of Africa", y: 1985 },
      { t: "Platoon", y: 1986 }, { t: "The Last Emperor", y: 1987 },
      { t: "Rain Man", y: 1988 }, { t: "Driving Miss Daisy", y: 1989 },
      { t: "Dances with Wolves", y: 1990 }, { t: "The Silence of the Lambs", y: 1991 },
      { t: "Unforgiven", y: 1992 }, { t: "Schindler's List", y: 1993 },
      { t: "Forrest Gump", y: 1994 }, { t: "Braveheart", y: 1995 },
      { t: "The English Patient", y: 1996 }, { t: "Titanic", y: 1997 },
      { t: "Shakespeare in Love", y: 1998 }, { t: "American Beauty", y: 1999 },
      { t: "Gladiator", y: 2000 }, { t: "A Beautiful Mind", y: 2001 },
      { t: "Chicago", y: 2002 }, { t: "The Lord of the Rings: The Return of the King", y: 2003 },
      { t: "Million Dollar Baby", y: 2004 }, { t: "Crash", y: 2005 },
      { t: "The Departed", y: 2006 }, { t: "No Country for Old Men", y: 2007 },
      { t: "Slumdog Millionaire", y: 2008 }, { t: "The Hurt Locker", y: 2009 },
      { t: "The King's Speech", y: 2010 }, { t: "The Artist", y: 2011 },
      { t: "Argo", y: 2012 }, { t: "12 Years a Slave", y: 2013 },
      { t: "Birdman", y: 2014 }, { t: "Spotlight", y: 2015 },
      { t: "Moonlight", y: 2016 }, { t: "The Shape of Water", y: 2017 },
      { t: "Green Book", y: 2018 }, { t: "Parasite", y: 2019 },
      { t: "Nomadland", y: 2020 }, { t: "CODA", y: 2021 },
      { t: "Everything Everywhere All at Once", y: 2022 }, { t: "Oppenheimer", y: 2023 },
      { t: "Anora", y: 2024 },
    ],
  },
  {
    key: "palme", category: "", type: "movie",
    entries: [
      { t: "Chronicle of the Years of Fire", y: 1975 }, { t: "Taxi Driver", y: 1976 },
      { t: "Padre Padrone", y: 1977 }, { t: "The Tree of Wooden Clogs", y: 1978 },
      { t: "Apocalypse Now", y: 1979 }, { t: "The Tin Drum", y: 1979 },
      { t: "All That Jazz", y: 1979, ay: 1980 }, { t: "Kagemusha", y: 1980 },
      { t: "Man of Iron", y: 1981 }, { t: "Missing", y: 1982 }, { t: "Yol", y: 1982 },
      { t: "The Ballad of Narayama", y: 1983 }, { t: "Paris, Texas", y: 1984 },
      { t: "When Father Was Away on Business", y: 1985 }, { t: "The Mission", y: 1986 },
      { t: "Under the Sun of Satan", y: 1987 }, { t: "Pelle the Conqueror", y: 1987, ay: 1988 },
      { t: "Sex, Lies, and Videotape", y: 1989 }, { t: "Wild at Heart", y: 1990 },
      { t: "Barton Fink", y: 1991 }, { t: "The Best Intentions", y: 1992 },
      { t: "The Piano", y: 1993 }, { t: "Farewell My Concubine", y: 1993 },
      { t: "Pulp Fiction", y: 1994 }, { t: "Underground", y: 1995 },
      { t: "Secrets & Lies", y: 1996 }, { t: "Taste of Cherry", y: 1997 },
      { t: "The Eel", y: 1997 }, { t: "Eternity and a Day", y: 1998 },
      { t: "Rosetta", y: 1999 }, { t: "Dancer in the Dark", y: 2000 },
      { t: "The Son's Room", y: 2001 }, { t: "The Pianist", y: 2002 },
      { t: "Elephant", y: 2003 }, { t: "Fahrenheit 9/11", y: 2004 },
      { t: "L'Enfant", y: 2005, alt: ["The Child"] },
      { t: "The Wind That Shakes the Barley", y: 2006 },
      { t: "4 Months, 3 Weeks and 2 Days", y: 2007 },
      { t: "The Class", y: 2008, alt: ["Entre les murs"] },
      { t: "The White Ribbon", y: 2009 },
      { t: "Uncle Boonmee Who Can Recall His Past Lives", y: 2010 },
      { t: "The Tree of Life", y: 2011 }, { t: "Amour", y: 2012 },
      { t: "Blue Is the Warmest Colour", y: 2013 }, { t: "Winter Sleep", y: 2014 },
      { t: "Dheepan", y: 2015 }, { t: "I, Daniel Blake", y: 2016 },
      { t: "The Square", y: 2017 }, { t: "Shoplifters", y: 2018 },
      { t: "Parasite", y: 2019 }, { t: "Titane", y: 2021 },
      { t: "Triangle of Sadness", y: 2022 }, { t: "Anatomy of a Fall", y: 2023 },
      { t: "Anora", y: 2024 }, { t: "It Was Just an Accident", y: 2025 },
    ],
  },
  {
    key: "emmy", category: "Outstanding Drama Series", type: "tv",
    entries: [
      { t: "L.A. Law", y: 1986, ay: 1990 }, { t: "L.A. Law", y: 1986, ay: 1991 },
      { t: "Northern Exposure", y: 1990, ay: 1992 }, { t: "Picket Fences", y: 1992, ay: 1993 },
      { t: "Picket Fences", y: 1992, ay: 1994 }, { t: "NYPD Blue", y: 1993, ay: 1995 },
      { t: "ER", y: 1994, ay: 1996 }, { t: "Law & Order", y: 1990, ay: 1997 },
      { t: "The Practice", y: 1997, ay: 1998 }, { t: "The Practice", y: 1997, ay: 1999 },
      { t: "The West Wing", y: 1999, ay: 2000 }, { t: "The West Wing", y: 1999, ay: 2001 },
      { t: "The West Wing", y: 1999, ay: 2002 }, { t: "The West Wing", y: 1999, ay: 2003 },
      { t: "The Sopranos", y: 1999, ay: 2004 }, { t: "Lost", y: 2004, ay: 2005 },
      { t: "24", y: 2001, ay: 2006 }, { t: "The Sopranos", y: 1999, ay: 2007 },
      { t: "Mad Men", y: 2007, ay: 2008 }, { t: "Mad Men", y: 2007, ay: 2009 },
      { t: "Mad Men", y: 2007, ay: 2010 }, { t: "Mad Men", y: 2007, ay: 2011 },
      { t: "Homeland", y: 2011, ay: 2012 }, { t: "Breaking Bad", y: 2008, ay: 2013 },
      { t: "Breaking Bad", y: 2008, ay: 2014 }, { t: "Game of Thrones", y: 2011, ay: 2015 },
      { t: "Game of Thrones", y: 2011, ay: 2016 }, { t: "The Handmaid's Tale", y: 2017 },
      { t: "Game of Thrones", y: 2011, ay: 2018 }, { t: "Game of Thrones", y: 2011, ay: 2019 },
      { t: "Succession", y: 2018, ay: 2020 }, { t: "The Crown", y: 2016, ay: 2021 },
      { t: "Succession", y: 2018, ay: 2022 }, { t: "Succession", y: 2018, ay: 2023 },
      { t: "Shōgun", y: 2024 }, { t: "The Pitt", y: 2025 },
    ],
  },
  {
    key: "emmy", category: "Outstanding Comedy Series", type: "tv",
    entries: [
      { t: "Murphy Brown", y: 1988, ay: 1990 }, { t: "Cheers", y: 1982, ay: 1991 },
      { t: "Murphy Brown", y: 1988, ay: 1992 }, { t: "Seinfeld", y: 1989, ay: 1993 },
      { t: "Frasier", y: 1993, ay: 1994 }, { t: "Frasier", y: 1993, ay: 1995 },
      { t: "Frasier", y: 1993, ay: 1996 }, { t: "Frasier", y: 1993, ay: 1997 },
      { t: "Frasier", y: 1993, ay: 1998 }, { t: "Ally McBeal", y: 1997, ay: 1999 },
      { t: "Will & Grace", y: 1998, ay: 2000 }, { t: "Sex and the City", y: 1998, ay: 2001 },
      { t: "Friends", y: 1994, ay: 2002 }, { t: "Everybody Loves Raymond", y: 1996, ay: 2003 },
      { t: "Arrested Development", y: 2003, ay: 2004 }, { t: "Everybody Loves Raymond", y: 1996, ay: 2005 },
      { t: "The Office", y: 2005, ay: 2006 }, { t: "30 Rock", y: 2006, ay: 2007 },
      { t: "30 Rock", y: 2006, ay: 2008 }, { t: "30 Rock", y: 2006, ay: 2009 },
      { t: "Modern Family", y: 2009, ay: 2010 }, { t: "Modern Family", y: 2009, ay: 2011 },
      { t: "Modern Family", y: 2009, ay: 2012 }, { t: "Modern Family", y: 2009, ay: 2013 },
      { t: "Modern Family", y: 2009, ay: 2014 }, { t: "Veep", y: 2012, ay: 2015 },
      { t: "Veep", y: 2012, ay: 2016 }, { t: "Veep", y: 2012, ay: 2017 },
      { t: "The Marvelous Mrs. Maisel", y: 2017, ay: 2018 }, { t: "Fleabag", y: 2016, ay: 2019 },
      { t: "Schitt's Creek", y: 2015, ay: 2020 }, { t: "Ted Lasso", y: 2020, ay: 2021 },
      { t: "Ted Lasso", y: 2020, ay: 2022 }, { t: "The Bear", y: 2022, ay: 2023 },
      { t: "Hacks", y: 2021, ay: 2024 }, { t: "The Studio", y: 2025 },
    ],
  },
  {
    key: "emmy", category: "Outstanding Limited Series", type: "tv",
    entries: [
      { t: "The Corner", y: 2000 }, { t: "Band of Brothers", y: 2001, ay: 2002 },
      { t: "Taken", y: 2002, ay: 2003 }, { t: "Angels in America", y: 2003, ay: 2004 },
      { t: "John Adams", y: 2008 }, { t: "Little Dorrit", y: 2008, ay: 2009 },
      { t: "The Pacific", y: 2010 }, { t: "Downton Abbey", y: 2010, ay: 2011 },
      { t: "Fargo", y: 2014 }, { t: "Olive Kitteridge", y: 2014, ay: 2015 },
      { t: "The People v. O. J. Simpson: American Crime Story", y: 2016, alt: ["American Crime Story"] },
      { t: "Big Little Lies", y: 2017 },
      { t: "The Assassination of Gianni Versace: American Crime Story", y: 2018, alt: ["American Crime Story"] },
      { t: "Chernobyl", y: 2019 }, { t: "Watchmen", y: 2019, ay: 2020 },
      { t: "The Queen's Gambit", y: 2020, ay: 2021 }, { t: "The White Lotus", y: 2021, ay: 2022 },
      { t: "Beef", y: 2023 }, { t: "Baby Reindeer", y: 2024 }, { t: "Adolescence", y: 2025 },
    ],
  },
  {
    key: "grammy", category: "Album of the Year", type: "music",
    entries: [
      { t: "The Music from Peter Gunn", y: 1958, ay: 1959, who: "mancini", alt: ["Peter Gunn"] },
      { t: "Come Dance with Me!", y: 1959, who: "sinatra" },
      { t: "The Button-Down Mind of Bob Newhart", y: 1960, ay: 1961, who: "newhart" },
      { t: "Judy at Carnegie Hall", y: 1961, ay: 1962, who: "garland" },
      { t: "The First Family", y: 1962, ay: 1963, who: "meader" },
      { t: "The Barbra Streisand Album", y: 1963, ay: 1964, who: "streisand" },
      { t: "Getz/Gilberto", y: 1964, ay: 1965, who: "getz" },
      { t: "September of My Years", y: 1965, ay: 1966, who: "sinatra" },
      { t: "A Man and His Music", y: 1965, ay: 1967, who: "sinatra" },
      { t: "Sgt. Pepper's Lonely Hearts Club Band", y: 1967, ay: 1968, who: "beatles" },
      { t: "By the Time I Get to Phoenix", y: 1967, ay: 1969, who: "campbell" },
      { t: "Blood, Sweat & Tears", y: 1968, ay: 1970, who: "sweat" },
      { t: "Bridge over Troubled Water", y: 1970, ay: 1971, who: "garfunkel" },
      { t: "Tapestry", y: 1971, ay: 1972, who: "king" },
      { t: "The Concert for Bangladesh", y: 1971, ay: 1973, who: "harrison" },
      { t: "Innervisions", y: 1973, ay: 1974, who: "wonder" },
      { t: "Fulfillingness' First Finale", y: 1974, ay: 1975, who: "wonder" },
      { t: "Still Crazy After All These Years", y: 1975, ay: 1976, who: "simon" },
      { t: "Songs in the Key of Life", y: 1976, ay: 1977, who: "wonder" },
      { t: "Rumours", y: 1977, ay: 1978, who: "fleetwood" },
      { t: "Saturday Night Fever", y: 1977, ay: 1979, who: "bee gees" },
      { t: "52nd Street", y: 1978, ay: 1980, who: "joel" },
      { t: "Christopher Cross", y: 1979, ay: 1981, who: "cross" },
      { t: "Double Fantasy", y: 1980, ay: 1982, who: "lennon" },
      { t: "Toto IV", y: 1982, ay: 1983, who: "toto" },
      { t: "Thriller", y: 1982, ay: 1984, who: "jackson" },
      { t: "Can't Slow Down", y: 1983, ay: 1985, who: "richie" },
      { t: "No Jacket Required", y: 1985, ay: 1986, who: "collins" },
      { t: "Graceland", y: 1986, ay: 1987, who: "simon" },
      { t: "The Joshua Tree", y: 1987, ay: 1988, who: "u2" },
      { t: "Faith", y: 1987, ay: 1989, who: "michael" },
      { t: "Nick of Time", y: 1989, ay: 1990, who: "raitt" },
      { t: "Back on the Block", y: 1989, ay: 1991, who: "quincy" },
      { t: "Unforgettable... with Love", y: 1991, ay: 1992, who: "cole" },
      { t: "Unplugged", y: 1992, ay: 1993, who: "clapton" },
      { t: "The Bodyguard", y: 1992, ay: 1994, who: "houston" },
      { t: "MTV Unplugged", y: 1994, ay: 1995, who: "bennett" },
      { t: "Jagged Little Pill", y: 1995, ay: 1996, who: "morissette" },
      { t: "Falling into You", y: 1996, ay: 1997, who: "dion" },
      { t: "Time Out of Mind", y: 1997, ay: 1998, who: "dylan" },
      { t: "The Miseducation of Lauryn Hill", y: 1998, ay: 1999, who: "hill" },
      { t: "Supernatural", y: 1999, ay: 2000, who: "santana" },
      { t: "Two Against Nature", y: 2000, ay: 2001, who: "steely" },
      { t: "O Brother, Where Art Thou?", y: 2000, ay: 2002, who: "various" },
      { t: "Come Away with Me", y: 2002, ay: 2003, who: "jones" },
      { t: "Speakerboxxx/The Love Below", y: 2003, ay: 2004, who: "outkast" },
      { t: "Genius Loves Company", y: 2004, ay: 2005, who: "charles" },
      { t: "How to Dismantle an Atomic Bomb", y: 2004, ay: 2006, who: "u2" },
      { t: "Taking the Long Way", y: 2006, ay: 2007, who: "chicks" },
      { t: "River: The Joni Letters", y: 2007, ay: 2008, who: "hancock" },
      { t: "Raising Sand", y: 2007, ay: 2009, who: "krauss" },
      { t: "Fearless", y: 2008, ay: 2010, who: "swift" },
      { t: "The Suburbs", y: 2010, ay: 2011, who: "arcade" },
      { t: "21", y: 2011, ay: 2012, who: "adele" },
      { t: "Babel", y: 2012, ay: 2013, who: "mumford" },
      { t: "Random Access Memories", y: 2013, ay: 2014, who: "daft" },
      { t: "Morning Phase", y: 2014, ay: 2015, who: "beck" },
      { t: "1989", y: 2014, ay: 2016, who: "swift" },
      { t: "25", y: 2015, ay: 2017, who: "adele" },
      { t: "24K Magic", y: 2016, ay: 2018, who: "mars" },
      { t: "Golden Hour", y: 2018, ay: 2019, who: "musgraves" },
      { t: "When We All Fall Asleep, Where Do We Go?", y: 2019, ay: 2020, who: "eilish" },
      { t: "folklore", y: 2020, ay: 2021, who: "swift" },
      { t: "We Are", y: 2021, ay: 2022, who: "batiste" },
      { t: "Harry's House", y: 2022, ay: 2023, who: "styles" },
      { t: "Midnights", y: 2022, ay: 2024, who: "swift" },
      { t: "Cowboy Carter", y: 2024, ay: 2025, who: "beyonce" },
    ],
  },
  {
    key: "tga", category: "Game of the Year", type: "game",
    entries: [
      { t: "Dragon Age: Inquisition", y: 2014 }, { t: "The Witcher 3: Wild Hunt", y: 2015 },
      { t: "Overwatch", y: 2016 }, { t: "The Legend of Zelda: Breath of the Wild", y: 2017 },
      { t: "God of War", y: 2018 }, { t: "Sekiro: Shadows Die Twice", y: 2019 },
      { t: "The Last of Us Part II", y: 2020 }, { t: "It Takes Two", y: 2021 },
      { t: "Elden Ring", y: 2022 }, { t: "Baldur's Gate 3", y: 2023 },
      { t: "Astro Bot", y: 2024 }, { t: "Clair Obscur: Expedition 33", y: 2025 },
    ],
  },
  {
    key: "booker", category: "", type: "book",
    entries: [
      { t: "Something to Answer For", y: 1969, who: "newby" },
      { t: "The Elected Member", y: 1970, who: "rubens" },
      { t: "In a Free State", y: 1971, who: "naipaul" },
      { t: "G.", y: 1972, who: "berger" },
      { t: "The Siege of Krishnapur", y: 1973, who: "farrell" },
      { t: "The Conservationist", y: 1974, who: "gordimer" },
      { t: "Holiday", y: 1974, who: "middleton" },
      { t: "Heat and Dust", y: 1975, who: "jhabvala" },
      { t: "Saville", y: 1976, who: "storey" },
      { t: "Staying On", y: 1977, who: "scott" },
      { t: "The Sea, the Sea", y: 1978, who: "murdoch" },
      { t: "Offshore", y: 1979, who: "fitzgerald" },
      { t: "Rites of Passage", y: 1980, who: "golding" },
      { t: "Midnight's Children", y: 1981, who: "rushdie" },
      { t: "Schindler's Ark", y: 1982, who: "keneally", alt: ["Schindler's List"] },
      { t: "Life & Times of Michael K", y: 1983, who: "coetzee" },
      { t: "Hotel du Lac", y: 1984, who: "brookner" },
      { t: "The Bone People", y: 1985, who: "hulme" },
      { t: "The Old Devils", y: 1986, who: "amis" },
      { t: "Moon Tiger", y: 1987, who: "lively" },
      { t: "Oscar and Lucinda", y: 1988, who: "carey" },
      { t: "The Remains of the Day", y: 1989, who: "ishiguro" },
      { t: "Possession", y: 1990, who: "byatt" },
      { t: "The Famished Road", y: 1991, who: "okri" },
      { t: "The English Patient", y: 1992, who: "ondaatje" },
      { t: "Sacred Hunger", y: 1992, who: "unsworth" },
      { t: "Paddy Clarke Ha Ha Ha", y: 1993, who: "doyle" },
      { t: "How Late It Was, How Late", y: 1994, who: "kelman" },
      { t: "The Ghost Road", y: 1995, who: "barker" },
      { t: "Last Orders", y: 1996, who: "swift" },
      { t: "The God of Small Things", y: 1997, who: "roy" },
      { t: "Amsterdam", y: 1998, who: "mcewan" },
      { t: "Disgrace", y: 1999, who: "coetzee" },
      { t: "The Blind Assassin", y: 2000, who: "atwood" },
      { t: "True History of the Kelly Gang", y: 2001, who: "carey" },
      { t: "Life of Pi", y: 2002, who: "martel" },
      { t: "Vernon God Little", y: 2003, who: "pierre" },
      { t: "The Line of Beauty", y: 2004, who: "hollinghurst" },
      { t: "The Sea", y: 2005, who: "banville" },
      { t: "The Inheritance of Loss", y: 2006, who: "desai" },
      { t: "The Gathering", y: 2007, who: "enright" },
      { t: "The White Tiger", y: 2008, who: "adiga" },
      { t: "Wolf Hall", y: 2009, who: "mantel" },
      { t: "The Finkler Question", y: 2010, who: "jacobson" },
      { t: "The Sense of an Ending", y: 2011, who: "barnes" },
      { t: "Bring Up the Bodies", y: 2012, who: "mantel" },
      { t: "The Luminaries", y: 2013, who: "catton" },
      { t: "The Narrow Road to the Deep North", y: 2014, who: "flanagan" },
      { t: "A Brief History of Seven Killings", y: 2015, who: "james" },
      { t: "The Sellout", y: 2016, who: "beatty" },
      { t: "Lincoln in the Bardo", y: 2017, who: "saunders" },
      { t: "Milkman", y: 2018, who: "burns" },
      { t: "The Testaments", y: 2019, who: "atwood" },
      { t: "Girl, Woman, Other", y: 2019, who: "evaristo" },
      { t: "Shuggie Bain", y: 2020, who: "stuart" },
      { t: "The Promise", y: 2021, who: "galgut" },
      { t: "The Seven Moons of Maali Almeida", y: 2022, who: "karunatilaka" },
      { t: "Prophet Song", y: 2023, who: "lynch" },
      { t: "Orbital", y: 2024, who: "harvey" },
      { t: "Flesh", y: 2025, who: "szalay" },
    ],
  },
  {
    key: "hugo", category: "Best Novel", type: "book",
    entries: [
      { t: "The Demolished Man", y: 1953, who: "bester" },
      { t: "They'd Rather Be Right", y: 1955, who: "clifton" },
      { t: "Double Star", y: 1956, who: "heinlein" },
      { t: "The Big Time", y: 1958, who: "leiber" },
      { t: "A Case of Conscience", y: 1959, who: "blish" },
      { t: "Starship Troopers", y: 1960, who: "heinlein" },
      { t: "A Canticle for Leibowitz", y: 1961, who: "miller" },
      { t: "Stranger in a Strange Land", y: 1962, who: "heinlein" },
      { t: "The Man in the High Castle", y: 1963, who: "dick" },
      { t: "Way Station", y: 1964, who: "simak" },
      { t: "The Wanderer", y: 1965, who: "leiber" },
      { t: "Dune", y: 1966, who: "herbert" },
      { t: "This Immortal", y: 1966, who: "zelazny", alt: ["...And Call Me Conrad"] },
      { t: "The Moon Is a Harsh Mistress", y: 1967, who: "heinlein" },
      { t: "Lord of Light", y: 1968, who: "zelazny" },
      { t: "Stand on Zanzibar", y: 1969, who: "brunner" },
      { t: "The Left Hand of Darkness", y: 1970, who: "guin" },
      { t: "Ringworld", y: 1971, who: "niven" },
      { t: "To Your Scattered Bodies Go", y: 1972, who: "farmer" },
      { t: "The Gods Themselves", y: 1973, who: "asimov" },
      { t: "Rendezvous with Rama", y: 1974, who: "clarke" },
      { t: "The Dispossessed", y: 1975, who: "guin" },
      { t: "The Forever War", y: 1976, who: "haldeman" },
      { t: "Where Late the Sweet Birds Sang", y: 1977, who: "wilhelm" },
      { t: "Gateway", y: 1978, who: "pohl" },
      { t: "Dreamsnake", y: 1979, who: "mcintyre" },
      { t: "The Fountains of Paradise", y: 1980, who: "clarke" },
      { t: "The Snow Queen", y: 1981, who: "vinge" },
      { t: "Downbelow Station", y: 1982, who: "cherryh" },
      { t: "Foundation's Edge", y: 1983, who: "asimov" },
      { t: "Startide Rising", y: 1984, who: "brin" },
      { t: "Neuromancer", y: 1985, who: "gibson" },
      { t: "Ender's Game", y: 1986, who: "card" },
      { t: "Speaker for the Dead", y: 1987, who: "card" },
      { t: "The Uplift War", y: 1988, who: "brin" },
      { t: "Cyteen", y: 1989, who: "cherryh" },
      { t: "Hyperion", y: 1990, who: "simmons" },
      { t: "The Vor Game", y: 1991, who: "bujold" },
      { t: "Barrayar", y: 1992, who: "bujold" },
      { t: "A Fire Upon the Deep", y: 1993, who: "vinge" },
      { t: "Doomsday Book", y: 1993, who: "willis" },
      { t: "Green Mars", y: 1994, who: "robinson" },
      { t: "Mirror Dance", y: 1995, who: "bujold" },
      { t: "The Diamond Age", y: 1996, who: "stephenson" },
      { t: "Blue Mars", y: 1997, who: "robinson" },
      { t: "Forever Peace", y: 1998, who: "haldeman" },
      { t: "To Say Nothing of the Dog", y: 1999, who: "willis" },
      { t: "A Deepness in the Sky", y: 2000, who: "vinge" },
      { t: "Harry Potter and the Goblet of Fire", y: 2001, who: "rowling" },
      { t: "American Gods", y: 2002, who: "gaiman" },
      { t: "Hominids", y: 2003, who: "sawyer" },
      { t: "Paladin of Souls", y: 2004, who: "bujold" },
      { t: "Jonathan Strange & Mr Norrell", y: 2005, who: "clarke" },
      { t: "Spin", y: 2006, who: "wilson" },
      { t: "Rainbows End", y: 2007, who: "vinge" },
      { t: "The Yiddish Policemen's Union", y: 2008, who: "chabon" },
      { t: "The Graveyard Book", y: 2009, who: "gaiman" },
      { t: "The Windup Girl", y: 2010, who: "bacigalupi" },
      { t: "The City & The City", y: 2010, who: "mieville" },
      { t: "Blackout", y: 2011, who: "willis" },
      { t: "All Clear", y: 2011, who: "willis" },
      { t: "Among Others", y: 2012, who: "walton" },
      { t: "Redshirts", y: 2013, who: "scalzi" },
      { t: "Ancillary Justice", y: 2014, who: "leckie" },
      { t: "The Three-Body Problem", y: 2015, who: "liu" },
      { t: "The Fifth Season", y: 2016, who: "jemisin" },
      { t: "The Obelisk Gate", y: 2017, who: "jemisin" },
      { t: "The Stone Sky", y: 2018, who: "jemisin" },
      { t: "The Calculating Stars", y: 2019, who: "kowal" },
      { t: "A Memory Called Empire", y: 2020, who: "martine" },
      { t: "Network Effect", y: 2021, who: "wells" },
      { t: "A Desolation Called Peace", y: 2022, who: "martine" },
      { t: "Nettle & Bone", y: 2023, who: "kingfisher" },
      { t: "Some Desperate Glory", y: 2024, who: "tesh" },
      { t: "The Tainted Cup", y: 2025, who: "bennett" },
    ],
  },
];

// ── normalization (probe lessons: diacritics, &→and, roman numerals) ──
const ROMAN: Record<string, string> = {
  ii: "2", iii: "3", iv: "4", vi: "6", vii: "7", viii: "8", ix: "9",
  xi: "11", xii: "12", xiii: "13", xiv: "14", xv: "15", xvi: "16",
};
function norm(s: string): string {
  const base = s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return base.split(" ").map((w) => ROMAN[w] ?? w).join(" ");
}
function peopleText(people: any): string {
  if (!Array.isArray(people)) return "";
  return norm(people.map((p) => p?.name ?? "").join(" "));
}

type Row = { id: number; title: string; year: number; people: any; awards: any };

function findMatch(list: AwardList, e: Entry, rows: Row[]): { hit?: Row; reason?: string } {
  const keys = [e.t, ...(e.alt ?? [])].map(norm);
  const awardYear = e.ay ?? e.y;
  const titleEq = rows.filter((r) => keys.includes(norm(r.title)));
  const titlePre = rows.filter((r) => {
    const rk = norm(r.title);
    return !keys.includes(rk) && keys.some((k) => rk.startsWith(k + " ") || k.startsWith(rk + " "));
  });

  const personOk = (r: Row) => !e.who || peopleText(r.people).includes(norm(e.who));

  // exact-title candidates ALWAYS beat prefix candidates (dry-run lesson:
  // "MAD" outranked "Mad Men", "Lost Utopia" hijacked "Lost"); prefix
  // fallback additionally requires the year to sit within ±1 of the
  // expected work/series year ("Missing in Action" ≠ "Missing" 1982).
  let cands: Row[] = [];
  if (list.type === "movie" || list.type === "game") {
    cands = titleEq.filter((r) => Math.abs(r.year - e.y) <= 1);
    if (!cands.length) cands = titleEq.filter((r) => Math.abs(r.year - e.y) <= 2);
    if (!cands.length) cands = titlePre.filter((r) => Math.abs(r.year - e.y) <= 1);
    cands.sort((a, b) => Math.abs(a.year - e.y) - Math.abs(b.year - e.y));
  } else if (list.type === "tv") {
    // series span years: item start-year must not postdate the award
    cands = titleEq.filter((r) => r.year <= awardYear + 1);
    if (!cands.length) cands = titlePre.filter((r) => r.year <= awardYear + 1 && Math.abs(r.year - e.y) <= 1);
    cands.sort((a, b) => b.year - a.year); // prefer the most recent qualifying start
  } else if (list.type === "music") {
    const inWindow = (r: Row) => r.year >= awardYear - 2 && r.year <= awardYear + 1;
    cands = titleEq.filter(inWindow).filter(personOk);
    if (!cands.length) cands = titlePre.filter(inWindow).filter(personOk);
    cands.sort((a, b) => Math.abs(a.year - e.y) - Math.abs(b.year - e.y));
  } else {
    // book: title + author, year unreliable (edition drift)
    const verified = [...titleEq, ...titlePre].filter(personOk);
    if (e.who && !verified.length && titleEq.length)
      return { reason: `ambiguous: title matches but author '${e.who}' unverified (${titleEq.slice(0, 3).map((r) => `#${r.id}`).join(",")})` };
    cands = verified;
    cands.sort((a, b) => Math.abs(a.year - e.y) - Math.abs(b.year - e.y));
  }

  if (list.type === "music" && !cands.length && titleEq.length)
    return { reason: "not matched: title present but artist/year window failed" };
  return cands.length ? { hit: cands[0] } : { reason: "not_in_catalog" };
}

async function main() {
  const rowsByType: Record<string, Row[]> = {};
  for (const t of ["movie", "tv", "game", "book", "music"]) {
    rowsByType[t] = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, title, year, people, awards FROM items WHERE type='${t}'`);
  }
  console.log(`Loaded: ${Object.entries(rowsByType).map(([t, r]) => `${t}=${r.length}`).join(", ")}\n`);

  const toCreate: { itemId: number; awardKey: string; category: string; year: number; result: string }[] = [];
  const pending: any[] = [];
  const matchedSamples: string[] = [];
  const summary: Record<string, { attempted: number; matched: number; pending: number }> = {};

  for (const list of LISTS) {
    const label = `${list.key}${list.category ? ":" + list.category : ""}`;
    const s = (summary[label] ??= { attempted: 0, matched: 0, pending: 0 });
    if (!awardAllowedForType(list.key, list.type))
      throw new Error(`registry mismatch: ${list.key} not allowed for ${list.type}`);
    for (const e of list.entries) {
      s.attempted++;
      const { hit, reason } = findMatch(list, e, rowsByType[list.type]);
      if (hit) {
        s.matched++;
        toCreate.push({ itemId: hit.id, awardKey: list.key, category: list.category, year: e.ay ?? e.y, result: "won" });
        if (matchedSamples.length < (DRY ? 500 : 15)) matchedSamples.push(`  ${label} ${e.ay ?? e.y}: "${e.t}" → #${hit.id} "${hit.title}" (${hit.year})`);
      } else {
        s.pending++;
        pending.push({ awardKey: list.key, category: list.category, year: e.ay ?? e.y, title: e.t, itemYear: e.y, person: e.who ?? null, type: list.type, reason });
      }
    }
  }

  console.log("=== Match summary ===");
  for (const [label, s] of Object.entries(summary))
    console.log(`  ${label.padEnd(40)} attempted=${String(s.attempted).padStart(3)}  matched=${String(s.matched).padStart(3)}  pending=${String(s.pending).padStart(3)}`);
  const totals = Object.values(summary).reduce((a, s) => ({ attempted: a.attempted + s.attempted, matched: a.matched + s.matched, pending: a.pending + s.pending }), { attempted: 0, matched: 0, pending: 0 });
  console.log(`  ${"TOTAL".padEnd(40)} attempted=${String(totals.attempted).padStart(3)}  matched=${String(totals.matched).padStart(3)}  pending=${String(totals.pending).padStart(3)}`);
  console.log("\n=== Sample matches ===");
  for (const m of matchedSamples) console.log(m);

  fs.writeFileSync("scripts/awards-pending-review.json", JSON.stringify(pending, null, 1));
  console.log(`\nPending-review delta → scripts/awards-pending-review.json (${pending.length} entries)`);

  if (DRY) {
    console.log(`\n[DRY RUN] No writes. ${toCreate.length} award rows would be created; JSON cache would gain keys on ${new Set(toCreate.map((c) => c.itemId)).size} items.`);
    await prisma.$disconnect();
    return;
  }

  // ── write award rows (idempotent via unique constraint) ──
  const created = await prisma.award.createMany({ data: toCreate, skipDuplicates: true });
  console.log(`\n✓ Award rows created: ${created.count} (${toCreate.length - created.count} already existed)`);

  // ── merge keys into items.awards JSON display cache ──
  const keysByItem = new Map<number, Set<string>>();
  for (const c of toCreate) {
    if (!keysByItem.has(c.itemId)) keysByItem.set(c.itemId, new Set());
    keysByItem.get(c.itemId)!.add(c.awardKey);
  }
  const allRows = Object.values(rowsByType).flat();
  const rowById = new Map(allRows.map((r) => [r.id, r]));
  const jsonAdded: { itemId: number; added: string[] }[] = [];
  for (const [itemId, keys] of keysByItem) {
    const cur: string[] = Array.isArray(rowById.get(itemId)?.awards) ? (rowById.get(itemId)!.awards as string[]) : [];
    const add = [...keys].filter((k) => !cur.includes(k));
    if (!add.length) continue;
    await prisma.item.update({ where: { id: itemId }, data: { awards: [...cur, ...add] } });
    jsonAdded.push({ itemId, added: add });
  }
  console.log(`✓ JSON display cache updated on ${jsonAdded.length} items`);

  fs.writeFileSync("scripts/awards-seed-created.json",
    JSON.stringify({ awardRows: toCreate, jsonAdded }, null, 1));
  console.log("✓ Reversibility record → scripts/awards-seed-created.json");

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
