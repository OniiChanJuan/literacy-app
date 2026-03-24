import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [190, 380, 640, 750, 1080],
    imageSizes: [120, 190, 256],
  },
};

export default nextConfig;
