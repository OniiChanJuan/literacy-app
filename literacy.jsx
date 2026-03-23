import { useState, useCallback, useRef, useMemo } from "react";

const TYPES = {
  movie:{label:"Movies",s:"Movie",icon:"🎬",color:"#E84855"},
  tv:{label:"TV Shows",s:"TV Show",icon:"📺",color:"#C45BAA"},
  book:{label:"Books",s:"Book",icon:"📖",color:"#3185FC"},
  manga:{label:"Manga",s:"Manga",icon:"🗾",color:"#FF6B6B"},
  comic:{label:"Comics",s:"Comic",icon:"💥",color:"#F9A620"},
  game:{label:"Games",s:"Game",icon:"🎮",color:"#2EC4B6"},
  music:{label:"Music",s:"Music",icon:"🎵",color:"#9B5DE5"},
  podcast:{label:"Podcasts",s:"Podcast",icon:"🎙️",color:"#00BBF9"},
};
const STATUSES = {completed:{label:"Completed",icon:"✓",color:"#2EC4B6"},in_progress:{label:"In Progress",icon:"▶",color:"#3185FC"},want_to:{label:"Want To",icon:"＋",color:"#9B5DE5"},dropped:{label:"Dropped",icon:"✕",color:"#E84855"}};
function statusLabel(key,type){
  const ongoing=["tv","manga","comic","podcast"].includes(type);
  if(key==="completed"&&ongoing)return"Caught Up";
  return STATUSES[key]?.label||key;
}
function statusIcon(key,type){
  const ongoing=["tv","manga","comic","podcast"].includes(type);
  if(key==="completed"&&ongoing)return"↑";
  return STATUSES[key]?.icon||"";
}
const PROG = {movie:{unit:"watched"},tv:{unit:"episode"},book:{unit:"page"},manga:{unit:"chapter"},comic:{unit:"issue"},game:{unit:"hour"},music:{unit:"listen"},podcast:{unit:"episode"}};
const PLATFORMS = {netflix:{name:"Netflix",color:"#E50914",icon:"▶"},prime:{name:"Prime Video",color:"#00A8E1",icon:"▶"},hulu:{name:"Hulu",color:"#1CE783",icon:"▶"},disney:{name:"Disney+",color:"#113CCF",icon:"▶"},hbo:{name:"Max",color:"#5822B4",icon:"▶"},steam:{name:"Steam",color:"#1B2838",icon:"⬇"},ps:{name:"PlayStation",color:"#003791",icon:"⬇"},xbox:{name:"Xbox",color:"#107C10",icon:"⬇"},switch:{name:"Switch",color:"#E60012",icon:"⬇"},kindle:{name:"Kindle",color:"#FF9900",icon:"📱"},audible:{name:"Audible",color:"#F8991D",icon:"🎧"},spotify:{name:"Spotify",color:"#1DB954",icon:"🎧"},apple_music:{name:"Apple Music",color:"#FC3C44",icon:"🎧"},mangaplus:{name:"Manga Plus",color:"#E40046",icon:"📱"},viz:{name:"VIZ",color:"#F39C12",icon:"📱"},comixology:{name:"ComiXology",color:"#2C3E50",icon:"📱"},apple_pod:{name:"Apple Podcasts",color:"#872EC4",icon:"🎧"},theaters:{name:"In Theaters",color:"#C45BAA",icon:"🎬"},library:{name:"Library",color:"#2EC4B6",icon:"🏛"}};
const AWARDS = {oscar:{name:"Academy Award",short:"Oscar",icon:"🏆"},palme:{name:"Palme d'Or",short:"Palme d'Or",icon:"🌴"},emmy:{name:"Emmy Award",short:"Emmy",icon:"🏆"},pulitzer:{name:"Pulitzer Prize",short:"Pulitzer",icon:"📜"},hugo:{name:"Hugo Award",short:"Hugo",icon:"🚀"},nebula:{name:"Nebula Award",short:"Nebula",icon:"✨"},goty:{name:"Game of the Year",short:"GOTY",icon:"🎮"},grammy:{name:"Grammy Award",short:"Grammy",icon:"🎵"},eisner:{name:"Eisner Award",short:"Eisner",icon:"✏️"},harvey:{name:"Harvey Award",short:"Harvey",icon:"💥"},bafta:{name:"BAFTA",short:"BAFTA",icon:"🎭"},peabody:{name:"Peabody Award",short:"Peabody",icon:"🎙️"},tga:{name:"The Game Awards",short:"TGA",icon:"🏆"}};
const EXT = {imdb:{name:"IMDb",max:10},rt:{name:"Rotten Tomatoes",max:100},meta:{name:"Metacritic",max:100},mal:{name:"MyAnimeList",max:10},ign:{name:"IGN",max:10},goodreads:{name:"Goodreads",max:5},pitchfork:{name:"Pitchfork",max:10}};

const VIBES = {
  dark:{label:"Dark",icon:"🌑",color:"#4a4a5a"},atmospheric:{label:"Atmospheric",icon:"🌫",color:"#5a7a8a"},
  "mind-bending":{label:"Mind-Bending",icon:"🌀",color:"#7b4397"},"slow-burn":{label:"Slow Burn",icon:"🕯",color:"#c0853a"},
  "thought-provoking":{label:"Thought-Provoking",icon:"💭",color:"#3185FC"},emotional:{label:"Emotional",icon:"💔",color:"#C45BAA"},
  epic:{label:"Epic",icon:"⚔",color:"#D4AF37"},intense:{label:"Intense",icon:"🔥",color:"#E84855"},
  wholesome:{label:"Wholesome",icon:"☀",color:"#2EC4B6"},gritty:{label:"Gritty",icon:"⛓",color:"#6b6b6b"},
  heartbreaking:{label:"Heartbreaking",icon:"💔",color:"#e84878"},satirical:{label:"Satirical",icon:"🎭",color:"#F9A620"},
  surreal:{label:"Surreal",icon:"🪞",color:"#9B5DE5"},brutal:{label:"Brutal",icon:"💀",color:"#8b0000"},
  uplifting:{label:"Uplifting",icon:"✨",color:"#2ecc71"},chaotic:{label:"Chaotic",icon:"🌪",color:"#e67e22"},
  immersive:{label:"Immersive",icon:"🎧",color:"#00BBF9"},melancholic:{label:"Melancholic",icon:"🌧",color:"#5b7fa5"},
  stylish:{label:"Stylish",icon:"💎",color:"#9b59b6"},cozy:{label:"Cozy",icon:"☕",color:"#d4a574"},
  cerebral:{label:"Cerebral",icon:"🧠",color:"#3498db"},heartfelt:{label:"Heartfelt",icon:"🤍",color:"#e8a0bf"},
  funny:{label:"Funny",icon:"😂",color:"#f1c40f"},"fast-paced":{label:"Fast-Paced",icon:"⚡",color:"#e74c3c"},
};
const VIBES_MAP = {
  1:["atmospheric","slow-burn","thought-provoking"],2:["gritty","dark","mind-bending"],3:["thought-provoking","atmospheric","dark"],
  4:["gritty","immersive","intense"],5:["mind-bending","atmospheric","slow-burn"],6:["atmospheric","melancholic","thought-provoking"],
  7:["epic","emotional","heartbreaking"],8:["thought-provoking","cerebral"],9:["epic","immersive","dark"],
  10:["epic","atmospheric","slow-burn"],11:["emotional","intense","heartbreaking"],12:["dark","brutal","epic"],
  13:["satirical","intense","mind-bending"],14:["fast-paced","stylish","wholesome"],15:["dark","thought-provoking","satirical"],
  16:["mind-bending","heartfelt","surreal"],17:["emotional","dark","heartbreaking"],18:["surreal","mind-bending","atmospheric"],
  19:["emotional","melancholic","heartbreaking"],20:["chaotic","dark","funny"],21:["mind-bending","atmospheric","slow-burn"],
  22:["emotional","uplifting","wholesome"],23:["heartbreaking","thought-provoking","dark"],24:["heartbreaking","emotional","epic"],
  25:["epic","emotional","mind-bending"],26:["intense","dark","epic"],27:["intense","slow-burn","dark"],
  28:["thought-provoking","intense","emotional"],29:["stylish","wholesome","fast-paced"],30:["atmospheric","melancholic","immersive"],
  101:["epic","atmospheric","immersive"],102:["immersive","gritty","chaotic"],103:["epic","dark","slow-burn"],
  104:["intense","dark","immersive"],105:["atmospheric","melancholic","immersive"],106:["epic","atmospheric","slow-burn"],
  107:["epic","uplifting","stylish"],108:["epic","intense","emotional"],
};
function getVibes(id){return VIBES_MAP[id]||[];}

const NAMES=["nova_sky","idle_hands","reelthoughts","pagecrawler","synthwave99","couch_critic","inkblot","ctrl_alt_defeat","bassline","the_librarian","pixel_pilgrim","chapter_one","vinyl_ghost","deep_focus","joystick_poet","scroll_sage"];
const RT=[["An absolute masterpiece.","Can't stop thinking about this.","Rarely does something hit this hard.","Best in years.","Make it your next experience."],["Really solid. Excellent.","Almost everything right.","Thoroughly enjoyed it.","One of the better ones lately.","Does something fresh."],["Decent but uneven.","Does what it sets out to do.","Mixed feelings overall.","Not bad, not great.","Won't revisit but don't regret it."],["Disappointing.","Struggled to get through.","Mostly fell flat."],["Not worth the time.","Don't get the appeal."]];
function makeReviews(id){const seed=(n)=>Math.abs(Math.sin(id*7.13+n*3.77));const c=4+Math.floor(seed(0)*4);const r=[];for(let i=0;i<c;i++){const s=seed(i+1);const rt=s<0.05?1:s<0.15?2:s<0.4?3:s<0.75?4:5;const p=RT[5-rt];const recRoll=seed(i+50);const rec=rt===5?"recommend":rt===4?(recRoll<0.9?"recommend":"mixed"):rt===3?(recRoll<0.3?"recommend":recRoll<0.8?"mixed":"skip"):rt===2?(recRoll<0.1?"mixed":"skip"):"skip";r.push({name:NAMES[Math.floor(seed(i+20)*NAMES.length)],rating:rt,rec,text:p[Math.floor(seed(i+10)*p.length)],days:1+Math.floor(seed(i+30)*60)});}return r;}
function aggScore(r){if(!r.length)return{avg:"0.0",count:0,dist:[0,0,0,0,0],recPct:0};const s=r.reduce((a,x)=>a+x.rating,0);const d=[0,0,0,0,0];r.forEach(x=>d[x.rating-1]++);const recs=r.filter(x=>x.rec==="recommend").length;return{avg:(s/r.length).toFixed(1),count:r.length*13+47,dist:d,recPct:Math.round((recs/r.length)*100)};}

