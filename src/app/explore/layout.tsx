import type { Metadata } from "next";
import { SITE_TITLE_TEMPLATE } from "@/lib/site";

export const metadata: Metadata = {
  // "Explore" only — the template appends "| CrossShelf". Never put the
  // brand in a page title or it renders doubled ("… CrossShelf | CrossShelf").
  title: { default: "Explore", template: SITE_TITLE_TEMPLATE },
  description: "Browse and discover movies, TV shows, books, manga, comics, games, music, and podcasts.",
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
