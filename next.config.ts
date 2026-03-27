import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    scrollRestoration: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "books.google.com" },
      { protocol: "http", hostname: "**.google.com" },
    ],
    // TODO: TEMPORARY — remove unoptimized:true after April 1 when image optimization limit resets
    unoptimized: true,
    formats: ["image/webp"],
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes: [64, 96, 128, 160, 256, 384],
    minimumCacheTTL: 2678400,
    qualities: [75],
  },
};

export default nextConfig;