const ITEMS=[
  {id:1,title:"Blade Runner 2049",type:"movie",genre:["Sci-Fi","Drama"],year:2017,cover:"linear-gradient(135deg,#0a1628,#1a3a5c,#e84855)",desc:"A young blade runner discovers a secret that threatens what's left of society.",totalEp:1,platforms:["prime","hbo"],ext:{imdb:8.0,rt:88,meta:81},awards:["oscar","bafta"],people:[{role:"Director",name:"Denis Villeneuve"},{role:"Star",name:"Ryan Gosling"},{role:"Star",name:"Harrison Ford"}]},
  {id:2,title:"Neuromancer",type:"book",genre:["Sci-Fi","Thriller"],year:1984,cover:"linear-gradient(135deg,#0d0d0d,#1a1a2e,#3185FC)",desc:"The pioneering cyberpunk novel that launched a genre.",totalEp:271,platforms:["kindle","audible","library"],ext:{goodreads:3.9},awards:["hugo","nebula"],people:[{role:"Author",name:"William Gibson"}]},
  {id:3,title:"Ghost in the Shell",type:"manga",genre:["Sci-Fi","Action"],year:1989,cover:"linear-gradient(135deg,#2d1b4e,#562b7c,#ff6b6b)",desc:"Major Kusanagi hunts cyber-criminals in a world of cyberbrains.",totalEp:11,platforms:["mangaplus","viz"],ext:{mal:8.0},awards:[],people:[{role:"Author",name:"Masamune Shirow"},{role:"Publisher",name:"Kodansha"}]},
  {id:4,title:"Cyberpunk 2077",type:"game",genre:["Sci-Fi","Action"],year:2020,cover:"linear-gradient(135deg,#fcee09,#f7a600,#e84855)",desc:"An open-world RPG set in the megalopolis of Night City.",totalEp:60,platforms:["steam","ps","xbox"],ext:{ign:7.0,meta:86},awards:["tga"],people:[{role:"Developer",name:"CD Projekt Red"},{role:"Composer",name:"Marcin Przybyłowicz"}]},
  {id:5,title:"Severance",type:"tv",genre:["Sci-Fi","Thriller","Mystery"],year:2022,cover:"linear-gradient(135deg,#e8f5e9,#a5d6a7,#1b5e20)",desc:"Employees undergo a procedure to separate work and personal memories.",totalEp:19,platforms:["apple_music"],ext:{imdb:8.7,rt:97},awards:["emmy"],people:[{role:"Creator",name:"Dan Erickson"},{role:"Star",name:"Adam Scott"},{role:"Director",name:"Ben Stiller"}]},
  {id:6,title:"OK Computer",type:"music",genre:["Indie","Sci-Fi"],year:1997,cover:"linear-gradient(135deg,#d4e4f7,#86b5e0,#2a4a7f)",desc:"Radiohead's landmark album exploring technology and alienation.",totalEp:12,platforms:["spotify","apple_music"],ext:{pitchfork:10.0},awards:["grammy"],people:[{role:"Artist",name:"Radiohead"},{role:"Producer",name:"Nigel Godrich"}]},
  {id:7,title:"Saga",type:"comic",genre:["Sci-Fi","Fantasy","Romance"],year:2012,cover:"linear-gradient(135deg,#ff9a9e,#fecfef,#a18cd1)",desc:"An epic space opera about star-crossed lovers from warring planets.",totalEp:66,platforms:["comixology"],ext:{},awards:["eisner","hugo","harvey"],people:[{role:"Writer",name:"Brian K. Vaughan"},{role:"Artist",name:"Fiona Staples"}]},
  {id:8,title:"Lex Fridman Podcast",type:"podcast",genre:["Sci-Fi","Documentary"],year:2018,cover:"linear-gradient(135deg,#0f0f0f,#1a1a2e,#00bbf9)",desc:"Conversations about AI, science, and intelligence.",totalEp:400,platforms:["spotify","apple_pod"],ext:{},awards:[],people:[{role:"Host",name:"Lex Fridman"}]},
  {id:9,title:"The Witcher 3",type:"game",genre:["Fantasy","Adventure"],year:2015,cover:"linear-gradient(135deg,#1a1a2e,#4a0e0e,#c0392b)",desc:"Geralt of Rivia hunts monsters and navigates political intrigue.",totalEp:100,platforms:["steam","ps","xbox","switch"],ext:{ign:9.3,meta:92},awards:["goty","tga","bafta"],people:[{role:"Developer",name:"CD Projekt Red"},{role:"Based on",name:"Andrzej Sapkowski"}]},
  {id:10,title:"Dune",type:"book",genre:["Sci-Fi","Adventure"],year:1965,cover:"linear-gradient(135deg,#f4d03f,#d4a017,#8b6914)",desc:"The desert planet Arrakis holds the universe's most valuable substance.",totalEp:412,platforms:["kindle","audible","library"],ext:{goodreads:4.2},awards:["hugo","nebula"],people:[{role:"Author",name:"Frank Herbert"}]},
  {id:11,title:"Arcane",type:"tv",genre:["Fantasy","Action","Drama"],year:2021,cover:"linear-gradient(135deg,#1a0533,#6b21a8,#f472b6)",desc:"Sisters fight on opposing sides in the undercity of Piltover.",totalEp:18,platforms:["netflix"],ext:{imdb:9.0,rt:100},awards:["emmy","bafta"],people:[{role:"Creator",name:"Christian Linke"},{role:"Voice",name:"Hailee Steinfeld"},{role:"Voice",name:"Ella Purnell"}]},
  {id:12,title:"Berserk",type:"manga",genre:["Fantasy","Action","Horror"],year:1989,cover:"linear-gradient(135deg,#0a0a0a,#2d0a0a,#8b0000)",desc:"A lone mercenary struggles against fate in a dark medieval world.",totalEp:364,platforms:["mangaplus","viz"],ext:{mal:9.4},awards:[],people:[{role:"Author",name:"Kentaro Miura"},{role:"Publisher",name:"Hakusensha"}]},
  {id:13,title:"Parasite",type:"movie",genre:["Thriller","Drama","Comedy"],year:2019,cover:"linear-gradient(135deg,#2d5016,#1a3a0a,#c8b900)",desc:"A poor family schemes to infiltrate a wealthy household.",totalEp:1,platforms:["hulu","prime"],ext:{imdb:8.5,rt:99,meta:96},awards:["oscar","palme","bafta"],people:[{role:"Director",name:"Bong Joon-ho"},{role:"Star",name:"Song Kang-ho"},{role:"Star",name:"Cho Yeo-jeong"}]},
  {id:14,title:"Hades",type:"game",genre:["Action","Fantasy"],year:2020,cover:"linear-gradient(135deg,#ff4500,#8b0000,#1a0a2e)",desc:"Defy the god of the dead as you battle out of the Underworld.",totalEp:40,platforms:["steam","ps","xbox","switch"],ext:{ign:9.0,meta:93},awards:["goty","bafta","hugo","nebula","tga"],people:[{role:"Developer",name:"Supergiant Games"},{role:"Director",name:"Greg Kasavin"}]},
  {id:15,title:"Watchmen",type:"comic",genre:["Sci-Fi","Mystery","Drama"],year:1986,cover:"linear-gradient(135deg,#f1c40f,#2c3e50,#1a1a2e)",desc:"Retired superheroes investigate a conspiracy in an alternate 1985.",totalEp:12,platforms:["comixology","library"],ext:{},awards:["hugo","eisner"],people:[{role:"Writer",name:"Alan Moore"},{role:"Artist",name:"Dave Gibbons"}]},
  {id:16,title:"Everything Everywhere",type:"movie",genre:["Sci-Fi","Action","Comedy"],year:2022,cover:"linear-gradient(135deg,#ff6b6b,#ee5a24,#9b59b6)",desc:"A laundromat owner connects with parallel universe versions of herself.",totalEp:1,platforms:["prime","hulu"],ext:{imdb:7.8,rt:94,meta:81},awards:["oscar"],people:[{role:"Directors",name:"Daniels"},{role:"Star",name:"Michelle Yeoh"},{role:"Star",name:"Ke Huy Quan"}]},
  {id:17,title:"The Last of Us",type:"game",genre:["Horror","Drama","Adventure"],year:2013,cover:"linear-gradient(135deg,#2d5016,#1a3a0a,#5a3e1b)",desc:"A survivor escorts a girl across a post-apocalyptic America.",totalEp:15,platforms:["ps"],ext:{ign:10.0,meta:95},awards:["goty","bafta","tga"],people:[{role:"Developer",name:"Naughty Dog"},{role:"Director",name:"Neil Druckmann"}]},
  {id:18,title:"House of Leaves",type:"book",genre:["Horror","Mystery"],year:2000,cover:"linear-gradient(135deg,#0a0a0a,#1a1a2e,#3185FC)",desc:"A family discovers their house is bigger on the inside.",totalEp:709,platforms:["kindle","library"],ext:{goodreads:4.1},awards:[],people:[{role:"Author",name:"Mark Z. Danielewski"}]},
  {id:19,title:"IGOR",type:"music",genre:["Indie","Romance","Drama"],year:2019,cover:"linear-gradient(135deg,#ffb6c1,#ff69b4,#da70d6)",desc:"Tyler the Creator's concept album tracing unrequited love.",totalEp:12,platforms:["spotify","apple_music"],ext:{pitchfork:8.0},awards:["grammy"],people:[{role:"Artist",name:"Tyler, the Creator"},{role:"Label",name:"Columbia"}]},
  {id:20,title:"Chainsaw Man",type:"manga",genre:["Action","Horror","Comedy"],year:2018,cover:"linear-gradient(135deg,#c0392b,#8e1c1c,#1a1a2e)",desc:"A devil hunter merges with a chainsaw devil and enters chaos.",totalEp:177,platforms:["mangaplus","viz"],ext:{mal:8.8},awards:["harvey"],people:[{role:"Author",name:"Tatsuki Fujimoto"},{role:"Publisher",name:"Shueisha"}]},
  {id:21,title:"Dark",type:"tv",genre:["Sci-Fi","Mystery","Thriller"],year:2017,cover:"linear-gradient(135deg,#0a1628,#1a2a3a,#4a6741)",desc:"A child's disappearance unravels a time-travel conspiracy.",totalEp:26,platforms:["netflix"],ext:{imdb:8.8,rt:95},awards:[],people:[{role:"Creators",name:"Baran bo Odar & Jantje Friese"},{role:"Star",name:"Louis Hofmann"}]},
  {id:22,title:"Celeste",type:"game",genre:["Adventure","Indie"],year:2018,cover:"linear-gradient(135deg,#4a90d9,#7b4397,#dc2430)",desc:"Help Madeline survive her climb up Celeste Mountain.",totalEp:20,platforms:["steam","switch","ps","xbox"],ext:{ign:9.0,meta:92},awards:["goty","tga"],people:[{role:"Developer",name:"Maddy Makes Games"},{role:"Director",name:"Matt Thorson"}]},
  {id:23,title:"Maus",type:"comic",genre:["Drama","Documentary"],year:1991,cover:"linear-gradient(135deg,#f5f5dc,#d4c5a9,#2c2c2c)",desc:"A Holocaust survivor's tale told through mice and cats.",totalEp:2,platforms:["comixology","library"],ext:{},awards:["pulitzer","eisner","harvey"],people:[{role:"Author/Artist",name:"Art Spiegelman"}]},
  {id:24,title:"Song of Achilles",type:"book",genre:["Fantasy","Romance","Drama"],year:2011,cover:"linear-gradient(135deg,#f4d03f,#c0392b,#1a1a2e)",desc:"A retelling of the Iliad through the eyes of Patroclus.",totalEp:352,platforms:["kindle","audible","library"],ext:{goodreads:4.4},awards:[],people:[{role:"Author",name:"Madeline Miller"}]},
  {id:25,title:"Interstellar",type:"movie",genre:["Sci-Fi","Drama","Adventure"],year:2014,cover:"linear-gradient(135deg,#0a0a0a,#1a2a3a,#f4d03f)",desc:"Explorers travel through a wormhole seeking a new home.",totalEp:1,platforms:["prime","hbo"],ext:{imdb:8.7,rt:73,meta:74},awards:["oscar","bafta"],people:[{role:"Director",name:"Christopher Nolan"},{role:"Star",name:"Matthew McConaughey"},{role:"Star",name:"Anne Hathaway"}]},
  {id:26,title:"Attack on Titan",type:"manga",genre:["Action","Fantasy","Horror"],year:2009,cover:"linear-gradient(135deg,#5c3d2e,#8b4513,#dc143c)",desc:"Humanity fights for survival against man-eating titans.",totalEp:139,platforms:["mangaplus","viz"],ext:{mal:8.5},awards:["harvey"],people:[{role:"Author",name:"Hajime Isayama"},{role:"Publisher",name:"Kodansha"}]},
  {id:27,title:"Breaking Bad",type:"tv",genre:["Drama","Thriller"],year:2008,cover:"linear-gradient(135deg,#2d5016,#556b2f,#f4d03f)",desc:"A chemistry teacher descends into the criminal underworld.",totalEp:62,platforms:["netflix","prime"],ext:{imdb:9.5,rt:96},awards:["emmy","peabody"],people:[{role:"Creator",name:"Vince Gilligan"},{role:"Star",name:"Bryan Cranston"},{role:"Star",name:"Aaron Paul"}]},
  {id:28,title:"DAMN.",type:"music",genre:["Drama","Indie"],year:2017,cover:"linear-gradient(135deg,#c0392b,#e74c3c,#fff)",desc:"Kendrick Lamar's Pulitzer-winning album on faith and loyalty.",totalEp:14,platforms:["spotify","apple_music"],ext:{pitchfork:9.2},awards:["pulitzer","grammy"],people:[{role:"Artist",name:"Kendrick Lamar"},{role:"Producer",name:"Various"}]},
  {id:29,title:"Spider-Verse",type:"movie",genre:["Action","Comedy","Sci-Fi"],year:2018,cover:"linear-gradient(135deg,#e74c3c,#2980b9,#1a1a2e)",desc:"Miles Morales meets Spider-people from other dimensions.",totalEp:1,platforms:["netflix","prime"],ext:{imdb:8.4,rt:97,meta:87},awards:["oscar","bafta"],people:[{role:"Directors",name:"Persichetti, Ramsey, Rothman"},{role:"Star",name:"Shameik Moore"}]},
  {id:30,title:"Hollow Knight",type:"game",genre:["Adventure","Action","Indie"],year:2017,cover:"linear-gradient(135deg,#1a1a2e,#2c3e50,#85c1e9)",desc:"A tiny knight descends into the vast ruins of a bug kingdom.",totalEp:30,platforms:["steam","switch","ps","xbox"],ext:{ign:9.4,meta:87},awards:["tga"],people:[{role:"Developer",name:"Team Cherry"}]},
];

