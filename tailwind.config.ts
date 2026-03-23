import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core
        background: "var(--bg-page)",
        card:       "var(--bg-card)",
        elevated:   "var(--bg-elevated)",
        accent:     "var(--accent)",
        foreground: "var(--foreground)",

        // Media types
        "media-movie":   "var(--media-movie)",
        "media-tv":      "var(--media-tv)",
        "media-book":    "var(--media-book)",
        "media-manga":   "var(--media-manga)",
        "media-comic":   "var(--media-comic)",
        "media-game":    "var(--media-game)",
        "media-music":   "var(--media-music)",
        "media-podcast": "var(--media-podcast)",

        // Scores
        "score-good": "var(--score-good)",
        "score-mid":  "var(--score-mid)",
        "score-poor": "var(--score-poor)",

        // Surfaces (for backgrounds/borders)
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        "surface-4": "var(--surface-4)",
        "surface-5": "var(--surface-5)",
        "border":    "var(--border)",
      },
      fontFamily: {
        serif: ["var(--font-serif)"],
        sans:  ["var(--font-sans)"],
      },
      borderColor: {
        DEFAULT: "var(--border)",
      },
    },
  },
  plugins: [],
};

export default config;
