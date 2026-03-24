import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "images.igdb.com" },
      { protocol: "https", hostname: "books.google.com" },
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "cdn.myanimelist.net" },
      { protocol: "https", hostname: "comicvine.gamespot.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "covers.openlibrary.org" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [190, 380, 640, 750, 1080],
    imageSizes: [120, 190, 256],
  },
};

export default nextConfig;