const UPCOMING=[
  {id:101,title:"The Odyssey",type:"movie",genre:["Adventure","Drama","Fantasy"],releaseDate:"Jul 2025",cover:"linear-gradient(135deg,#1a3a5c,#c0a36e,#e84855)",desc:"Christopher Nolan's epic adaptation of Homer's ancient Greek poem, following Odysseus on his journey home from the Trojan War. Shot on IMAX film.",people:[{role:"Director",name:"Christopher Nolan"},{role:"Star",name:"Matt Damon"},{role:"Star",name:"Tom Holland"},{role:"Star",name:"Anne Hathaway"},{role:"Star",name:"Zendaya"},{role:"Composer",name:"Hans Zimmer"}],platforms:["theaters"],wantCount:4821},
  {id:102,title:"GTA VI",type:"game",genre:["Action","Adventure"],releaseDate:"Fall 2025",cover:"linear-gradient(135deg,#0a2a4a,#f97316,#e84855)",desc:"The next Grand Theft Auto set in a fictionalized Miami with dual protagonists — a first for the franchise. The trailer broke YouTube records within hours.",people:[{role:"Developer",name:"Rockstar Games"},{role:"Publisher",name:"Take-Two Interactive"}],platforms:["ps","xbox"],wantCount:8932},
  {id:103,title:"Winds of Winter",type:"book",genre:["Fantasy","Drama"],releaseDate:"TBA",cover:"linear-gradient(135deg,#1a1a2e,#4a6741,#87CEEB)",desc:"The long-awaited sixth novel in George R.R. Martin's A Song of Ice and Fire. The story continues from where A Dance with Dragons left off.",people:[{role:"Author",name:"George R.R. Martin"},{role:"Publisher",name:"Bantam Books"}],platforms:["kindle","audible","library"],wantCount:6201},
  {id:104,title:"Elden Ring: Nightreign",type:"game",genre:["Fantasy","Action","Adventure"],releaseDate:"Jun 2025",cover:"linear-gradient(135deg,#1a0a2e,#c0a36e,#4a0e4a)",desc:"A standalone co-op survival experience set in the Elden Ring universe with roguelike elements and a shrinking map.",people:[{role:"Developer",name:"FromSoftware"},{role:"Director",name:"Hidetaka Miyazaki"}],platforms:["steam","ps","xbox"],wantCount:3450},
  {id:105,title:"Hollow Knight: Silksong",type:"game",genre:["Adventure","Action","Indie"],releaseDate:"2025",cover:"linear-gradient(135deg,#f5f0e1,#c0392b,#4a0e0e)",desc:"The highly anticipated sequel starring Hornet in an all-new kingdom. Years in the making with almost no updates from the developer.",people:[{role:"Developer",name:"Team Cherry"}],platforms:["steam","switch","ps","xbox"],wantCount:5100},
  {id:106,title:"Dune: Messiah",type:"movie",genre:["Sci-Fi","Drama","Adventure"],releaseDate:"Late 2026",cover:"linear-gradient(135deg,#f4d03f,#8b6914,#1a1a2e)",desc:"The third Dune film adapting the second novel. Paul Atreides watches his empire crumble under its own prophecy.",people:[{role:"Director",name:"Denis Villeneuve"},{role:"Star",name:"Timothée Chalamet"},{role:"Star",name:"Zendaya"}],platforms:["theaters"],wantCount:4100},
  {id:107,title:"Superman",type:"movie",genre:["Action","Sci-Fi","Drama"],releaseDate:"Jul 2025",cover:"linear-gradient(135deg,#003791,#e84855,#f4d03f)",desc:"James Gunn launches his new DC Universe with a fresh take on Superman, featuring a seasoned hero alongside the Justice League.",people:[{role:"Director",name:"James Gunn"},{role:"Star",name:"David Corenswet"},{role:"Star",name:"Rachel Brosnahan"}],platforms:["theaters"],wantCount:3200},
  {id:108,title:"One Piece Final Saga",type:"manga",genre:["Action","Adventure","Fantasy"],releaseDate:"Ongoing",cover:"linear-gradient(135deg,#2980b9,#e74c3c,#f4d03f)",desc:"Eiichiro Oda's legendary manga enters its final saga after 25+ years, heading toward the ultimate treasure.",people:[{role:"Author",name:"Eiichiro Oda"},{role:"Publisher",name:"Shueisha"}],platforms:["mangaplus","viz"],wantCount:7500},
];

const ALL = [...ITEMS,...UPCOMING];

function getRecs(rated,all){const liked=rated.filter(r=>r.rating>=4);if(!liked.length)return[];const lt=new Set(liked.map(i=>i.type));const gw={};const vw={};liked.forEach(i=>{i.genre.forEach(g=>{gw[g]=(gw[g]||0)+1;});getVibes(i.id).forEach(v=>{vw[v]=(vw[v]||0)+1;});});const ri=new Set(rated.map(i=>i.id));return all.filter(i=>!ri.has(i.id)&&!i.releaseDate).map(item=>{let sc=0;let re=[];item.genre.forEach(g=>{if(gw[g]){sc+=gw[g]*2;re.push(g);}});getVibes(item.id).forEach(v=>{if(vw[v]){sc+=vw[v]*1.5;re.push(VIBES[v]?.label||v);}});if(!lt.has(item.type)){sc+=3;re.push("cross-media");}return{...item,sc,reasons:[...new Set(re)].slice(0,3)};}).filter(i=>i.sc>0).sort((a,b)=>b.sc-a.sc).slice(0,16);}

function getSimilar(item,allItems,type){
  if(!item)return[];const iv=getVibes(item.id);
  const others=allItems.filter(i=>i.id!==item.id&&!i.releaseDate);
  const vibeScore=(i)=>getVibes(i.id).filter(v=>iv.includes(v)).length;
  if(type==="same"){return others.filter(i=>i.type===item.type).sort((a,b)=>{const ga=a.genre.filter(g=>item.genre.includes(g)).length;const gb=b.genre.filter(g=>item.genre.includes(g)).length;return(gb+vibeScore(b))-(ga+vibeScore(a));}).slice(0,6);}
  if(type==="cross"){return others.filter(i=>i.type!==item.type&&(i.genre.some(g=>item.genre.includes(g))||vibeScore(i)>0)).sort((a,b)=>(vibeScore(b)*2+a.genre.filter(g=>item.genre.includes(g)).length)-(vibeScore(a)*2+b.genre.filter(g=>item.genre.includes(g)).length)).slice(0,6);}
  if(type==="genre"){return others.filter(i=>i.genre.some(g=>item.genre.includes(g))||vibeScore(i)>0).sort((a,b)=>vibeScore(b)-vibeScore(a)).slice(0,6);}
  if(type==="different"){return others.filter(i=>vibeScore(i)===0&&!i.genre.some(g=>item.genre.includes(g))).slice(0,6);}
  return[];
}

function Stars({rating,onRate,size=18,locked=false}){const[h,setH]=useState(0);return(<div style={{display:"flex",gap:1}} onClick={e=>e.stopPropagation()}>{[1,2,3,4,5].map(s=>(<span key={s} role="button" onClick={locked?undefined:(e)=>{e.stopPropagation();onRate(s===rating?0:s);}} onMouseEnter={locked?undefined:()=>setH(s)} onMouseLeave={locked?undefined:()=>setH(0)} style={{cursor:locked?"default":"pointer",fontSize:size,lineHeight:1,userSelect:"none",transition:"transform 0.15s",transform:!locked&&h===s?"scale(1.3)":"scale(1)",filter:(h&&!locked?s<=h:s<=rating)?"none":"grayscale(1) opacity(0.3)"}}>★</span>))}</div>);}

