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
    formats: ["image/avif", "image/webp"],
    deviceSizes: [320, 640, 750, 1080, 1920],
    imageSizes: [162, 256, 384],
  },
};

export default nextConfig;
