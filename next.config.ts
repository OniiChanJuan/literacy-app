import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    scrollRestoration: true,
  },
  images: {
    remotePatterns: [
      // Known cover image sources
      { protocol: "https", hostname: "image.tmdb.org" },           // TMDB movies/TV
      { protocol: "https", hostname: "images.igdb.com" },          // IGDB games
      { protocol: "https", hostname: "books.google.com" },         // Google Books
      { protocol: "http",  hostname: "books.google.com" },         // Google Books (http)
      { protocol: "https", hostname: "covers.openlibrary.org" },   // OpenLibrary books
      { protocol: "https", hostname: "i.scdn.co" },                // Spotify music
      { protocol: "https", hostname: "cdn.myanimelist.net" },      // MyAnimeList
      { protocol: "https", hostname: "comicvine.gamespot.com" },   // Comic Vine
      { protocol: "https", hostname: "m.media-amazon.com" },       // Amazon media
      { protocol: "https", hostname: "images-na.ssl-images-amazon.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },     // Wikipedia
      { protocol: "https", hostname: "static.wikia.nocookie.net" },// Fandom/Wikia
      // Catch-all for any other https image domains not listed above
      { protocol: "https", hostname: "**" },
    ],
    formats: ["image/webp"],
    // Card thumbnails (150px) and hero covers (120px) — imageSizes covers both
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes: [64, 96, 128, 160, 256, 384],
    // 31-day cache — cover art rarely changes; maximises cache hit rate
    minimumCacheTTL: 2678400,
    qualities: [75],
  },
};

export default nextConfig;