function RecTag({value,onChange}){
  const opts=[{k:"recommend",label:"Recommend",icon:"👍",color:"#2EC4B6"},{k:"mixed",label:"Mixed",icon:"🤷",color:"#F9A620"},{k:"skip",label:"Skip",icon:"👎",color:"#E84855"}];
  return(<div style={{display:"flex",gap:6}}>{opts.map(o=>(<button key={o.k} onClick={e=>{e.stopPropagation();onChange(value===o.k?null:o.k);}} style={{background:value===o.k?o.color:"rgba(255,255,255,0.05)",color:value===o.k?"#fff":"rgba(255,255,255,0.4)",border:value===o.k?"none":"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5,transition:"all 0.2s"}}><span>{o.icon}</span>{o.label}</button>))}</div>);
}

function MiniCard({item,onSelect}){const t=TYPES[item.type];return(
  <div onClick={()=>onSelect(item)} style={{minWidth:140,maxWidth:140,borderRadius:12,overflow:"hidden",cursor:"pointer",boxShadow:"0 3px 12px rgba(0,0,0,0.2)",flexShrink:0,transition:"transform 0.2s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
    <div style={{background:item.cover,height:170,position:"relative"}}>
      <div style={{position:"absolute",top:6,left:6,background:"rgba(0,0,0,0.55)",color:t.color,fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:5,textTransform:"uppercase"}}>{t.icon} {t.s}</div>
    </div>
    <div style={{background:"#141419",padding:"8px 8px 6px"}}>
      <div style={{fontSize:11,fontWeight:700,lineHeight:1.2,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
      <div style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>{item.year}</div>
    </div>
  </div>
);}

function ScrollRow({children,label,sub,icon,bg}){const ref=useRef(null);return(<div style={{marginBottom:36}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:10}}>{icon&&<span style={{fontSize:14,background:bg||"rgba(255,255,255,0.08)",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10}}>{icon}</span>}<div><div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800}}>{label}</div>{sub&&<div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:1}}>{sub}</div>}</div></div><div style={{display:"flex",gap:6}}><button onClick={()=>ref.current?.scrollBy({left:-300,behavior:"smooth"})} style={{width:30,height:30,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button><button onClick={()=>ref.current?.scrollBy({left:300,behavior:"smooth"})} style={{width:30,height:30,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>→</button></div></div><div ref={ref} style={{display:"flex",gap:16,overflowX:"auto",paddingBottom:8,scrollbarWidth:"none"}}>{children}</div></div>);}

function HoverPreview({item,x,y,ratings}){
  const t=TYPES[item.type];const isUp=!!item.releaseDate;
  const rev=makeReviews(item.id);const agg=aggScore(isUp?[]:rev);
  const sc=parseFloat(agg.avg);const sC=sc>=4?"#2EC4B6":sc>=3?"#F9A620":"#E84855";
  const userR=ratings[item.id]||0;
  const recPct=isUp?null:agg.recPct;
  return(<div style={{position:"fixed",left:Math.min(x+12,window.innerWidth-380),top:Math.min(y-30,window.innerHeight-520),width:360,background:"#1a1a24",border:"1px solid rgba(255,255,255,0.1)",borderRadius:18,boxShadow:"0 24px 70px rgba(0,0,0,0.7)",zIndex:2000,overflow:"hidden",pointerEvents:"none"}}>
    <div style={{background:item.cover,height:120,position:"relative"}}>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#1a1a24 0%,transparent 50%)"}}/>
      {isUp&&<div style={{position:"absolute",top:10,right:10,background:"linear-gradient(135deg,#9B5DE5,#C45BAA)",color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:7,textTransform:"uppercase"}}>Upcoming</div>}
      <div style={{position:"absolute",bottom:10,left:14,right:14}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800,lineHeight:1.2}}>{item.title}</div>
      </div>
    </div>
    <div style={{padding:"10px 14px 14px"}}>
      {/* Type + Year + Genre */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{background:t.color,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:6,textTransform:"uppercase"}}>{t.icon} {t.s}</span>
        <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{isUp?item.releaseDate:item.year}</span>
        <span style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginLeft:"auto"}}>{item.genre.join(" · ")}</span>
      </div>

      {/* Scores row */}
      {!isUp&&(<div style={{display:"flex",gap:8,marginBottom:10}}>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"rgba(255,255,255,0.03)",borderRadius:10}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:900,color:sC,lineHeight:1}}>{agg.avg}</div>
            <div style={{fontSize:8,color:"rgba(255,255,255,0.25)",marginTop:2}}>LITERACY</div>
          </div>
          <div style={{width:1,height:28,background:"rgba(255,255,255,0.08)"}}/>
          {item.ext&&Object.entries(item.ext).slice(0,3).map(([k,v])=>{const src=EXT[k];if(!src)return null;const pct=v/src.max*100;return(<div key={k} style={{textAlign:"center",minWidth:36}}>
            <div style={{fontSize:13,fontWeight:800,color:pct>=80?"#2EC4B6":pct>=60?"#F9A620":"#E84855",lineHeight:1}}>{v}{src.max===100?"%":""}</div>
            <div style={{fontSize:7,color:"rgba(255,255,255,0.25)",marginTop:2}}>{src.name}</div>
          </div>);})}
        </div>
        {recPct&&(<div style={{minWidth:70,padding:"10px 0",background:recPct>=70?"rgba(46,196,182,0.1)":recPct>=40?"rgba(249,166,32,0.1)":"rgba(232,72,85,0.1)",border:recPct>=70?"1px solid rgba(46,196,182,0.15)":recPct>=40?"1px solid rgba(249,166,32,0.15)":"1px solid rgba(232,72,85,0.15)",borderRadius:10,textAlign:"center"}}>
          <div style={{fontSize:10,marginBottom:2}}>{recPct>=70?"👍":recPct>=40?"🤷":"👎"}</div>
          <div style={{fontSize:18,fontWeight:900,color:recPct>=70?"#2EC4B6":recPct>=40?"#F9A620":"#E84855",lineHeight:1}}>{recPct}%</div>
          <div style={{fontSize:7,color:"rgba(255,255,255,0.3)",marginTop:3,textTransform:"uppercase",letterSpacing:0.5}}>Recommend</div>
        </div>)}
      </div>)}

      {/* Upcoming: want count */}
      {isUp&&item.wantCount&&(<div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"rgba(155,93,229,0.08)",borderRadius:10,marginBottom:10}}>
        <span style={{fontSize:14}}>👀</span>
        <span style={{fontSize:13,fontWeight:700,color:"#9B5DE5"}}>{item.wantCount.toLocaleString()}</span>
        <span style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>people waiting</span>
        <span style={{marginLeft:"auto",fontSize:12}}>🔥</span>
        <span style={{fontSize:13,fontWeight:700,color:"#F9A620"}}>{Math.min(99,Math.round(item.wantCount/100))}</span>
      </div>)}

      {/* Your rating if exists */}
      {userR>0&&(<div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
        <span style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>Your rating:</span>
        <span style={{color:"#f1c40f",fontSize:13}}>{"★".repeat(userR)}{"☆".repeat(5-userR)}</span>
      </div>)}

      {/* Description */}
      <p style={{fontSize:12,color:"rgba(255,255,255,0.55)",lineHeight:1.55,margin:"0 0 8px",display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{item.desc}</p>

      {/* Vibes */}
      {getVibes(item.id).length>0&&(
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
          {getVibes(item.id).map(v=>{const vb=VIBES[v];return vb?(<span key={v} style={{fontSize:9,color:"rgba(255,255,255,0.5)",background:"rgba(255,255,255,0.05)",padding:"2px 7px",borderRadius:10,display:"flex",alignItems:"center",gap:3}}><span style={{fontSize:9}}>{vb.icon}</span>{vb.label}</span>):null;})}
        </div>
      )}

      {/* People */}
      {item.people&&item.people.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
          {item.people.slice(0,4).map((p,i)=>(<span key={i} style={{fontSize:10,color:"rgba(255,255,255,0.45)",background:"rgba(255,255,255,0.05)",padding:"3px 8px",borderRadius:6}}>{p.role}: {p.name}</span>))}
        </div>
      )}

      {/* Awards */}
      {!isUp&&item.awards&&item.awards.length>0&&(
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {item.awards.slice(0,4).map(a=>{const aw=AWARDS[a];return aw?(<span key={a} style={{fontSize:10,display:"flex",alignItems:"center",gap:3,color:"rgba(255,255,255,0.5)"}}><span>{aw.icon}</span>{aw.short}</span>):null;})}
        </div>
      )}

      {/* Platforms */}
      {item.platforms&&item.platforms.length>0&&(
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
          {item.platforms.slice(0,4).map(pk=>{const pl=PLATFORMS[pk];return pl?(<span key={pk} style={{fontSize:9,color:"rgba(255,255,255,0.4)",background:"rgba(255,255,255,0.04)",padding:"2px 7px",borderRadius:5,display:"flex",alignItems:"center",gap:3}}><span style={{fontSize:8}}>{pl.icon}</span>{pl.name}</span>):null;})}
        </div>
      )}

      <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",textAlign:"center",borderTop:"1px solid rgba(255,255,255,0.05)",paddingTop:8}}>Click to view full page</div>
    </div>
  </div>);
}

function Card({item,ratings,statuses,onRate,onSelect}){
  const t=TYPES[item.type];const r=ratings[item.id]||0;const st=statuses[item.id];const isUp=!!item.releaseDate;
  const rev=useMemo(()=>isUp?[]:makeReviews(item.id),[item.id,isUp]);const agg=useMemo(()=>aggScore(rev),[rev]);
  const sc=parseFloat(agg.avg);const sC=sc>=4?"#2EC4B6":sc>=3?"#F9A620":"#E84855";const si=st?STATUSES[st]:null;
  const[showPreview,setShowPreview]=useState(false);const[mousePos,setMousePos]=useState({x:0,y:0});const hoverTimer=useRef(null);

  const handleMouseEnter=(e)=>{
    e.currentTarget.style.transform="translateY(-4px)";
    setMousePos({x:e.clientX,y:e.clientY});
    hoverTimer.current=setTimeout(()=>setShowPreview(true),800);
  };
  const handleMouseLeave=(e)=>{
    e.currentTarget.style.transform="";
    clearTimeout(hoverTimer.current);setShowPreview(false);
  };
  const handleMouseMove=(e)=>{setMousePos({x:e.clientX,y:e.clientY});};

return(<>
<div onClick={()=>{clearTimeout(hoverTimer.current);setShowPreview(false);onSelect(item);}} style={{minWidth:190,maxWidth:190,borderRadius:14,overflow:"hidden",cursor:"pointer",transition:"transform 0.2s,box-shadow 0.2s",boxShadow:"0 4px 20px rgba(0,0,0,0.25)",flexShrink:0,position:"relative"}} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onMouseMove={handleMouseMove}>
<div style={{background:item.cover,height:250,position:"relative"}}>
  <div style={{position:"absolute",top:10,left:10,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(8px)",color:t.color,fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:8,textTransform:"uppercase",display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:12}}>{t.icon}</span> {t.s}</div>
  {isUp&&<div style={{position:"absolute",top:10,right:10,background:"linear-gradient(135deg,#9B5DE5,#C45BAA)",color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:7,textTransform:"uppercase"}}>Upcoming</div>}
  {!isUp&&r>0&&<div style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,0.6)",color:"#f1c40f",fontSize:12,fontWeight:700,padding:"3px 8px",borderRadius:8}}>★ {r}</div>}
  {si&&<div style={{position:"absolute",bottom:10,left:10,background:si.color,color:"#fff",fontSize:9,fontWeight:700,padding:"3px 8px",borderRadius:7,textTransform:"uppercase",display:"flex",alignItems:"center",gap:3}}>{statusIcon(statuses[item.id],item.type)} {statusLabel(statuses[item.id],item.type)}</div>}
</div>
<div style={{background:"#141419",padding:"12px 12px 10px"}}>
  <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,fontWeight:700,lineHeight:1.25,marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:isUp?0:8}}>
    <span style={{fontSize:11,color:"rgba(255,255,255,0.35)"}}>{isUp?item.releaseDate:item.year}</span>
    {!isUp&&<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:12,fontWeight:700,color:sC}}>{agg.avg}</span><span style={{fontSize:10,color:"rgba(255,255,255,0.25)"}}>({agg.count})</span></div>}
    {isUp&&item.wantCount&&<span style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>👀 {(item.wantCount/1000).toFixed(1)}k</span>}
  </div>
  {!isUp&&<Stars rating={r} onRate={v=>onRate(item.id,v)} size={14}/>}
</div></div>
{showPreview&&<HoverPreview item={item} x={mousePos.x} y={mousePos.y} ratings={ratings}/>}
</>);}

