import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore — CrossShelf",
  description: "Browse and discover movies, TV shows, books, manga, comics, games, music, and podcasts.",
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