/* ═══ FULL DETAIL PAGE ═══ */
function DetailPage({item,ratings,statuses,progress,recTags,reviews:userReviews,onRate,onStatus,onProgress,onRecTag,onReview,onBack,onSelect,onVibeBrowse}){
  const t=TYPES[item.type];const isUp=!!item.releaseDate;
  const[text,setText]=useState("");const[showAllRev,setShowAllRev]=useState(false);
  const rev=useMemo(()=>isUp?[]:makeReviews(item.id),[item.id,isUp]);
  const agg=useMemo(()=>aggScore(rev),[rev]);
  const sc=parseFloat(agg.avg);const sC=sc>=4?"#2EC4B6":sc>=3?"#F9A620":"#E84855";
  const maxD=Math.max(...agg.dist,1);const shown=showAllRev?rev:rev.slice(0,3);
  const rating=ratings[item.id]||0;const status=statuses[item.id];const prog=progress[item.id]||0;
  const userRev=userReviews[item.id];const recTag=recTags[item.id];

  const liked=rating>=4;const disliked=rating>0&&rating<=2;
  const simSame=useMemo(()=>getSimilar(item,ITEMS,"same"),[item.id]);
  const simCross=useMemo(()=>getSimilar(item,ITEMS,"cross"),[item.id]);
  const simThird=useMemo(()=>disliked?getSimilar(item,ITEMS,"different"):getSimilar(item,ITEMS,"genre"),[item.id,disliked]);

  return(
  <div style={{minHeight:"100vh",background:"#0b0b10"}}>
    {/* Hero banner */}
    <div style={{background:item.cover,height:280,position:"relative"}}>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,#0b0b10 0%,rgba(11,11,16,0.5) 40%,rgba(11,11,16,0.2) 100%)"}}/>
      <button onClick={onBack} style={{position:"absolute",top:20,left:20,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(8px)",border:"none",color:"#fff",width:40,height:40,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>←</button>
      {isUp&&<div style={{position:"absolute",top:20,right:20,background:"linear-gradient(135deg,#9B5DE5,#C45BAA)",color:"#fff",fontSize:11,fontWeight:700,padding:"6px 14px",borderRadius:12,textTransform:"uppercase",zIndex:10}}>Upcoming · {item.releaseDate}</div>}
      <div style={{position:"absolute",bottom:28,left:28,right:28,zIndex:1}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:5,background:t.color,color:"#fff",fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:16,marginBottom:10,textTransform:"uppercase"}}>{t.icon} {t.s}</div>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:900,lineHeight:1.15,margin:0}}>{item.title}</h1>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:6}}>{isUp?item.releaseDate:item.year} · {item.genre.join(" · ")}</div>
      </div>
    </div>

    <div style={{padding:"0 28px 60px",maxWidth:900,margin:"0 auto"}}>

      {/* Top section: info + review side by side on wide, stacked on narrow */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginTop:24}}>

        {/* Left: Description + People + Platforms */}
        <div>
          <p style={{fontSize:14,color:"rgba(255,255,255,0.65)",lineHeight:1.7,margin:"0 0 14px"}}>{item.desc}</p>

          {/* Vibes - clickable */}
          {getVibes(item.id).length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
              {getVibes(item.id).map(v=>{const vb=VIBES[v];return vb?(<button key={v} onClick={()=>onVibeBrowse(v)} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"5px 12px",fontSize:11,color:"rgba(255,255,255,0.6)",transition:"all 0.15s",cursor:"pointer"}}
                onMouseEnter={e=>{e.currentTarget.style.background=vb.color+"22";e.currentTarget.style.borderColor=vb.color+"44";e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";e.currentTarget.style.color="rgba(255,255,255,0.6)";}}
              ><span style={{fontSize:12}}>{vb.icon}</span>{vb.label}<span style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>→</span></button>):null;})}
            </div>
          )}

          {/* People */}
          {item.people&&item.people.length>0&&(
            <div style={{marginBottom:18}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>People</div>
              {item.people.map((p,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:`hsl(${p.name.length*29},40%,30%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{p.name[0]}</div>
                <div><div style={{fontSize:13,fontWeight:600}}>{p.name}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{p.role}</div></div>
              </div>))}
            </div>
          )}

          {/* Awards */}
          {!isUp&&item.awards&&item.awards.length>0&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
              {item.awards.map(a=>{const aw=AWARDS[a];return aw?(<div key={a} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"6px 12px",display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:14}}>{aw.icon}</span><span style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.7)"}}>{aw.short}</span></div>):null;})}
            </div>
          )}

          {/* Platforms */}
          {item.platforms&&item.platforms.length>0&&(
            <div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{isUp?"Expected on":item.type==="movie"||item.type==="tv"?"Where to watch":item.type==="game"?"Where to play":item.type==="music"||item.type==="podcast"?"Where to listen":"Where to read"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{item.platforms.map(pk=>{const pl=PLATFORMS[pk];return pl?(<button key={pk} style={{background:pl.color,color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:10,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10}}>{pl.icon}</span>{pl.name}</button>):null;})}</div>
            </div>
          )}
        </div>

        {/* Right: Rating + Review + Status */}
        <div>
          {/* External scores */}
          {!isUp&&item.ext&&Object.keys(item.ext).length>0&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
              {Object.entries(item.ext).map(([k,v])=>{const src=EXT[k];if(!src)return null;const pct=v/src.max*100;return(<div key={k} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"8px 14px",textAlign:"center",minWidth:70}}><div style={{fontSize:20,fontWeight:900,color:pct>=80?"#2EC4B6":pct>=60?"#F9A620":"#E84855",lineHeight:1}}>{v}{src.max===100?"%":""}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.3)",marginTop:2,textTransform:"uppercase"}}>{src.name}</div></div>);})}
            </div>
          )}

          {/* Community score */}
          {!isUp&&(<div style={{display:"flex",alignItems:"center",gap:16,padding:"14px 16px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,marginBottom:16}}>
            <div style={{textAlign:"center",minWidth:55}}><div style={{fontSize:28,fontWeight:900,color:sC,lineHeight:1}}>{agg.avg}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.3)",marginTop:2}}>Literacy</div></div>
            <div style={{flex:1}}>{[5,4,3,2,1].map(n=>(<div key={n} style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}><span style={{fontSize:9,color:"rgba(255,255,255,0.4)",width:8,textAlign:"right"}}>{n}</span><div style={{flex:1,height:4,background:"rgba(255,255,255,0.06)",borderRadius:2}}><div style={{width:`${(agg.dist[n-1]/maxD)*100}%`,height:"100%",background:n>=4?"#2EC4B6":n===3?"#F9A620":"#E84855",borderRadius:2}}/></div></div>))}</div>
            <div style={{width:1,height:40,background:"rgba(255,255,255,0.06)"}}/>
            <div style={{textAlign:"center",minWidth:55}}>
              <div style={{fontSize:14,marginBottom:2}}>{agg.recPct>=70?"👍":agg.recPct>=40?"🤷":"👎"}</div>
              <div style={{fontSize:22,fontWeight:900,color:agg.recPct>=70?"#2EC4B6":agg.recPct>=40?"#F9A620":"#E84855",lineHeight:1}}>{agg.recPct}%</div>
              <div style={{fontSize:8,color:"rgba(255,255,255,0.3)",marginTop:2}}>Recommend</div>
            </div>
          </div>)}

          {/* Upcoming: want count + hype meter */}
          {isUp&&item.wantCount&&(<div style={{marginBottom:16}}>
            <div style={{background:"linear-gradient(135deg,rgba(155,93,229,0.1),rgba(196,91,170,0.1))",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"16px",textAlign:"center",marginBottom:10}}>
              <div style={{fontSize:28,fontWeight:900,color:"#9B5DE5"}}>{item.wantCount.toLocaleString()}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2}}>people want this on Literacy</div>
            </div>
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"14px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:1}}>Hype Score</span>
                <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:14}}>🔥</span><span style={{fontSize:22,fontWeight:900,color:"#F9A620"}}>{Math.min(99,Math.round(item.wantCount/100))}</span><span style={{fontSize:10,color:"rgba(255,255,255,0.25)"}}>/100</span></div>
              </div>
              <div style={{height:6,background:"rgba(255,255,255,0.06)",borderRadius:3,overflow:"hidden",marginBottom:10}}>
                <div style={{width:`${Math.min(99,Math.round(item.wantCount/100))}%`,height:"100%",background:"linear-gradient(90deg,#F9A620,#E84855)",borderRadius:3}}/>
              </div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",lineHeight:1.5}}>
                Calculated from: Literacy wishlists · social media mentions · trailer engagement · pre-order data · community anticipation
              </div>
            </div>
          </div>)}

          {/* Your rating + recommend */}
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"14px 16px",marginBottom:16}}>
            {!isUp&&(<>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:1}}>Your Rating</span>
                <Stars rating={rating} onRate={r=>onRate(item.id,r)} size={24}/>
              </div>
              {rating>0&&(<div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Would you recommend?</div>
                <RecTag value={recTag} onChange={v=>onRecTag(item.id,v)}/>
              </div>)}
              {rating>0&&!userRev&&(<div style={{display:"flex",gap:8}}>
                <textarea placeholder="Write your review..." value={text} onChange={e=>setText(e.target.value)} style={{flex:1,minHeight:60,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"#fff",padding:10,fontSize:13,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
                <button onClick={()=>{if(text.trim()){onReview(item.id,text);setText("");}}} style={{background:text.trim()?t.color:"rgba(255,255,255,0.06)",color:"#fff",border:"none",borderRadius:10,padding:"0 14px",fontSize:12,fontWeight:600,cursor:text.trim()?"pointer":"default",opacity:text.trim()?1:0.4}}>Post</button>
              </div>)}
              {userRev&&(<div style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 14px"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginBottom:3}}>YOUR REVIEW</div><p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:0,lineHeight:1.5}}>{userRev}</p></div>)}
            </>)}

            {/* Status tracking */}
            <div style={{marginTop:!isUp?14:0}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{isUp?"Add to list":"Track"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.entries(STATUSES).map(([k,st])=>{const a=status===k;return(<button key={k} onClick={()=>onStatus(item.id,a?null:k)} style={{background:a?st.color:"rgba(255,255,255,0.05)",color:a?"#fff":"rgba(255,255,255,0.45)",border:a?"none":"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10}}>{statusIcon(k,item.type)}</span>{statusLabel(k,item.type)}</button>);})}</div>
              {!isUp&&status==="in_progress"&&item.totalEp>1&&(
                <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>Progress:</span>
                  <input type="number" min={0} max={item.totalEp} value={prog} onChange={e=>onProgress(item.id,Math.max(0,Math.min(item.totalEp,parseInt(e.target.value)||0)))} style={{width:50,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,color:"#fff",padding:"3px 6px",fontSize:12,textAlign:"center",outline:"none"}}/>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>/ {item.totalEp} {PROG[item.type].unit}s</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Community reviews */}
      {!isUp&&(<div style={{marginTop:32}}>
        <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:800,marginBottom:16}}>Community Reviews</h3>
        {shown.map((rv,i)=>(<div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"14px 16px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:`hsl(${rv.name.length*37},45%,35%)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,textTransform:"uppercase"}}>{rv.name[0]}</div>
              <div><div style={{fontSize:13,fontWeight:600}}>{rv.name}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>{rv.days}d ago</div></div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <Stars rating={rv.rating} onRate={()=>{}} size={12} locked/>
              <span style={{fontSize:12}}>{rv.rec==="recommend"?"👍":rv.rec==="mixed"?"🤷":"👎"}</span>
            </div>
          </div>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.6)",lineHeight:1.5,margin:0}}>{rv.text}</p>
        </div>))}
        {rev.length>3&&<button onClick={()=>setShowAllRev(!showAllRev)} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"10px 0",width:"100%",color:"rgba(255,255,255,0.45)",cursor:"pointer",fontSize:12,marginTop:4}}>{showAllRev?"Show less":`Show all ${rev.length} reviews`}</button>}
      </div>)}

      {/* Recommendation columns */}
      {!isUp&&(<div style={{marginTop:40}}>
        <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:800,marginBottom:20}}>
          {disliked?"Try something different":"If you like this"}
        </h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
          {/* Column 1: Same media type */}
          <div>
            <div style={{fontSize:11,color:t.color,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12,display:"flex",alignItems:"center",gap:5}}>
              <span>{t.icon}</span> More {t.label}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {simSame.map(it=><MiniCard key={it.id} item={it} onSelect={onSelect}/>)}
            </div>
          </div>
          {/* Column 2: Cross-media */}
          <div>
            <div style={{fontSize:11,color:"#9B5DE5",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12,display:"flex",alignItems:"center",gap:5}}>
              <span>🔗</span> Across media
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {simCross.map(it=><MiniCard key={it.id} item={it} onSelect={onSelect}/>)}
            </div>
          </div>
          {/* Column 3: Genre deep dive OR different picks */}
          <div>
            <div style={{fontSize:11,color:disliked?"#2EC4B6":"#F9A620",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12,display:"flex",alignItems:"center",gap:5}}>
              <span>{disliked?"🔄":"◆"}</span> {disliked?"Something different":"Deep cuts"}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {simThird.map(it=><MiniCard key={it.id} item={it} onSelect={onSelect}/>)}
            </div>
          </div>
        </div>
      </div>)}
    </div>
  </div>);
}

const FAKE_USERS = [
  {id:"u1",name:"nova_sky",bio:"Sci-fi obsessive. If it has space or AI, I've consumed it.",avatar:"#E84855",isPrivate:false,ratings:{1:5,4:4,5:5,10:4,21:5,25:4,2:5,3:4},recTags:{1:"recommend",4:"mixed",5:"recommend",10:"recommend",21:"recommend",25:"recommend"},statuses:{1:"completed",4:"completed",5:"in_progress",10:"completed",21:"completed",25:"completed",2:"completed",3:"completed",102:"want_to"}},
  {id:"u2",name:"couch_critic",bio:"I review everything. Movies, games, books — nothing escapes my opinion.",avatar:"#3185FC",isPrivate:false,ratings:{13:5,27:5,29:4,17:5,9:5,14:4,22:5,6:4,28:5,12:4},recTags:{13:"recommend",27:"recommend",29:"recommend",17:"recommend",9:"recommend",14:"recommend",22:"recommend"},statuses:{13:"completed",27:"completed",29:"completed",17:"completed",9:"completed",14:"completed",22:"completed",6:"completed",28:"completed",12:"in_progress"}},
  {id:"u3",name:"pixel_pilgrim",bio:"Gamer first. Everything else second. Currently speedrunning life.",avatar:"#2EC4B6",isPrivate:false,ratings:{4:3,9:5,14:5,17:5,22:5,30:5},recTags:{4:"mixed",9:"recommend",14:"recommend",17:"recommend",22:"recommend",30:"recommend"},statuses:{4:"completed",9:"completed",14:"completed",17:"completed",22:"completed",30:"completed",102:"want_to",105:"want_to"}},
  {id:"u4",name:"chapter_one",bio:"Books and manga are the purest forms of storytelling. Fight me.",avatar:"#9B5DE5",isPrivate:false,ratings:{2:4,10:5,18:5,24:5,32:5,3:4,12:5,20:4,26:4},recTags:{10:"recommend",18:"recommend",24:"recommend",32:"recommend",12:"recommend"},statuses:{2:"completed",10:"completed",18:"completed",24:"completed",32:"completed",3:"completed",12:"in_progress",20:"in_progress",26:"completed"}},
  {id:"u5",name:"vinyl_ghost",bio:"If it's got a beat or a story, I'm in. Music head turned media omnivore.",avatar:"#F9A620",isPrivate:false,ratings:{6:5,19:5,28:5,34:5,13:4,11:5},recTags:{6:"recommend",19:"recommend",28:"recommend",34:"recommend",13:"recommend",11:"recommend"},statuses:{6:"completed",19:"completed",28:"completed",34:"completed",13:"completed",11:"completed"}},
  {id:"u6",name:"the_librarian",bio:"My collection speaks for itself.",avatar:"#C45BAA",isPrivate:true,ratings:{},recTags:{},statuses:{}},
  {id:"u7",name:"frame_by_frame",bio:"Cinema is my religion. Comics are my scripture. Arcane changed my life.",avatar:"#00BBF9",isPrivate:false,ratings:{1:5,13:5,16:4,25:5,29:5,11:5,7:5,15:4,23:5,33:4},recTags:{1:"recommend",13:"recommend",25:"recommend",29:"recommend",11:"recommend",7:"recommend",23:"recommend"},statuses:{1:"completed",13:"completed",16:"completed",25:"completed",29:"completed",11:"completed",7:"in_progress",15:"completed",23:"completed",33:"in_progress",106:"want_to"}},
];

function UserCard({user,isFollowing,onToggleFollow,onView}){
  const totalRated=Object.keys(user.ratings).length;
  const totalTracked=Object.keys(user.statuses).length;
  const topTypes={};Object.keys(user.statuses).forEach(idStr=>{const id=parseInt(idStr);const item=ALL.find(i=>i.id===id);if(item)topTypes[item.type]=(topTypes[item.type]||0)+1;});
  const sortedTypes=Object.entries(topTypes).sort((a,b)=>b[1]-a[1]).slice(0,3);
  return(
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:16,padding:"18px 20px",transition:"all 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
        <div style={{width:44,height:44,borderRadius:"50%",background:user.avatar,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,cursor:"pointer"}} onClick={()=>!user.isPrivate&&onView(user)}>{user.name[0].toUpperCase()}</div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:14,fontWeight:700,cursor:"pointer"}} onClick={()=>!user.isPrivate&&onView(user)}>{user.name}</span>
            {user.isPrivate&&<span style={{fontSize:9,color:"rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.06)",padding:"2px 6px",borderRadius:4}}>🔒 Private</span>}
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2}}>{user.bio}</div>
        </div>
        <button onClick={()=>onToggleFollow(user.id)} style={{
          background:isFollowing?"rgba(255,255,255,0.08)":"#E84855",
          color:"#fff",border:isFollowing?"1px solid rgba(255,255,255,0.12)":"none",
          borderRadius:10,padding:"7px 16px",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all 0.2s",whiteSpace:"nowrap",
        }}>{isFollowing?"Following":"Follow"}</button>
      </div>
      {!user.isPrivate&&(<div style={{display:"flex",gap:16,alignItems:"center"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.35)"}}><span style={{fontWeight:700,color:"rgba(255,255,255,0.6)"}}>{totalRated}</span> rated</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.35)"}}><span style={{fontWeight:700,color:"rgba(255,255,255,0.6)"}}>{totalTracked}</span> tracked</div>
        <div style={{display:"flex",gap:4,marginLeft:"auto"}}>{sortedTypes.map(([tp])=>(<span key={tp} style={{fontSize:14}} title={TYPES[tp]?.label}>{TYPES[tp]?.icon}</span>))}</div>
      </div>)}
    </div>
  );
}

function UserProfile({user,onBack,onSelect}){
  const ratedItems=Object.entries(user.ratings).map(([idStr,rating])=>{const item=ALL.find(i=>i.id===parseInt(idStr));return item?{...item,rating}:null;}).filter(Boolean).sort((a,b)=>b.rating-a.rating);
  const trackedItems=Object.entries(user.statuses).map(([idStr,status])=>{const item=ALL.find(i=>i.id===parseInt(idStr));return item?{...item,status}:null;}).filter(Boolean);
  const byStatus={};Object.keys(STATUSES).forEach(s=>{byStatus[s]=trackedItems.filter(i=>i.status===s);});

  return(<div style={{minHeight:"100vh",background:"#0b0b10",padding:"0 28px 60px"}}>
    <div style={{padding:"28px 0 20px",display:"flex",alignItems:"center",gap:16}}>
      <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"none",color:"#fff",width:38,height:38,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>←</button>
      <div style={{width:56,height:56,borderRadius:"50%",background:user.avatar,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800}}>{user.name[0].toUpperCase()}</div>
      <div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:800}}>{user.name}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:2}}>{user.bio}</div>
      </div>
    </div>

    {/* Stats */}
    <div style={{display:"flex",gap:12,marginBottom:28,flexWrap:"wrap"}}>
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 16px",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:20,fontWeight:700,color:"#E84855"}}>{ratedItems.length}</span><span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>rated</span></div>
      <div style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 16px",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:20,fontWeight:700,color:"#3185FC"}}>{trackedItems.length}</span><span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>tracked</span></div>
      {Object.entries(TYPES).map(([tp,meta])=>{const c=trackedItems.filter(i=>i.type===tp).length;if(!c)return null;return(<div key={tp} style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:14}}>{meta.icon}</span><span style={{fontSize:16,fontWeight:700,color:meta.color}}>{c}</span></div>);})}
    </div>

    {/* Top rated */}
    {ratedItems.length>0&&(<div style={{marginBottom:32}}>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800,marginBottom:14}}>{user.name}'s Top Rated</div>
      <div style={{display:"flex",gap:16,overflowX:"auto",paddingBottom:8,scrollbarWidth:"none"}}>
        {ratedItems.slice(0,10).map(it=>{const t=TYPES[it.type];const rec=user.recTags[it.id];return(
          <div key={it.id} onClick={()=>onSelect(it)} style={{minWidth:160,borderRadius:12,overflow:"hidden",cursor:"pointer",boxShadow:"0 3px 12px rgba(0,0,0,0.2)",flexShrink:0,transition:"transform 0.2s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
            <div style={{background:it.cover,height:190,position:"relative"}}>
              <div style={{position:"absolute",top:6,left:6,background:"rgba(0,0,0,0.55)",color:t.color,fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:5,textTransform:"uppercase"}}>{t.icon} {t.s}</div>
              <div style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.6)",color:"#f1c40f",fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:6}}>★ {it.rating}</div>
              {rec&&<div style={{position:"absolute",bottom:6,right:6,fontSize:14}}>{rec==="recommend"?"👍":rec==="mixed"?"🤷":"👎"}</div>}
            </div>
            <div style={{background:"#141419",padding:"8px 10px"}}>
              <div style={{fontSize:12,fontWeight:700,lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.title}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",marginTop:2}}>{it.year}</div>
            </div>
          </div>
        );})}
      </div>
    </div>)}

    {/* Library by status */}
    {Object.entries(STATUSES).map(([key,st])=>{
      const items=byStatus[key];if(!items||!items.length)return null;
      const ongoing_types=["tv","manga","comic","podcast"];
      return(<div key={key} style={{marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:13,color:st.color,fontWeight:700}}>{st.icon}</span>
          <span style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:800}}>{st.label}</span>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.25)"}}>{items.length}</span>
        </div>
        <div style={{display:"flex",gap:14,overflowX:"auto",paddingBottom:8,scrollbarWidth:"none"}}>
          {items.map(it=>{const tp=TYPES[it.type];return(
            <div key={it.id} onClick={()=>onSelect(it)} style={{minWidth:130,borderRadius:10,overflow:"hidden",cursor:"pointer",boxShadow:"0 2px 10px rgba(0,0,0,0.2)",flexShrink:0}}>
              <div style={{background:it.cover,height:160,position:"relative"}}>
                <div style={{position:"absolute",top:5,left:5,background:"rgba(0,0,0,0.55)",color:tp.color,fontSize:7,fontWeight:700,padding:"2px 5px",borderRadius:4,textTransform:"uppercase"}}>{tp.icon}</div>
              </div>
              <div style={{background:"#141419",padding:"6px 8px"}}>
                <div style={{fontSize:10,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.title}</div>
              </div>
            </div>
          );})}
        </div>
      </div>);
    })}
  </div>);
}

/* ═══ VIBE BROWSE PAGE ═══ */
function VibeBrowse({vibeKey,onBack,onSelect}){
  const vb=VIBES[vibeKey];if(!vb)return null;
  const allMatching=ALL.filter(i=>getVibes(i.id).includes(vibeKey));
  const byType={};Object.keys(TYPES).forEach(tp=>{const items=allMatching.filter(i=>i.type===tp);if(items.length)byType[tp]=items;});
  const relatedVibes=Object.keys(VIBES).filter(v=>v!==vibeKey&&allMatching.some(i=>getVibes(i.id).includes(v))).slice(0,6);

  return(<div style={{minHeight:"100vh",background:"#0b0b10",fontFamily:"'DM Sans',sans-serif",color:"#fff"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>

    {/* Hero */}
    <div style={{background:`linear-gradient(135deg, ${vb.color}15, ${vb.color}08, transparent)`,padding:"28px 28px 32px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
      <button onClick={onBack} style={{background:"rgba(255,255,255,0.06)",border:"none",color:"#fff",width:38,height:38,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20}}>←</button>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <span style={{fontSize:48}}>{vb.icon}</span>
        <div>
          <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:900,margin:0}}>{vb.label}</h1>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",margin:"4px 0 0"}}>{allMatching.length} titles across {Object.keys(byType).length} media types share this vibe</p>
        </div>
      </div>

      {/* Related vibes */}
      {relatedVibes.length>0&&(<div style={{marginTop:20}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Related vibes</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {relatedVibes.map(rv=>{const rvb=VIBES[rv];return rvb?(<button key={rv} onClick={()=>onBack(rv)} style={{
            display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"5px 12px",fontSize:11,
            color:"rgba(255,255,255,0.55)",cursor:"pointer",transition:"all 0.15s",
          }} onMouseEnter={e=>{e.currentTarget.style.background=rvb.color+"22";e.currentTarget.style.color="#fff";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.color="rgba(255,255,255,0.55)";}}>
            <span style={{fontSize:11}}>{rvb.icon}</span>{rvb.label}
          </button>):null;})}
        </div>
      </div>)}
    </div>

    {/* Rows by media type */}
    <div style={{padding:"28px 28px 60px"}}>
      {Object.entries(TYPES).map(([tp,meta])=>{
        const items=byType[tp];if(!items)return null;
        return(<div key={tp} style={{marginBottom:32}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <span style={{fontSize:16}}>{meta.icon}</span>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800}}>{meta.label}</span>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.25)"}}>{items.length}</span>
          </div>
          <div style={{display:"flex",gap:16,overflowX:"auto",paddingBottom:8,scrollbarWidth:"none"}}>
            {items.map(it=>(<div key={it.id} onClick={()=>onSelect(it)} style={{minWidth:170,borderRadius:12,overflow:"hidden",cursor:"pointer",boxShadow:"0 3px 14px rgba(0,0,0,0.25)",flexShrink:0,transition:"transform 0.2s"}}
              onMouseEnter={e=>e.currentTarget.style.transform="translateY(-3px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
              <div style={{background:it.cover,height:210,position:"relative"}}>
                <div style={{position:"absolute",top:8,left:8,background:"rgba(0,0,0,0.55)",color:meta.color,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:6,textTransform:"uppercase"}}>{meta.icon} {meta.s}</div>
                {it.releaseDate&&<div style={{position:"absolute",top:8,right:8,background:"linear-gradient(135deg,#9B5DE5,#C45BAA)",color:"#fff",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:5,textTransform:"uppercase"}}>Soon</div>}
                <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,0.8),transparent)",padding:"20px 10px 8px"}}>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{getVibes(it.id).map(v=>{const vi=VIBES[v];return vi?(<span key={v} style={{fontSize:8,color:v===vibeKey?"#fff":"rgba(255,255,255,0.4)",background:v===vibeKey?vb.color+"44":"rgba(255,255,255,0.1)",padding:"1px 5px",borderRadius:4}}>{vi.icon} {vi.label}</span>):null;})}</div>
                </div>
              </div>
              <div style={{background:"#141419",padding:"10px 10px 8px"}}>
                <div style={{fontSize:13,fontWeight:700,lineHeight:1.2,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.title}</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>{it.releaseDate||it.year} · {it.genre.slice(0,2).join(", ")}</div>
              </div>
            </div>))}
          </div>
        </div>);
      })}
    </div>
  </div>);
}

function Filters({types,genres,onType,onGenre}){const[showG,setShowG]=useState(false);const allG=["Sci-Fi","Fantasy","Horror","Drama","Comedy","Action","Romance","Mystery","Thriller","Adventure","Indie","Documentary"];return(<div style={{marginBottom:24}}><div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:10}}>{Object.entries(TYPES).map(([k,v])=>(<button key={k} onClick={()=>onType(k)} style={{background:types.includes(k)?v.color:"rgba(255,255,255,0.05)",color:types.includes(k)?"#fff":"rgba(255,255,255,0.5)",border:"none",borderRadius:18,padding:"6px 13px",fontSize:11,fontWeight:600,cursor:"pointer"}}>{v.icon} {v.label}</button>))}</div><button onClick={()=>setShowG(!showG)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:11,padding:0,marginBottom:showG?7:0}}>{showG?"▾ Hide genres":"▸ Filter by genre"}</button>{showG&&(<div style={{display:"flex",flexWrap:"wrap",gap:5}}>{allG.map(g=>(<button key={g} onClick={()=>onGenre(g)} style={{background:genres.includes(g)?"rgba(255,255,255,0.14)":"rgba(255,255,255,0.04)",color:genres.includes(g)?"#fff":"rgba(255,255,255,0.4)",border:genres.includes(g)?"1px solid rgba(255,255,255,0.2)":"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"4px 11px",fontSize:11,cursor:"pointer"}}>{g}</button>))}</div>)}</div>);}

/* ═══ APP ═══ */
export default function App(){
  const[tab,setTab]=useState("foryou");const[ratings,setRatings]=useState({});const[statuses,setStatuses]=useState({});const[progress,setProgress]=useState({});const[reviews,setReviews]=useState({});const[recTags,setRecTags]=useState({});
  const[sel,setSel]=useState(null);const[detailItem,setDetailItem]=useState(null);const[viewUser,setViewUser]=useState(null);
  const[fTypes,setFTypes]=useState([]);const[fGenres,setFGenres]=useState([]);const[search,setSearch]=useState("");
  const[libFTypes,setLibFTypes]=useState([]);const[libFGenres,setLibFGenres]=useState([]);
  const[exploreMode,setExploreMode]=useState("all");const[following,setFollowing]=useState([]);const[peopleSearch,setPeopleSearch]=useState("");const[fVibe,setFVibe]=useState(null);const[browseVibe,setBrowseVibe]=useState(null);

  const rate=useCallback((id,v)=>setRatings(p=>({...p,[id]:v})),[]);
  const setStatus=useCallback((id,s)=>setStatuses(p=>({...p,[id]:s})),[]);
  const setProg=useCallback((id,v)=>setProgress(p=>({...p,[id]:v})),[]);
  const review=useCallback((id,t)=>setReviews(p=>({...p,[id]:t})),[]);
  const setRecTag=useCallback((id,v)=>setRecTags(p=>({...p,[id]:v})),[]);

  const openDetail=(item)=>{setDetailItem(item);setViewUser(null);window.scrollTo(0,0);};
  const closeDetail=()=>setDetailItem(null);
  const toggleFollow=(uid)=>setFollowing(p=>p.includes(uid)?p.filter(x=>x!==uid):[...p,uid]);

  const itemsWithData=ITEMS.map(i=>({...i,rating:ratings[i.id]||0}));const rated=itemsWithData.filter(i=>i.rating>0);
  const recs=useMemo(()=>getRecs(rated,itemsWithData),[ratings]);
  const byType={};Object.keys(TYPES).forEach(tp=>{byType[tp]=ITEMS.filter(i=>i.type===tp);});
  const genreMap={};["Sci-Fi","Fantasy","Horror","Drama","Action","Mystery"].forEach(g=>{const gi=ITEMS.filter(i=>i.genre.includes(g));if(gi.length>=3)genreMap[g]=gi;});
  const topGenres=Object.entries(genreMap).sort((a,b)=>b[1].length-a[1].length).slice(0,4);
  const recsByType={};recs.forEach(r=>{if(!recsByType[r.type])recsByType[r.type]=[];recsByType[r.type].push(r);});
  const explore=ALL.filter(i=>{if(fTypes.length&&!fTypes.includes(i.type))return false;if(fGenres.length&&!i.genre.some(g=>fGenres.includes(g)))return false;if(search&&!i.title.toLowerCase().includes(search.toLowerCase()))return false;return true;});
  const tracked=ALL.filter(i=>statuses[i.id]);const libGroups={};Object.keys(STATUSES).forEach(s=>{libGroups[s]=tracked.filter(i=>statuses[i.id]===s);});
  const tog=(arr,set,v)=>set(arr.includes(v)?arr.filter(x=>x!==v):[...arr,v]);
  const tabs=[{id:"foryou",label:"For You",icon:"✦"},{id:"explore",label:"Explore",icon:"◎"},{id:"library",label:"Library",icon:"▤"},{id:"people",label:"People",icon:"◉"}];

  // If browsing a vibe
  if(browseVibe)return(<VibeBrowse vibeKey={browseVibe}
    onBack={(newVibe)=>{if(typeof newVibe==="string"){setBrowseVibe(newVibe);window.scrollTo(0,0);}else{setBrowseVibe(null);}}}
    onSelect={(it)=>{setBrowseVibe(null);openDetail(it);}}/>);

  // If viewing a user profile
  if(viewUser)return(<div style={{fontFamily:"'DM Sans',sans-serif",color:"#fff"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>
    <UserProfile user={viewUser} onBack={()=>setViewUser(null)} onSelect={(it)=>{setViewUser(null);openDetail(it);}}/>
  </div>);

  // If detail page is open, show that instead
  if(detailItem)return(<div style={{fontFamily:"'DM Sans',sans-serif",color:"#fff"}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>
    <DetailPage item={detailItem} ratings={ratings} statuses={statuses} progress={progress} recTags={recTags} reviews={reviews}
      onRate={rate} onStatus={setStatus} onProgress={setProg} onRecTag={setRecTag} onReview={review} onBack={closeDetail}
      onSelect={(it)=>{setDetailItem(it);window.scrollTo(0,0);}}
      onVibeBrowse={(v)=>{setDetailItem(null);setBrowseVibe(v);window.scrollTo(0,0);}}/>
  </div>);

  return(<div style={{minHeight:"100vh",background:"#0b0b10",fontFamily:"'DM Sans',sans-serif",color:"#fff"}}>
  <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}`}</style>

  <header style={{padding:"28px 28px 0",background:"linear-gradient(180deg,rgba(232,72,85,0.06) 0%,transparent 100%)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:26}}><div><h1 style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:900,letterSpacing:"-0.5px",lineHeight:1,background:"linear-gradient(135deg,#fff,rgba(255,255,255,0.7))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Literacy</h1><div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:4,letterSpacing:"2px",textTransform:"uppercase"}}>Fluent in every medium</div></div><div style={{display:"flex",alignItems:"center",gap:14}}><div style={{fontSize:11,color:"rgba(255,255,255,0.4)",textAlign:"right",lineHeight:1.4}}><span style={{color:"#E84855",fontWeight:700,fontSize:17}}>{tracked.length}</span><br/>tracked</div><div style={{width:38,height:38,borderRadius:"50%",background:"linear-gradient(135deg,#E84855,#C45BAA)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700}}>L</div></div></div>
    <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>{tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",color:tab===t.id?"#fff":"rgba(255,255,255,0.35)",padding:"11px 18px",fontSize:13,fontWeight:tab===t.id?700:500,cursor:"pointer",borderBottom:tab===t.id?"2px solid #E84855":"2px solid transparent",display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:13}}>{t.icon}</span> {t.label}</button>))}</div>
  </header>

  <main style={{padding:"26px 28px 80px"}}>
    {tab==="foryou"&&(<div>
      {rated.length===0&&(<div style={{background:"linear-gradient(135deg,rgba(232,72,85,0.08),rgba(49,133,252,0.08),rgba(46,196,182,0.08))",border:"1px solid rgba(255,255,255,0.06)",borderRadius:18,padding:"30px 24px",marginBottom:32,textAlign:"center"}}><div style={{fontSize:36,marginBottom:10}}>📚 🎬 🎮 🎵</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:800,marginBottom:6}}>Rate anything. Discover everything.</div><div style={{fontSize:13,color:"rgba(255,255,255,0.4)",maxWidth:400,margin:"0 auto",lineHeight:1.6}}>Rate below and Literacy will find connections across media you'd never expect.</div></div>)}
      {rated.length>0&&recs.length>0&&(<>{Object.entries(recsByType).map(([tp,items])=>(<ScrollRow key={tp} label={"Recommended "+TYPES[tp].label} sub="Based on your taste" icon={TYPES[tp].icon} bg={TYPES[tp].color+"22"}>{items.map(it=><Card key={it.id} item={it} ratings={ratings} statuses={statuses} onRate={rate} onSelect={openDetail}/>)}</ScrollRow>))}</>)}
      <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",letterSpacing:2,fontWeight:600,marginBottom:20}}>🔥 Coming soon</div>
      <ScrollRow label="Upcoming Releases" sub={UPCOMING.length+" on the horizon"} icon="🗓" bg="rgba(155,93,229,0.15)">{UPCOMING.sort((a,b)=>(b.wantCount||0)-(a.wantCount||0)).map(it=><Card key={it.id} item={it} ratings={ratings} statuses={statuses} onRate={rate} onSelect={openDetail}/>)}</ScrollRow>
      <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",letterSpacing:2,fontWeight:600,marginBottom:20,borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:24}}>Browse by media</div>
      {Object.entries(TYPES).map(([tp,meta])=>{const items=byType[tp];if(!items||!items.length)return null;return(<ScrollRow key={tp} label={meta.label} sub={items.length+" titles"} icon={meta.icon} bg={meta.color+"22"}>{items.map(it=><Card key={it.id} item={it} ratings={ratings} statuses={statuses} onRate={rate} onSelect={openDetail}/>)}</ScrollRow>);})}
      <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",letterSpacing:2,fontWeight:600,marginBottom:20,borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:24}}>Popular genres</div>
      {topGenres.map(([genre,items])=>(<ScrollRow key={genre} label={genre} sub={items.length+" across all media"} icon="◆">{items.map(it=><Card key={it.id} item={it} ratings={ratings} statuses={statuses} onRate={rate} onSelect={openDetail}/>)}</ScrollRow>))}
    </div>)}

    {tab==="explore"&&(<div>
      <div style={{position:"relative",marginBottom:20}}><input type="text" placeholder="Search everything..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:"12px 18px 12px 40px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,color:"#fff",fontSize:14,outline:"none"}}/><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:15,opacity:0.3}}>⌕</span></div>
      {!search&&(<div style={{display:"flex",gap:8,marginBottom:24}}>{[["all","All"],["type","By Media"],["genre","By Genre"],["vibe","By Vibe"]].map(([k,l])=>(<button key={k} onClick={()=>setExploreMode(k)} style={{background:exploreMode===k?"rgba(255,255,255,0.12)":"rgba(255,255,255,0.04)",color:exploreMode===k?"#fff":"rgba(255,255,255,0.4)",border:exploreMode===k?"1px solid rgba(255,255,255,0.15)":"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}</button>))}</div>)}
      {(search||exploreMode==="all")&&(<>{!search&&<Filters types={fTypes} genres={fGenres} onType={v=>tog(fTypes,setFTypes,v)} onGenre={v=>tog(fGenres,setFGenres,v)}/>}<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:16}}>{explore.map(it=><Card key={it.id} item={it} ratings={ratings} statuses={statuses} onRate={rate} onSelect={openDetail}/>)}</div>{!explore.length&&<div style={{textAlign:"center",padding:"40px",color:"rgba(255,255,255,0.3)"}}>No results.</div>}</>)}
      {!search&&exploreMode==="type"&&(<div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:28}}>{Object.entries(TYPES).map(([k,v])=>{const c=ALL.filter(i=>i.type===k).length;return(<button key={k} onClick={()=>setFTypes(fTypes.includes(k)?[]:[k])} style={{background:fTypes.includes(k)?v.color:"rgba(255,255,255,0.03)",border:fTypes.includes(k)?"none":"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"16px 14px",cursor:"pointer",textAlign:"left"}}><div style={{fontSize:24,marginBottom:6}}>{v.icon}</div><div style={{fontSize:13,fontWeight:700,color:fTypes.includes(k)?"#fff":"rgba(255,255,255,0.75)",marginBottom:2}}>{v.label}</div><div style={{fontSize:10,color:fTypes.includes(k)?"rgba(255,255,255,0.7)":"rgba(255,255,255,0.3)"}}>{c} titles</div></button>);})}</div>{fTypes.length>0&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:16}}>{ALL.filter(i=>i.type===fTypes[0]).map(it=><Card key={it.id} item={it} ratings={ratings} statuses={statuses} onRate={rate} onSelect={openDetail}/>)}</div>)}</div>)}
      {!search&&exploreMode==="genre"&&(<div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:28}}>{"Sci-Fi,Fantasy,Horror,Drama,Comedy,Action,Romance,Mystery,Thriller,Adventure,Indie,Documentary".split(",").map(g=>{const c=ALL.filter(i=>i.genre.includes(g)).length;if(!c)return null;return(<button key={g} onClick={()=>setFGenres(fGenres.includes(g)?[]:[g])} style={{background:fGenres.includes(g)?"rgba(255,255,255,0.14)":"rgba(255,255,255,0.03)",border:fGenres.includes(g)?"1px solid rgba(255,255,255,0.25)":"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"14px",cursor:"pointer",textAlign:"left"}}><div style={{fontSize:13,fontWeight:700,color:fGenres.includes(g)?"#fff":"rgba(255,255,255,0.75)",marginBottom:2}}>{g}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>{c} titles</div></button>);})}</div>{fGenres.length>0&&(<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:16}}>{ALL.filter(i=>i.genre.includes(fGenres[0])).map(it=><Card key={it.id} item={it} ratings={ratings} statuses={statuses} onRate={rate} onSelect={openDetail}/>)}</div>)}</div>)}

      {/* By Vibe */}
      {!search&&exploreMode==="vibe"&&(<div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:28}}>
          {Object.entries(VIBES).map(([k,v])=>{
            const c=ALL.filter(i=>getVibes(i.id).includes(k)).length;
            if(!c)return null;
            const sel=fVibe===k;
            return(<button key={k} onClick={()=>setFVibe(sel?null:k)} style={{
              background:sel?v.color+"22":"rgba(255,255,255,0.03)",
              border:sel?`1px solid ${v.color}55`:"1px solid rgba(255,255,255,0.06)",
              borderRadius:14,padding:"14px",cursor:"pointer",textAlign:"left",transition:"all 0.2s",
            }}
              onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="rgba(255,255,255,0.06)";}}
              onMouseLeave={e=>{if(!sel)e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
              <div style={{fontSize:20,marginBottom:4}}>{v.icon}</div>
              <div style={{fontSize:13,fontWeight:700,color:sel?"#fff":"rgba(255,255,255,0.75)",marginBottom:2}}>{v.label}</div>
              <div style={{fontSize:10,color:sel?`${v.color}`:"rgba(255,255,255,0.3)"}}>{c} titles</div>
            </button>);
          })}
        </div>
        {fVibe&&(<div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:800,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20}}>{VIBES[fVibe]?.icon}</span> {VIBES[fVibe]?.label}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:16}}>
            {ALL.filter(i=>getVibes(i.id).includes(fVibe)).map(it=><Card key={it.id} item={it} ratings={ratings} statuses={statuses} onRate={rate} onSelect={openDetail}/>)}
          </div>
        </div>)}
        {!fVibe&&<div style={{textAlign:"center",padding:"20px",color:"rgba(255,255,255,0.3)",fontSize:13}}>Tap a vibe to discover media that matches the mood</div>}
      </div>)}
    </div>)}

    {tab==="library"&&(<div>
      {!tracked.length?(<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:44,marginBottom:14}}>📝</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:800,marginBottom:6}}>Nothing tracked yet</div><div style={{fontSize:13,color:"rgba(255,255,255,0.4)",maxWidth:340,margin:"0 auto",lineHeight:1.6}}>Open any item and add it to your library.</div></div>
      ):(<>
      <div style={{marginBottom:20}}><h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:800,marginBottom:4}}>Your library</h2><p style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>{tracked.length} tracked</p></div>
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>{Object.entries(STATUSES).map(([key,st])=>{const c=libGroups[key].length;if(!c)return null;return(<div key={key} style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:13,color:st.color}}>{st.icon}</span><span style={{fontSize:18,fontWeight:700,color:st.color}}>{c}</span><span style={{fontSize:10,color:"rgba(255,255,255,0.4)"}}>{st.label}</span></div>);})}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:20}}>{Object.entries(TYPES).map(([k,v])=>{const c=tracked.filter(i=>i.type===k).length;const a=libFTypes.includes(k);return(<button key={k} onClick={()=>setLibFTypes(p=>p.includes(k)?p.filter(x=>x!==k):[...p,k])} style={{background:a?v.color:c?"rgba(255,255,255,0.05)":"rgba(255,255,255,0.02)",color:a?"#fff":c?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.2)",border:"none",borderRadius:12,padding:"6px 12px",fontSize:10,fontWeight:600,cursor:c?"pointer":"default",opacity:c?1:0.5,display:"flex",alignItems:"center",gap:3}}><span style={{fontSize:10}}>{v.icon}</span>{v.label}{c>0&&<span style={{fontSize:9,opacity:0.6}}>({c})</span>}</button>);})}{libFTypes.length>0&&<button onClick={()=>setLibFTypes([])} style={{background:"none",border:"none",color:"rgba(255,255,255,0.35)",cursor:"pointer",fontSize:10}}>✕</button>}</div>
      {Object.entries(STATUSES).map(([key,st])=>{let items=libGroups[key];if(libFTypes.length)items=items.filter(i=>libFTypes.includes(i.type));if(!items.length&&!libGroups[key].length)return null;if(!items.length)return null;return(<div key={key} style={{marginBottom:32}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><span style={{fontSize:14,color:st.color,fontWeight:700}}>{st.icon}</span><span style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:800}}>{st.label}</span><span style={{fontSize:12,color:"rgba(255,255,255,0.25)"}}>{items.length}</span></div><div style={{display:"flex",gap:16,overflowX:"auto",paddingBottom:8,scrollbarWidth:"none"}}>{items.map(it=>{const pr=progress[it.id]||0;const pct=it.totalEp>1?Math.round((pr/it.totalEp)*100):null;return(<div key={it.id} style={{minWidth:190,maxWidth:190,flexShrink:0}}><Card item={it} ratings={ratings} statuses={statuses} onRate={rate} onSelect={openDetail}/>{key==="in_progress"&&pct!==null&&(<div style={{marginTop:6}}><div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:"#3185FC",borderRadius:2}}/></div><div style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginTop:3}}>{pr}/{it.totalEp} {PROG[it.type].unit}s · {pct}%</div></div>)}</div>);})}</div></div>);})}
      </>)}
    </div>)}

    {tab==="people"&&(<div>

      {/* Top row: Search + Activity side by side */}
      <div style={{display:"grid",gridTemplateColumns:following.length>0?"1fr 1fr":"1fr",gap:24,marginBottom:28}}>

        {/* Left column: Search + Following */}
        <div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:800,marginBottom:4}}>Find Reviewers</h2>
          <p style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginBottom:14}}>Search for people or browse reviewers with similar taste</p>
          <div style={{position:"relative",marginBottom:16}}>
            <input type="text" placeholder="Search by username..." value={peopleSearch} onChange={e=>setPeopleSearch(e.target.value)}
              style={{width:"100%",padding:"13px 18px 13px 42px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,color:"#fff",fontSize:14,outline:"none"}}/>
            <span style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",fontSize:15,opacity:0.3}}>⌕</span>
          </div>
          {peopleSearch&&(<div style={{display:"flex",flexDirection:"column",gap:10}}>
            {FAKE_USERS.filter(u=>u.name.toLowerCase().includes(peopleSearch.toLowerCase())).map(u=>(
              <UserCard key={u.id} user={u} isFollowing={following.includes(u.id)} onToggleFollow={toggleFollow} onView={setViewUser}/>
            ))}
            {FAKE_USERS.filter(u=>u.name.toLowerCase().includes(peopleSearch.toLowerCase())).length===0&&(
              <div style={{textAlign:"center",padding:"20px",color:"rgba(255,255,255,0.3)",fontSize:13}}>No users found</div>
            )}
          </div>)}
          {!peopleSearch&&following.length>0&&(<div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",textTransform:"uppercase",letterSpacing:2,fontWeight:600,marginBottom:10}}>Following · {following.length}</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {FAKE_USERS.filter(u=>following.includes(u.id)).map(u=>(
                <div key={u.id} onClick={()=>!u.isPrivate&&setViewUser(u)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,minWidth:60,cursor:u.isPrivate?"default":"pointer"}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:u.avatar,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,border:"2px solid rgba(255,255,255,0.1)"}}>{u.name[0].toUpperCase()}</div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.45)",textAlign:"center",maxWidth:60,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}</div>
                </div>
              ))}
            </div>
          </div>)}
        </div>

        {/* Right column: Activity Feed — equally prominent */}
        {following.length>0&&(<div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:800,marginBottom:4}}>Activity</h2>
          <p style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginBottom:14}}>Recent reviews from people you follow</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {following.flatMap(uid=>{
              const u=FAKE_USERS.find(fu=>fu.id===uid);if(!u||u.isPrivate)return[];
              return Object.entries(u.ratings).slice(0,3).map(([idStr,rating])=>{
                const item=ALL.find(i=>i.id===parseInt(idStr));if(!item)return null;
                const rec=u.recTags[parseInt(idStr)];
                return{user:u,item,rating,rec,sortKey:parseInt(idStr)};
              }).filter(Boolean);
            }).sort((a,b)=>b.sortKey-a.sortKey).slice(0,8).map((entry,i)=>(
              <div key={i} style={{display:"flex",gap:12,alignItems:"center",padding:"11px 14px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,transition:"background 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}>
                <div style={{width:30,height:30,borderRadius:"50%",background:entry.user.avatar,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0,cursor:"pointer"}} onClick={()=>setViewUser(entry.user)}>{entry.user.name[0].toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,marginBottom:2}}>
                    <span style={{fontWeight:700,cursor:"pointer"}} onClick={()=>setViewUser(entry.user)}>{entry.user.name}</span>
                    <span style={{color:"rgba(255,255,255,0.3)"}}> reviewed </span>
                    <span style={{fontWeight:600,color:"rgba(255,255,255,0.7)",cursor:"pointer"}} onClick={()=>openDetail(entry.item)}>{entry.item.title}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:"#f1c40f",fontSize:11}}>{"★".repeat(entry.rating)}{"☆".repeat(5-entry.rating)}</span>
                    {entry.rec&&<span style={{fontSize:11}}>{entry.rec==="recommend"?"👍":entry.rec==="mixed"?"🤷":"👎"}</span>}
                    <span style={{fontSize:10,color:"rgba(255,255,255,0.2)",marginLeft:4}}>{TYPES[entry.item.type]?.icon} {TYPES[entry.item.type]?.s}</span>
                  </div>
                </div>
                <div onClick={()=>openDetail(entry.item)} style={{width:38,height:52,borderRadius:7,background:entry.item.cover,flexShrink:0,cursor:"pointer"}}/>
              </div>
            ))}
          </div>
        </div>)}
      </div>

      {/* Discover similar taste - beneath both, separated */}
      {!peopleSearch&&(<div style={{borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:24}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.25)",textTransform:"uppercase",letterSpacing:2,fontWeight:600,marginBottom:6}}>Reviewers with similar taste</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.2)",marginBottom:14}}>Based on overlapping ratings and genres</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {FAKE_USERS.filter(u=>!following.includes(u.id)).slice(0,4).map(u=>(
            <UserCard key={u.id} user={u} isFollowing={false} onToggleFollow={toggleFollow} onView={setViewUser}/>
          ))}
        </div>
      </div>)}
    </div>)}
  </main>
  </div>);
}
